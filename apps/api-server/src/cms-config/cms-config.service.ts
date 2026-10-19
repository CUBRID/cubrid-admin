import { HostService } from '@host';
import { Injectable } from '@nestjs/common';
import { ValidationError } from '@error/validation/validation-error';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import {
  GetAddBrokerInfoClientResponse,
  GetEnvClientResponse,
  GetAllSysParamClientResponse,
  ParamdumpClientResponse,
  PlandumpClientResponse,
  SetSysParamClientResponse,
  StatdumpClientResponse,
} from '@api-interfaces';
import {
  SetSysParamCmsRequest,
  BaseCmsRequest,
  GetAddBrokerInfoCmsRequest,
  BrokerSetParamCmsRequest,
} from '@type';
import { GetAddBrokerInfoCmsResponse } from '@type/cms-response/get-add-broker-info-cms-response';
import { GetEnvCmsResponse } from '@type/cms-response/get-env-cms-response';
import { GetAllSysParamCmsRequest } from '@type/cms-request/get-all-sys-param-cms-request';
import { GetAllSysParamCmsResponse } from '@type/cms-response/get-all-sys-param-cms-response';
import { ParamdumpCmsResponse } from '@type/cms-response/paramdump-cms-response';
import { PlandumpCmsResponse } from '@type/cms-response/plandump-cms-response';
import { StatdumpCmsResponse } from '@type/cms-response/statdump-cms-response';
import { LogContentContainer } from '@type/cms-response/view-log-cms-response';
import { BaseCmsResponse } from '@type/cms-response/base-cms-response';
import { BaseService, HandleCmsErrors } from '@common';
import { DatabaseUserService } from '@database/user/database-user.service';
import { resolveHostParamSchemas } from './param-schema.util';
import { ParamSchemaEntry, validateParams } from '@api-interfaces';

/**
 * Service for managing CMS environment configuration operations.
 *
 * Provides methods to retrieve environment information from CMS hosts
 * including CUBRID version, broker version, database paths, and system information.
 *
 * @category Business Services
 * @since 1.0.0
 */
@Injectable()
export class CmsConfigService extends BaseService {
  constructor(
    protected readonly hostService: HostService,
    protected readonly cmsClient: CmsHttpsClientService,
    private readonly databaseUserService: DatabaseUserService
  ) {
    super(hostService, cmsClient);
  }

  /**
   * Get environment information from a CMS host.
   * Returns domain-only data (CMS envelope removed), plus the
   * database/broker param-editor schema already resolved for this host's
   * CUBRIDVER (see `resolveHostParamSchemas`) — one round trip instead of
   * a separate schema fetch every time a param editor modal opens.
   *
   * @param userId - User ID from JWT
   * @param hostUid - Host unique identifier
   * @returns GetEnvClientResponse Environment information without CMS envelope fields
   * @throws Error if the request fails or CMS status is not success
   */
  @HandleCmsErrors()
  async getEnv(userId: string, hostUid: string): Promise<GetEnvClientResponse> {
    const cmsRequest: BaseCmsRequest = {
      task: 'getenv',
    };

    const response = await this.executeCmsRequest<BaseCmsRequest, GetEnvCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );

    const domainData = this.extractDomainData(response);
    return {
      ...domainData,
      paramSchemas: resolveHostParamSchemas(domainData.CUBRIDVER),
    };
  }

  /**
   * Get database parameters dump from a CMS host.
   * Returns domain-only data (CMS envelope removed).
   *
   * @param userId - User ID from JWT
   * @param hostUid - Host unique identifier
   * @param dbname - Database name
   * @returns ParamdumpClientResponse Database parameters without CMS envelope fields
   * @throws Error if the request fails or CMS status is not success
   */
  @HandleCmsErrors()
  async getParamDump(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<ParamdumpClientResponse> {
    await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);

    const cmsRequest: BaseCmsRequest & { dbname: string; both: 'n' } = {
      task: 'paramdump',
      both: 'n',
      dbname: dbname,
    };

    const response = await this.executeCmsRequest<
      BaseCmsRequest & { dbname: string; both: 'n' },
      ParamdumpCmsResponse
    >(userId, hostUid, cmsRequest);

    return this.extractDomainData(response);
  }

  /**
   * Get database statistics dump from a CMS host.
   * Returns domain-only data (CMS envelope removed).
   *
   * @param userId - User ID from JWT
   * @param hostUid - Host unique identifier
   * @param dbname - Database name
   * @returns StatdumpClientResponse Database statistics without CMS envelope fields
   * @throws Error if the request fails or CMS status is not success
   */
  @HandleCmsErrors()
  async getStatDump(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<StatdumpClientResponse> {
    await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);

    const cmsRequest: BaseCmsRequest & { dbname: string } = {
      task: 'statdump',
      dbname,
    };

    const response = await this.executeCmsRequest<
      BaseCmsRequest & { dbname: string },
      StatdumpCmsResponse
    >(userId, hostUid, cmsRequest);

    return this.extractDomainData(response);
  }

  /**
   * Query plan / XASL-related dump (`plandump`) from a CMS host.
   * CMS returns lines nested as `log[].line[]`; this flattens to `lines` and `text` for clients.
   *
   * @param userId - User ID from JWT
   * @param hostUid - Host unique identifier
   * @param dbname - Database name
   */
  @HandleCmsErrors()
  async getPlanDump(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<PlandumpClientResponse> {
    await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);

    const cmsRequest: BaseCmsRequest & { dbname: string } = {
      task: 'plandump',
      dbname,
    };

    const response = await this.executeCmsRequest<
      BaseCmsRequest & { dbname: string },
      PlandumpCmsResponse
    >(userId, hostUid, cmsRequest);

    const { log } = this.extractDomainData(response) as { log: LogContentContainer[] };
    const lines = this.flattenCmsLogLines(log);
    return { lines, text: lines.join('\n') };
  }

  /**
   * Get all system parameters from a configuration file on a CMS host.
   * Returns domain-only data (CMS envelope removed).
   *
   * @param userId - User ID from JWT
   * @param hostUid - Host unique identifier
   * @param confname - Configuration file name (e.g., "cubridconf", "broker.conf")
   * @returns GetAllSysParamClientResponse System parameters without CMS envelope fields
   * @throws Error if the request fails or CMS status is not success
   */
  @HandleCmsErrors()
  async getAllSystemParam(
    userId: string,
    hostUid: string,
    confname: string
  ): Promise<GetAllSysParamClientResponse> {
    const cmsRequest: GetAllSysParamCmsRequest = {
      task: 'getallsysparam',
      confname: confname,
    };

    const response = await this.executeCmsRequest<
      GetAllSysParamCmsRequest,
      GetAllSysParamCmsResponse
    >(userId, hostUid, cmsRequest);

    return this.extractDomainData(response);
  }

  /**
   * Set system parameters in a configuration file on a CMS host.
   * Returns domain-only data (CMS envelope removed).
   *
   * @param userId - User ID from JWT
   * @param hostUid - Host unique identifier
   * @param confname - Configuration file name (e.g., "cubridconf", "broker.conf")
   * @param confdata - Configuration data as array of lines
   * @returns SetSysParamClientResponse Empty object on success (CMS envelope fields removed)
   * @throws Error if the request fails or CMS status is not success
   */
  @HandleCmsErrors()
  async setSystemParam(
    userId: string,
    hostUid: string,
    confname: string,
    confdata: string[]
  ): Promise<SetSysParamClientResponse> {
    const cmsRequest: SetSysParamCmsRequest = {
      task: 'setsysparam',
      confname: confname,
      confdata: confdata,
    };

    await this.executeCmsRequest<SetSysParamCmsRequest, BaseCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );

    return { success: true };
  }

  /**
   * Get broker config file content from a CMS host (CMS task: getaddbrokerinfo).
   * Returns conflist (config lines) and confname (CMS envelope omitted).
   *
   * @param userId - User ID from JWT
   * @param hostUid - Host unique identifier
   * @param confname - Config name (e.g. "brokerconf")
   * @returns GetAddBrokerInfoClientResponse conflist, confname
   */
  @HandleCmsErrors()
  async getAddBrokerInfo(
    userId: string,
    hostUid: string,
    confname: string
  ): Promise<GetAddBrokerInfoClientResponse> {
    const cmsRequest: GetAddBrokerInfoCmsRequest = {
      task: 'getaddbrokerinfo',
      confname,
    };

    const response = await this.executeCmsRequest<
      GetAddBrokerInfoCmsRequest,
      GetAddBrokerInfoCmsResponse
    >(userId, hostUid, cmsRequest);

    const cms = response as GetAddBrokerInfoCmsResponse;
    return {
      conflist: cms.conflist,
      confname: cms.confname,
    };
  }

  /**
   * Set broker configuration file content on a CMS host (CMS task: broker_setparam).
   *
   * @param userId - User ID from JWT
   * @param hostUid - Host unique identifier
   * @param confdata - Configuration data as array of lines (broker config content)
   * @returns SetSysParamClientResponse Empty object on success
   */
  @HandleCmsErrors()
  async setBrokerParam(
    userId: string,
    hostUid: string,
    confdata: string[]
  ): Promise<SetSysParamClientResponse> {
    const cmsRequest: BrokerSetParamCmsRequest = {
      task: 'broker_setparam',
      confdata,
    };

    await this.executeCmsRequest<
      BrokerSetParamCmsRequest,
      BaseCmsResponse
    >(userId, hostUid, cmsRequest);

    return { success: true };
  }

  /**
   * Set a subset of cubrid.conf parameters for a database (or [common],
   * when `dbname` is omitted). Fetches the current conf, merges `params`
   * into the target section (preserving every other line verbatim — other
   * sections, comments, blank lines, and any untouched key in the same
   * section), and writes the merged result back. This replaces the old
   * flow where the client built the full conf-file text itself and sent
   * it as `confdata: string[]`.
   *
   * @param userId - User ID from JWT
   * @param hostUid - Host unique identifier
   * @param dbname - Target database, or undefined for the [common] section
   * @param params - Only the keys that changed; values are stringified as-is
   * @returns SetSysParamClientResponse Empty object on success
   */
  @HandleCmsErrors()
  async setDatabaseConfigParams(
    userId: string,
    hostUid: string,
    dbname: string | undefined,
    params: Record<string, string | number>
  ): Promise<SetSysParamClientResponse> {
    const { database: schema } = (await this.getEnv(userId, hostUid)).paramSchemas;
    this.assertValidParams(schema, params);

    const current = await this.getAllSystemParam(userId, hostUid, 'cubridconf');
    const lines = current.conflist?.[0]?.confdata ?? [];
    const sectionName = dbname ? `[@${dbname.toLowerCase()}]` : '[common]';
    const nextLines = this.mergeNamedSection(
      lines,
      (line) => line.trim().toLowerCase() === sectionName.toLowerCase(),
      sectionName,
      params
    );
    return this.setSystemParam(userId, hostUid, 'cubridconf', nextLines);
  }

  /**
   * Set a subset of broker.conf parameters for one broker. Same
   * fetch-merge-write shape as `setDatabaseConfigParams`, but the target
   * section is `[%brokerName]` (or the bare, no-% form some conf files
   * use) among potentially many broker sections in the file.
   *
   * @param userId - User ID from JWT
   * @param hostUid - Host unique identifier
   * @param brokerName - Target broker's section name
   * @param params - Only the keys that changed; values are stringified as-is
   * @returns SetSysParamClientResponse Empty object on success
   */
  @HandleCmsErrors()
  async setBrokerConfigParams(
    userId: string,
    hostUid: string,
    brokerName: string,
    params: Record<string, string | number>
  ): Promise<SetSysParamClientResponse> {
    const { broker: schema } = (await this.getEnv(userId, hostUid)).paramSchemas;
    this.assertValidParams(schema, params);

    const current = await this.getAddBrokerInfo(userId, hostUid, 'brokerconf');
    const lines = current.conflist?.[0]?.confdata ?? [];
    const target = brokerName.toLowerCase();
    const nextLines = this.mergeNamedSection(
      lines,
      (line) => {
        const match = line.trim().match(/^\[%?(.+)\]$/);
        return !!match && match[1].toLowerCase() === target;
      },
      `[%${brokerName}]`,
      params
    );
    return this.setBrokerParam(userId, hostUid, nextLines);
  }

  /**
   * Validates `params` against `schema` (this host's own version-resolved
   * database/broker schema — see `resolveHostParamSchemas`) and throws a
   * 400 naming every problem key if any value fails its guard, or if a
   * key isn't in the schema at all (nothing to validate it against, and
   * nowhere to write it either — most likely a param that doesn't exist
   * on this host's engine version). This is the only validation these two
   * endpoints get; there's no per-field class-validator DTO to fall back
   * on, by design — see `setDatabaseConfigParams`'s class-level comment.
   */
  private assertValidParams(schema: ParamSchemaEntry[], params: Record<string, string | number>): void {
    const { errors, unknownKeys } = validateParams(schema, params);
    const problems = [
      ...unknownKeys.map((key) => `${key}: not supported on this host's engine version`),
      ...Object.entries(errors).map(([key, reason]) => `${key}: ${reason}`),
    ];
    if (problems.length > 0) {
      // A plain NestJS HttpException here would get swallowed by
      // @HandleCmsErrors() — it only passes through this codebase's own
      // AppError subclasses unchanged, wrapping anything else into an
      // opaque 500 (confirmed live: the specific validation message was
      // lost behind a generic "CMS request failed" until this was fixed).
      // `message` in additionalData is what actually reaches the client
      // (getPublicClientErrorMessage prefers it over the generic
      // per-code copy) — without it the specific key/reason list here
      // would be silently replaced by "The field format is invalid."
      throw ValidationError.InvalidFieldFormat('params', undefined, {
        message: `Invalid parameter value(s): ${problems.join('; ')}`,
      });
    }
  }

  /**
   * Shared merge primitive for both conf writers above: finds the section
   * whose header line satisfies `isTargetHeader` (creating it at the end
   * of the file if it doesn't exist yet), then for each key in `params`
   * either overwrites that key's existing `key=value` line within the
   * section (matched case-insensitively, comments skipped) or appends a
   * new line for it. Every other line — other sections, comments, blank
   * lines, and any key in this section NOT present in `params` — is left
   * completely untouched, so blank-line count/position and overall line
   * order are preserved exactly as-is.
   *
   * Key lookup is a single O(section-length) index pass up front (a
   * lowercased key -> line-index(es) map), then O(1) per param — not a
   * fresh scan of the section for every param — since both conf files can
   * run into the hundreds of lines.
   *
   * That same index also surfaces pre-existing duplicate `key=value`
   * lines for a key (a malformed-but-real possibility in hand-edited conf
   * files). The old first-match-wins scan would silently update only the
   * first occurrence and leave a stale duplicate behind — and since
   * CMS's own conf parser isn't guaranteed to agree on which occurrence
   * wins, that stale duplicate could make the save appear to succeed while
   * the engine keeps using the old value. All occurrences are updated
   * together instead, with a warning logged so the underlying duplicate
   * (a pre-existing data issue, not something this merge introduces) stays
   * visible.
   */
  private mergeNamedSection(
    lines: string[],
    isTargetHeader: (line: string) => boolean,
    newHeaderLine: string,
    params: Record<string, string | number>
  ): string[] {
    let sectionStartIndex = -1;
    let sectionEndIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (isTargetHeader(lines[i])) {
        sectionStartIndex = i;
        for (let j = i + 1; j < lines.length; j++) {
          const trimmed = lines[j].trim();
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            sectionEndIndex = j;
            break;
          }
        }
        if (sectionEndIndex === -1) sectionEndIndex = lines.length;
        break;
      }
    }

    let workingLines = lines;
    if (sectionStartIndex === -1) {
      workingLines = [...lines, '', newHeaderLine];
      sectionStartIndex = workingLines.length - 1;
      sectionEndIndex = workingLines.length;
    }

    const sectionLines = workingLines.slice(sectionStartIndex + 1, sectionEndIndex);
    const otherBefore = workingLines.slice(0, sectionStartIndex + 1);
    const otherAfter = workingLines.slice(sectionEndIndex);
    const updatedSection = [...sectionLines];

    const keyLineIndices = new Map<string, number[]>();
    for (let i = 0; i < updatedSection.length; i++) {
      const trimmed = updatedSection[i].trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim().toLowerCase();
      const indices = keyLineIndices.get(key);
      if (indices) indices.push(i);
      else keyLineIndices.set(key, [i]);
    }

    for (const [key, value] of Object.entries(params)) {
      const indices = keyLineIndices.get(key.toLowerCase());
      if (!indices) {
        updatedSection.push(`${key}=${value}`);
        continue;
      }
      if (indices.length > 1) {
        this.logger.warn(
          `Duplicate key "${key}" found in conf section (${indices.length} occurrences) — updating all to keep the file consistent.`,
          'CmsConfigService'
        );
      }
      for (const i of indices) {
        updatedSection[i] = `${key}=${value}`;
      }
    }

    return [...otherBefore, ...updatedSection, ...otherAfter];
  }

  private flattenCmsLogLines(log: LogContentContainer[] | undefined): string[] {
    const lines: string[] = [];
    for (const block of log ?? []) {
      if (Array.isArray(block?.line)) {
        lines.push(...block.line);
      }
    }
    return lines;
  }
}
