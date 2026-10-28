import { HostService } from '@host';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import {
  GetAddBrokerInfoClientResponse,
  GetEnvClientResponse,
  GetAllSysParamClientResponse,
  ParamdumpClientResponse,
  PlandumpClientResponse,
  SetSysParamClientResponse,
  StatdumpClientResponse,
  StatdumpWatcherClientResponse,
} from '@api-interfaces';
import {
  SetSysParamCmsRequest,
  BaseCmsRequest,
  GetAddBrokerInfoCmsRequest,
  BrokerSetParamCmsRequest,
  StartStatdumpCmsRequest,
  StopStatdumpCmsRequest,
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
import { CmsError } from '@error/cms/cms-error';

/**
 * Seconds between the statdump watcher's own dumps. Its output goes to
 * /dev/null; only its attachment matters (the server accumulates counters
 * while any watcher is attached), so a long interval keeps it nearly free.
 */
export const STATDUMP_WATCHER_INTERVAL_SEC = 60;

/**
 * Name CMS runs `cubrid statdump -i` against. In HA, databases.txt lists
 * several hosts and a bare name fails (ER -985, "hostname ... should be
 * specified when multihost is set"), yet start_statdump still reports
 * success. `@127.0.0.1` is what CMS itself appends for HA in its other tasks
 * (append_host_to_dbname) and also works for a non-HA local database. It is
 * also CMS's per-database key, so stop must use the same name.
 */
export const statdumpWatcherTarget = (dbname: string) => `${dbname}@127.0.0.1`;

/**
 * CMS never expires a statdump watcher, and a client that goes away (browser
 * closed, crashed, network lost) never sends its stop. So each start renews a
 * lease keyed by (hostUid, dbname) — the client re-issues start every 60s
 * while a dashboard is open — and a sweeper stops watchers whose lease has
 * not been renewed for STATDUMP_WATCHER_LEASE_TTL_MS.
 */
export const STATDUMP_WATCHER_LEASE_TTL_MS = 150 * 1000;
export const STATDUMP_WATCHER_SWEEP_INTERVAL_MS = 30 * 1000;

interface StatdumpWatcherLease {
  userId: string;
  hostUid: string;
  dbname: string;
  renewedAt: number;
}

// hostUid is part of the key: two hosts can have a database of the same name.
const statdumpLeaseKey = (hostUid: string, dbname: string) => JSON.stringify([hostUid, dbname]);

const cmsFailureNote = (err: unknown): string =>
  err instanceof CmsError ? String(err.additionalData?.response?.note ?? '') : '';

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
export class CmsConfigService extends BaseService implements OnModuleInit, OnModuleDestroy {
  private readonly statdumpLeases = new Map<string, StatdumpWatcherLease>();
  private statdumpSweepTimer: ReturnType<typeof setInterval> | null = null;
  // Tail of the start/stop calls per lease key: they run one at a time, so a
  // late stop can't kill a watcher that a start just restored.
  private readonly statdumpCalls = new Map<string, Promise<unknown>>();

  constructor(
    protected readonly hostService: HostService,
    protected readonly cmsClient: CmsHttpsClientService,
    private readonly databaseUserService: DatabaseUserService
  ) {
    super(hostService, cmsClient);
  }

  onModuleInit(): void {
    this.statdumpSweepTimer = setInterval(
      () => void this.sweepExpiredStatdumpLeases(),
      STATDUMP_WATCHER_SWEEP_INTERVAL_MS
    );
  }

  onModuleDestroy(): void {
    if (this.statdumpSweepTimer) {
      clearInterval(this.statdumpSweepTimer);
      this.statdumpSweepTimer = null;
    }
  }

  /**
   * Get environment information from a CMS host.
   * Returns domain-only data (CMS envelope removed).
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

    return this.extractDomainData(response);
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
   * Make sure a statdump watcher (CMS `start_statdump`) is attached to the
   * database. Idempotent: CMS answers "already running" for a second start.
   */
  @HandleCmsErrors()
  async startStatDumpWatcher(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<StatdumpWatcherClientResponse> {
    // Only a user who has this host may renew its lease (the sweeper stops
    // as the user who renewed it last).
    await this.hostService.findHostInternal(userId, hostUid);
    const key = statdumpLeaseKey(hostUid, dbname);
    // Renew even if the start fails: CMS can mark a failed start as running.
    this.statdumpLeases.set(key, { userId, hostUid, dbname, renewedAt: Date.now() });
    const cmsRequest: Omit<StartStatdumpCmsRequest, 'token'> = {
      task: 'start_statdump',
      dbname: statdumpWatcherTarget(dbname),
      interval: String(STATDUMP_WATCHER_INTERVAL_SEC),
    };
    return this.serializeStatdumpCall(key, async () => {
      try {
        await this.executeCmsRequest<typeof cmsRequest, BaseCmsResponse>(userId, hostUid, cmsRequest);
        return { running: true, alreadyRunning: false };
      } catch (err) {
        if (/already running/i.test(cmsFailureNote(err))) {
          return { running: true, alreadyRunning: true };
        }
        throw err;
      }
    });
  }

  private serializeStatdumpCall<T>(key: string, call: () => Promise<T>): Promise<T> {
    const previous = this.statdumpCalls.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(call);
    const tail = current.catch(() => undefined);
    this.statdumpCalls.set(key, tail);
    void tail.then(() => {
      if (this.statdumpCalls.get(key) === tail) this.statdumpCalls.delete(key);
    });
    return current;
  }

  /**
   * Stop the statdump watcher (CMS `stop_statdump`). "No statdump running"
   * is not an error: the result is the same. Ends the lease; a failed stop
   * keeps it, so the sweeper tries again once it expires.
   */
  @HandleCmsErrors()
  async stopStatDumpWatcher(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<StatdumpWatcherClientResponse> {
    const key = statdumpLeaseKey(hostUid, dbname);
    const lease = this.statdumpLeases.get(key);
    const result = await this.serializeStatdumpCall(key, () => this.sendStopStatdump(userId, hostUid, dbname));
    // A start that arrived while stopping opened a newer lease; keep that one.
    if (this.statdumpLeases.get(key) === lease) this.statdumpLeases.delete(key);
    return result;
  }

  /**
   * Stop the watchers whose lease was not renewed within
   * STATDUMP_WATCHER_LEASE_TTL_MS, as the user who renewed it last. The lease
   * is dropped first, and a failed stop is only logged, so it isn't retried
   * forever; a start arriving meanwhile opens a new lease.
   */
  async sweepExpiredStatdumpLeases(now = Date.now()): Promise<void> {
    const expired = [...this.statdumpLeases.entries()].filter(
      ([, lease]) => now - lease.renewedAt >= STATDUMP_WATCHER_LEASE_TTL_MS
    );
    await Promise.all(
      expired.map(async ([key, { userId, hostUid, dbname }]) => {
        this.statdumpLeases.delete(key);
        try {
          await this.serializeStatdumpCall(key, () => this.sendStopStatdump(userId, hostUid, dbname));
        } catch (err) {
          this.logger.warn(
            `Stopping the expired statdump watcher for ${dbname} on host ${hostUid} failed: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      })
    );
  }

  private async sendStopStatdump(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<StatdumpWatcherClientResponse> {
    const cmsRequest: Omit<StopStatdumpCmsRequest, 'token'> = {
      task: 'stop_statdump',
      dbname: statdumpWatcherTarget(dbname),
    };
    try {
      await this.executeCmsRequest<typeof cmsRequest, BaseCmsResponse>(userId, hostUid, cmsRequest);
      return { running: false, wasRunning: true };
    } catch (err) {
      if (/no statdump running/i.test(cmsFailureNote(err))) {
        return { running: false, wasRunning: false };
      }
      throw err;
    }
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
