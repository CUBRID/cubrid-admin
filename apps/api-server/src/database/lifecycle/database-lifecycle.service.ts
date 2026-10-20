import {
  CreateDatabaseClientRequest,
  CreateDatabaseClientResponse,
  CreateDatabaseWithConfigRequest,
  CreateDatabaseWithConfigResponse,
  DatabaseVolumeInfoClientResponse,
  DeleteDatabaseRequest,
  StartInfoClientResponse,
} from '@api-interfaces';
import { GetCreatedbInfoClientResponse } from '@api-interfaces/response/get-createdb-info-client-response';
import { CmsConfigService } from '@cms-config/cms-config.service';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { BaseService, HandleCmsErrors } from '@common';
import { ConfigError } from '@error/config/config-error';
import { ConfigErrorCode } from '@error/config/config-error-code';
import { DatabaseError } from '@error/database/database-error';
import { CmsError, CmsErrorCode, HostError } from '@error/index';
import { getHost } from '@host/host-group.util';
import { ValidationError } from '@error/validation/validation-error';
import { FileService } from '@file/file.service';
import { HaService } from '@ha';
import { HostService } from '@host';
import { Injectable } from '@nestjs/common';
import { UserRepositoryService } from '@repository';
import { BaseCmsResponse } from '@type';
import { DatabaseInfoService } from '../info/database-info.service';
import { DatabaseUserService } from '../user/database-user.service';
import { DatabaseConfigService } from '../config/database-config.service';
import { CMS_CONFNAME_CUBRID } from '@database/database.constants';
import {
  CreateDatabaseCmsRequest,
  DeleteDatabaseCmsRequest,
  DbSpaceInfoCmsRequest,
  StartDatabaseCmsRequest,
  StopDatabaseCmsRequest,
} from '@type/cms-request';
import {
  CreateDatabaseCmsResponse,
  DeleteDatabaseCmsResponse,
  DbSpaceInfoCmsResponse,
} from '@type/cms-response';
import { convertExvolArrayToCmsFormat, isHostHaModeOnFromCubridConf } from '@util';

/**
 * Service for managing database lifecycle operations.
 * Handles database start, stop, restart, creation, profile management, and space information.
 *
 * @category Business Services
 * @since 1.0.0
 */
@Injectable()
export class DatabaseLifecycleService extends BaseService {
  constructor(
    protected readonly hostService: HostService,
    protected readonly cmsClient: CmsHttpsClientService,
    private readonly repository: UserRepositoryService,
    private readonly cmsConfigService: CmsConfigService,
    private readonly fileService: FileService,
    private readonly databaseUserService: DatabaseUserService,
    private readonly databaseConfigService: DatabaseConfigService,
    private readonly databaseInfoService: DatabaseInfoService,
    private readonly haService: HaService
  ) {
    super(hostService, cmsClient);
  }

  /** Delegates to DatabaseInfoService. */
  async startInfo(userId: string, hostUid: string): Promise<StartInfoClientResponse> {
    return this.databaseInfoService.startInfo(userId, hostUid);
  }

  /** Delegates to DatabaseInfoService. */
  async getCreatedbInfo(userId: string, hostUid: string): Promise<GetCreatedbInfoClientResponse> {
    return this.databaseInfoService.getCreatedbInfo(userId, hostUid);
  }

  /**
   * Non-HA path: CMS `startdb`.
   */
  private async startNonHaDatabase(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<BaseCmsResponse> {
    return this.executeCmsRequest<StartDatabaseCmsRequest & { task: 'startdb' }, BaseCmsResponse>(
      userId,
      hostUid,
      { task: 'startdb', dbname }
    );
  }

  /**
   * Non-HA path: CMS `stopdb`.
   */
  private async stopNonHaDatabase(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<BaseCmsResponse> {
    return this.executeCmsRequest<StopDatabaseCmsRequest & { task: 'stopdb' }, BaseCmsResponse>(
      userId,
      hostUid,
      { task: 'stopdb', dbname }
    );
  }

  /**
   * Start a database on a host. Uses `ha_start` when server-side HA detection says this DB is HA.
   * Rule: this DB must appear in `[common]` `ha_db_list` in cubrid_ha.conf (`haconf`).
   * Otherwise uses `startdb`.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name to start
   * @returns Latest start info (StartInfoClientResponse) on success
   * @throws CmsError If CMS status is not success (including `ha_start`)
   */

  @HandleCmsErrors()
  async startDatabase(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<StartInfoClientResponse> {
    const useHa = await this.databaseInfoService.effectiveHaDbForDbname(userId, hostUid, dbname);
    if (useHa) {
      await this.haService.haStart(userId, hostUid, dbname);
    } else {
      await this.startNonHaDatabase(userId, hostUid, dbname);
    }

    return await this.databaseInfoService.startInfo(userId, hostUid);
  }

  /**
   * Stop a database on a host. Uses `ha_stop` when server-side HA detection says this DB is HA.
   * Rule: this DB must appear in `[common]` `ha_db_list` in cubrid_ha.conf (`haconf`).
   * Otherwise uses `stopdb`.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name to stop
   * @returns Latest start info (StartInfoClientResponse) on success
   * @throws DatabaseError If CMS status is fail (including `ha_stop` path)
   */
  @HandleCmsErrors()
  async stopDatabase(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<StartInfoClientResponse> {
    const useHa = await this.databaseInfoService.effectiveHaDbForDbname(userId, hostUid, dbname);
    if (useHa) {
      await this.haService.haStop(userId, hostUid, dbname);
    } else {
      try {
        await this.stopNonHaDatabase(userId, hostUid, dbname);
      } catch (error) {
        if (!this.isAmbiguousStopError(error)) {
          throw error;
        }
        for (let i = 0; i < 6; i++) {
          await new Promise((res) => setTimeout(res, 2500));
          const latestInfo = await this.databaseInfoService.startInfo(userId, hostUid).catch(() => null);
          const active = latestInfo?.activelist?.active;
          // A failed/malformed status read means unknown, not stopped. Only a
          // valid active list can confirm that a timed-out stop actually worked.
          if (!Array.isArray(active) || !active.every((a) =>
            typeof a === 'string' ? a.length > 0 : typeof a?.dbname === 'string' && a.dbname.length > 0
          )) continue;
          const stillActive = active.some(
            (a) => (typeof a === 'string' ? a : a.dbname) === dbname
          );
          if (!stillActive) return latestInfo!;
        }
        // Preserve the original stop error; never retry the stop command.
        throw error;
      }
    }

    return await this.databaseInfoService.startInfo(userId, hostUid);
  }

  /**
   * Determines whether an error encountered during database stop is an ambiguous
   * failure (such as a timeout or network drop) where the command may have actually
   * reached the server and executed in the background.
   * Deterministic failures (e.g. invalid tokens, permission errors, bad requests)
   * return false so they fail immediately without wasteful polling.
   */
  private isAmbiguousStopError(error: unknown): boolean {
    if (!error) return false;

    if (error instanceof CmsError) {
      if (error.code === CmsErrorCode.NO_RESPONSE) {
        return true;
      }
      const message = String(error.additionalData?.message ?? error.message ?? '');
      const note = String(error.additionalData?.response?.note ?? '');
      if (/timeout/i.test(message) || /timeout/i.test(note)) {
        return true;
      }
      const orig = error.originalError as { code?: string; message?: string } | undefined;
      if (orig) {
        if (orig.code === 'ECONNABORTED' || orig.code === 'ETIMEDOUT' || orig.code === 'ECONNRESET') {
          return true;
        }
        if (/timeout/i.test(orig.message ?? '')) return true;
      }
      return false;
    }

    const err = error as { code?: string; message?: string; name?: string };
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') {
      return true;
    }
    if (typeof err.message === 'string' && /timeout/i.test(err.message)) {
      return true;
    }

    return false;
  }

  /**
   * Restart a database (stop then start).
   * For both steps, HA selection follows the same rule as start/stop:
   * DB name must be listed in `[common]` `ha_db_list` in cubrid_ha.conf (`haconf`).
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name to restart
   * @returns Latest start info (StartInfoClientResponse) on success
   * @throws DatabaseError If stop/start step fails
   */
  @HandleCmsErrors()
  async restartDatabase(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<StartInfoClientResponse> {
    const useHa = await this.databaseInfoService.effectiveHaDbForDbname(userId, hostUid, dbname);

    if (useHa) {
      await this.haService.haStop(userId, hostUid, dbname);
      await this.haService.haStart(userId, hostUid, dbname);
    } else {
      await this.stopNonHaDatabase(userId, hostUid, dbname);
      await this.startNonHaDatabase(userId, hostUid, dbname);
    }

    return await this.databaseInfoService.startInfo(userId, hostUid);
  }

  /**
   * Create or update a stored database profile for a host (id/password used by Web Manager).
   * If a profile for `dbname` already exists, it is overwritten.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @param databaseId Database user ID
   * @param databasePassword Database password (`null`/`undefined` → stored as `""`)
   * @returns Latest start info (StartInfoClientResponse) on success
   */
  @HandleCmsErrors()
  async saveDatabaseProfile(
    userId: string,
    hostUid: string,
    dbname: string,
    databaseId: string,
    databasePassword: string | null | undefined
  ): Promise<StartInfoClientResponse> {
    const missing = (v: string | null | undefined) =>
      v == null || (typeof v === 'string' && v.trim() === '');

    const passwordToStore = databasePassword == null ? '' : databasePassword;

    if (missing(dbname) || missing(databaseId)) {
      const missingFields = [
        missing(dbname) && 'dbname',
        missing(databaseId) && 'id',
      ].filter(Boolean) as string[];

      throw ValidationError.MissingDBCredentials(dbname?.trim() || 'unknown', missingFields);
    }

    await this.repository.atomicUpdateUser(userId, async (user) => {
      const host = getHost(user, hostUid);
      if (!host) {
        throw HostError.NoSuchHost({ hostUid });
      }

      if (host.dbProfiles == null) {
        host.dbProfiles = {};
      }

      host.dbProfiles[dbname] = {
        dbname,
        id: databaseId,
        password: passwordToStore,
      };

      return user;
    });

    return await this.databaseInfoService.startInfo(userId, hostUid);
  }

  /**
   * Get database volume/space information for a database on a host.
   * Returns domain-only data (CMS envelope removed).
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @returns DatabaseVolumeInfoClientResponse
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async getDBSpaceInfo(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<DatabaseVolumeInfoClientResponse> {
    const startInfo = await this.databaseInfoService.startInfoInternal(userId, hostUid);

    if ('dblist' in startInfo && 'activelist' in startInfo) {
      // CMS can return `dblist: null` itself (not just individual entries'
      // `dbs: null`) — `'dblist' in startInfo` only checks key presence, not
      // that the value is a non-null array.
      const dbExists = (startInfo.dblist ?? []).some((el) => (el.dbs ?? []).some((db) => db.dbname === dbname));

      if (!dbExists) {
        throw DatabaseError.NoSuchDatabase({ dbname, hostUid });
      }
    } else {
      throw DatabaseError.InternalError();
    }

    const spaceInfoRequest: DbSpaceInfoCmsRequest = {
      task: 'dbspaceinfo',
      dbname: dbname,
    };
    const response = await this.executeCmsRequest<
      DbSpaceInfoCmsRequest,
      DbSpaceInfoCmsResponse | BaseCmsResponse
    >(userId, hostUid, spaceInfoRequest);

    return this.extractDomainData(response as DbSpaceInfoCmsResponse);
  }

  /**
   * Create a new database (internal use).
   * Returns empty object on success.
   *
   * @internal
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param request Client request containing database creation information
   * @returns CreateDatabaseClientResponse Empty object on success
   * @throws DatabaseError If request fails
   */
  @HandleCmsErrors()
  async createDatabaseInternal(
    userId: string,
    hostUid: string,
    request: CreateDatabaseClientRequest
  ): Promise<CreateDatabaseClientResponse> {
    const host = await this.hostService.findHostInternal(userId, hostUid);

    const cubridConf = await this.cmsConfigService.getAllSystemParam(
      userId,
      hostUid,
      CMS_CONFNAME_CUBRID
    );
    if (isHostHaModeOnFromCubridConf(cubridConf)) {
      throw DatabaseError.InvalidParameter(
        'Cannot create databases on hosts configured for HA.',
        {
          hostUid,
          dbname: request.dbname,
          reason: 'HA_HOST_CREATE_DB_BLOCKED',
        }
      );
    }

    // Collect files to check before parsing exvol
    const filesToCheck: string[] = [];

    // Add exvol volume paths (before parsing/converting)
    // Check the actual volume FILE (directory + volume name), not the bare
    // directory — matches CUBRID Admin's CreateDatabaseWizard, which builds
    // `volumePath + separator + volumeName` before its own file-exists check.
    // Checking the directory alone always reports "exists" (it's a real,
    // already-present directory the user picked), which blocked every
    // directory change with a false "File already exists" error.
    if (request.exvol && Array.isArray(request.exvol)) {
      for (const volumeObj of request.exvol) {
        for (const [volumeName, volumeInfo] of Object.entries(volumeObj)) {
          if (volumeInfo && typeof volumeInfo === 'object' && 'volpath' in volumeInfo) {
            const dir = volumeInfo.volpath.replace(/[\\/]+$/, '');
            filesToCheck.push(`${dir}/${volumeName}`);
          }
        }
      }
    }

    // Check file existence before proceeding
    if (filesToCheck.length > 0) {
      for (const file of filesToCheck) {
        const checkFileResponse = await this.fileService.checkfileInternal(host, [file]);

        if (checkFileResponse.existfile) {
          throw DatabaseError.DuplicatedFile(checkFileResponse.existfile, undefined, {
            message: `File already exists: ${checkFileResponse.existfile}`,
            existfile: checkFileResponse.existfile,
          });
        }
      }
    }

    // Convert exvol from client format to CMS format
    const cmsExvol = request.exvol ? convertExvolArrayToCmsFormat(request.exvol) : [];

    // CUBRID CMS `logsize` expects "pages", but the client request treats `logsize` as "MB".
    // So convert MB -> pages using `logpagesize` (bytes) before sending to CMS.
    const logsizeMb = Number(request.logsize);
    const logpagesizeBytes = Number(request.logpagesize);
    if (!Number.isFinite(logsizeMb) || logsizeMb <= 0) {
      throw DatabaseError.InvalidVolumeSize('Log size must be a positive number in MB', {
        logsize: request.logsize,
      });
    }
    if (!Number.isFinite(logpagesizeBytes) || logpagesizeBytes <= 0) {
      throw DatabaseError.InvalidVolumeSize('Log page size must be a positive number in bytes', {
        logpagesize: request.logpagesize,
      });
    }
    const logsizeInPages = Math.floor((logsizeMb * 1024 * 1024) / logpagesizeBytes);
    if (logsizeInPages <= 0) {
      throw DatabaseError.InvalidVolumeSize('Log size is too small after MB->pages conversion', {
        logsizeMb: request.logsize,
        logpagesizeBytes: request.logpagesize,
        logsizeInPages,
      });
    }

    // Build CMS request from client request
    // Convert numeric values to strings as CMS expects string format
    const cmsRequest: CreateDatabaseCmsRequest = {
      task: 'createdb',
      dbname: request.dbname,
      numpage: String(request.numpage),
      pagesize: String(request.pagesize),
      logsize: String(logsizeInPages),
      logpagesize: String(request.logpagesize),
      genvolpath: request.genvolpath,
      logvolpath: request.logvolpath,
      exvol: cmsExvol,
      charset: request.charset,
      overwrite_config_file: request.overwrite_config_file,
    };

    this.logger.log(JSON.stringify(await this.executeCmsRequest<CreateDatabaseCmsRequest, CreateDatabaseCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    )));

    return { success: true };
  }

  /**
   * Create a new database with optional configuration.
   * Executes database creation, user update, auto-add volume, and auto-start in sequence.
   * Returns results from all executed operations with success/error status.
   * Operations continue even if previous ones fail, allowing partial success.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param request Client request containing database creation and configuration information
   * @returns CreateDatabaseWithConfigResponse Results from all executed operations with success/error status
   */
  async createDatabase(
    userId: string,
    hostUid: string,
    request: CreateDatabaseWithConfigRequest
  ): Promise<CreateDatabaseWithConfigResponse> {
    const { username, updateUser, setAutoAddVol, setAutoStart, ...createDbRequest } = request;

    const response: CreateDatabaseWithConfigResponse = {
      createDatabase: { success: false },
    };

    // 1. Create database
    // IMPORTANT: if `createdb` fails, we should stop immediately and not proceed with the remaining steps.
    // We let the original domain error bubble up so the API returns a real FAIL response (HTTP error + note).
    const createDatabaseResult = await this.createDatabaseInternal(
      userId,
      hostUid,
      createDbRequest
    );

    response.createDatabase = {
      success: true,
      data: createDatabaseResult,
    };

    // 1-1. Start database when requested OR when updateUser needs DB access.
    // userinfo/updateuser CMS tasks require the database to be running.
    if (setAutoStart || updateUser) {
      try {
        const startInfo = await this.startDatabase(userId, hostUid, createDbRequest.dbname);
        response.startDatabase = {
          success: true,
          data: startInfo,
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        const errorCode = (error as any)?.code || (error instanceof Error ? error.name : 'UNKNOWN');
        const errorDetails = (error as any)?.details;
        this.logger.error(`Failed to start database: ${errorMessage}`, errorStack);
        response.startDatabase = {
          success: false,
          error: {
            message: errorMessage || 'Failed to start database',
            code: errorCode,
            details: errorDetails,
          },
        };
      }
    }

    // 2. Update user if requested
    if (updateUser) {
      try {
        const usernameToUse = username || 'dba';

        // Login to DB so subsequent userinfo/updateuser CMS tasks have DB auth context.
        // Newly-created databases have no password, so use empty string.
        await this.databaseUserService.loginDatabase(
          userId,
          hostUid,
          createDbRequest.dbname,
          usernameToUse,
          ''
        );

        const groups: { group: string[] } = { group: [] };
        const authorization: string[] = [];

        // Fetch current user info to preserve existing groups and authorization.
        try {
          const userInfoResponse = await this.databaseUserService.getUserInfo(
            userId,
            hostUid,
            createDbRequest.dbname
          );

          const existingUser = (userInfoResponse.user ?? []).find(
            (u) => String(u['@name'] ?? '').toLowerCase() === usernameToUse.toLowerCase()
          );

          if (existingUser?.groups) {
            const raw = existingUser.groups as any;
            if (Array.isArray(raw?.group)) {
              groups.group = raw.group.filter((g: unknown) => typeof g === 'string');
            }
          }

          if (existingUser?.authorization) {
            for (const entry of existingUser.authorization as Array<Record<string, string>>) {
              const name = entry?.['@name'];
              if (typeof name === 'string' && name) {
                authorization.push(name);
              }
            }
          }
        } catch (userInfoError: unknown) {
          this.logger.warn(
            `userinfo failed for "${usernameToUse}" on "${createDbRequest.dbname}", ` +
            `proceeding with empty groups/authorization: ` +
            `${userInfoError instanceof Error ? userInfoError.message : String(userInfoError)}`
          );
        }

        const updateUserResult = await this.databaseUserService.updateUser(
          userId,
          hostUid,
          createDbRequest.dbname,
          usernameToUse,
          updateUser.userpass,
          groups,
          authorization
        );
        response.updateUser = {
          success: true,
          data: updateUserResult,
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        const errorCode = (error as any)?.code || (error instanceof Error ? error.name : 'UNKNOWN');
        const errorDetails = (error as any)?.details;
        this.logger.error(`Failed to update user: ${errorMessage}`, errorStack);
        response.updateUser = {
          success: false,
          error: {
            message: errorMessage || 'Failed to update user',
            code: errorCode,
            details: errorDetails,
          },
        };
      }
    }

    // 3. Set auto-add volume if requested
    if (setAutoAddVol) {
      try {
        const setAutoAddVolResult = await this.databaseConfigService.setAutoAddVol(
          userId,
          hostUid,
          createDbRequest.dbname,
          setAutoAddVol
        );
        response.setAutoAddVol = {
          success: true,
          data: setAutoAddVolResult,
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        const errorCode = (error as any)?.code || (error instanceof Error ? error.name : 'UNKNOWN');
        const errorDetails = (error as any)?.details;
        this.logger.error(`Failed to set auto-add volume: ${errorMessage}`, errorStack);
        response.setAutoAddVol = {
          success: false,
          error: {
            message: errorMessage || 'Failed to set auto-add volume',
            code: errorCode,
            details: errorDetails,
          },
        };
      }
    }

    // 4. Set auto-start if requested
    if (setAutoStart) {
      try {
        // Use top-level dbname and automatically use "cubridconf" as confname
        const setAutoStartResult = await this.databaseConfigService.setAutoStart(userId, hostUid, {
          confname: CMS_CONFNAME_CUBRID,
          dbname: createDbRequest.dbname,
        });
        response.setAutoStart = {
          success: true,
          data: setAutoStartResult,
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        const errorCode = (error as any)?.code || (error instanceof Error ? error.name : 'UNKNOWN');
        const errorDetails = (error as any)?.details;
        this.logger.error(`Failed to set auto-start: ${errorMessage}`, errorStack);
        response.setAutoStart = {
          success: false,
          error: {
            message: errorMessage || 'Failed to set auto-start',
            code: errorCode,
            details: errorDetails,
          },
        };
      }
    }

    return response;
  }

  /**
   * Delete a database.
   * Also removes the database name from the server parameter in cubridconf if it exists.
   * Returns start-info (db list) on success.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @param request Client request containing delbackup option
   * @returns StartInfoClientResponse Latest database list (start-info) on success
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async deleteDatabase(
    userId: string,
    hostUid: string,
    dbname: string,
    request: DeleteDatabaseRequest
  ): Promise<StartInfoClientResponse> {
    const cubridConf = await this.cmsConfigService.getAllSystemParam(
      userId,
      hostUid,
      CMS_CONFNAME_CUBRID
    );
    if (isHostHaModeOnFromCubridConf(cubridConf)) {
      throw DatabaseError.InvalidParameter(
        'Cannot delete databases on hosts configured for HA.',
        {
          hostUid,
          dbname,
          reason: 'HA_HOST_DELETE_DB_BLOCKED',
        }
      );
    }

    const cmsRequest: DeleteDatabaseCmsRequest = {
      task: 'deletedb',
      dbname: dbname,
      delbackup: request.delbackup,
    };

    this.logger.debug(`Deleting database: ${dbname} on host: ${hostUid}`);

    await this.executeCmsRequest<DeleteDatabaseCmsRequest, DeleteDatabaseCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );

    // Remove dbname from server parameter in cubridconf if it exists
    try {
      await this.databaseConfigService.removeAutoStart(userId, hostUid, {
        confname: CMS_CONFNAME_CUBRID,
        dbname: dbname,
      });
      this.logger.debug(
        `Successfully removed database name ${dbname} from server parameter in cubridconf`
      );
    } catch (error: unknown) {
      // Ignore DbnameNotFound error (dbname may not exist in server parameter)
      // Log other errors but don't fail the delete operation
      if (error instanceof ConfigError && error.code === ConfigErrorCode.DBNAME_NOT_FOUND) {
        this.logger.debug(
          `Database name ${dbname} not found in server parameter, skipping removal (this is expected if auto-start was not configured)`
        );
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        const errorCode = error instanceof ConfigError ? error.code : 'UNKNOWN';
        this.logger.warn(
          `Failed to remove dbname from server parameter during database deletion: ${errorMessage}`,
          {
            dbname,
            hostUid,
            errorCode,
            stack: errorStack,
          }
        );
      }
    }

    // Return latest db list (start-info)
    return await this.databaseInfoService.startInfo(userId, hostUid);
  }
}
