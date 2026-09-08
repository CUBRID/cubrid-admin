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
import { CmsJobLockService } from '@cms-job/cms-job-lock.service';
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
import { GetAllSysParamCmsResponse } from '@type/cms-response/get-all-sys-param-cms-response';
import {
  convertExvolArrayToCmsFormat,
  isHostHaModeOnFromCubridConf,
  getSectionParams,
  parseConfigParamsBySection,
  mapWithConcurrency,
} from '@util';
import { BrokerService } from '@broker';

/**
 * startdb/stopdb now go through executeAsyncCmsJobRequest, so each one
 * consumes one of CMS's async-job slots for the duration of the call. That
 * cap is small (CMS enforces a single-digit global limit per host, shared
 * across every task and user), so a host with many non-HA databases must
 * not fire startAllDatabases/stopAllDatabases's per-db calls all at once —
 * see mapWithConcurrency below. Kept well under the cap to leave headroom
 * for whatever else is concurrently using async jobs on the same host.
 */
const NON_HA_BULK_ACTION_CONCURRENCY = 4;

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
    private readonly haService: HaService,
    private readonly brokerService: BrokerService,
    private readonly cmsJobLockService: CmsJobLockService
  ) {
    super(hostService, cmsClient);
  }

  /**
   * Deliberate policy, not a CMS/engine requirement: block every service/
   * database start-stop-restart (individual, bulk, and HA alike) while any
   * CMS job (load/unload/backup/etc.) is actively running anywhere on this
   * host — restarting the engine underneath a job that's mid-write risks
   * corrupting whatever it's in the middle of.
   */
  private async assertNoActiveJob(userId: string, hostUid: string): Promise<void> {
    const active = await this.cmsJobLockService.hasActiveJobForHost(userId, hostUid);
    if (active) {
      throw DatabaseError.OperationInProgress({
        hostUid,
        dbname: active.dbname,
        existingJobId: active.jobId,
      });
    }
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
    // Deliberate policy, not a CMS/engine requirement — startdb itself needs
    // no db user credentials. Every database action (this one included) is
    // required to go through a dbmtuserlogin first, as a standing
    // authentication gate rather than an as-needed one. Reused by
    // startDatabase, restartDatabase, and startAllDatabases alike, so this
    // one call site covers the individual and bulk paths together.
    await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);

    return this.executeAsyncCmsJobRequest<StartDatabaseCmsRequest & { task: 'startdb' }, BaseCmsResponse>(
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
    // See startNonHaDatabase's comment — same standing policy, covers
    // stopDatabase, restartDatabase, and stopAllDatabases together.
    await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);

    return this.executeAsyncCmsJobRequest<StopDatabaseCmsRequest & { task: 'stopdb' }, BaseCmsResponse>(
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
    await this.assertNoActiveJob(userId, hostUid);

    const useHa = await this.databaseInfoService.effectiveHaDbForDbname(userId, hostUid, dbname);
    if (useHa) {
      // Same standing policy as startNonHaDatabase — ha_start needs no
      // dbmtuserlogin of its own, but every database action goes through
      // this gate regardless.
      await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);
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
    await this.assertNoActiveJob(userId, hostUid);

    const useHa = await this.databaseInfoService.effectiveHaDbForDbname(userId, hostUid, dbname);
    if (useHa) {
      // Same standing policy as stopNonHaDatabase — ha_stop needs no
      // dbmtuserlogin of its own, but every database action goes through
      // this gate regardless.
      await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);
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
    await this.assertNoActiveJob(userId, hostUid);

    const useHa = await this.databaseInfoService.effectiveHaDbForDbname(userId, hostUid, dbname);

    if (useHa) {
      await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);
      await this.haService.haStop(userId, hostUid, dbname);
      await this.haService.haStart(userId, hostUid, dbname);
    } else {
      await this.stopNonHaDatabase(userId, hostUid, dbname);
      await this.startNonHaDatabase(userId, hostUid, dbname);
    }

    return await this.databaseInfoService.startInfo(userId, hostUid);
  }

  /**
   * Start every database in `dbnames` on a host, correctly for the whole
   * service (not one database at a time): HA-configured databases are
   * started with a single bulk `ha_start` (no dbname) instead of one
   * `ha_start` per database, which was racing cub_master's global HA
   * activation when several fired in parallel and intermittently failed
   * with "Cannot connect to server"/"heartbeat start: fail". Non-HA
   * databases are still started individually (`startdb`) in parallel.
   *
   * HA is host-wide (a database can't selectively opt out of the auto-start
   * list the way a plain database can — CUBRID itself refuses to start an
   * HA database through the non-HA `server=` autostart list), so every
   * `ha_db_list` entry is started regardless of whether it's also present
   * in `dbnames`.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbnames Non-HA database names to start (e.g. the auto-start list)
   * @returns Per-database outcome; never throws for individual failures
   */
  async startAllDatabases(
    userId: string,
    hostUid: string,
    dbnames: string[]
  ): Promise<{ succeeded: string[]; failed: Array<{ dbname: string; error: string }> }> {
    await this.assertNoActiveJob(userId, hostUid);

    const haDbNames = await this.databaseInfoService.getHaDbNames(userId, hostUid);
    const haTargets = [...haDbNames];
    const nonHaTargets = dbnames.filter((d) => !haDbNames.has(d));

    const succeeded: string[] = [];
    const failed: Array<{ dbname: string; error: string }> = [];

    if (haTargets.length > 0) {
      // Same standing policy as startNonHaDatabase — bulk ha_start needs no
      // dbmtuserlogin of its own, but every targeted database still goes
      // through this gate. A target whose login fails (e.g. no stored
      // profile) is excluded from the bulk ha_start and reported as its own
      // failure, same as an individual startdb failure would be.
      const loginResults = await Promise.allSettled(
        haTargets.map((dbname) => this.databaseUserService.ensureDbLogin(userId, hostUid, dbname))
      );
      const loggedInHaTargets: string[] = [];
      loginResults.forEach((result, index) => {
        const dbname = haTargets[index];
        if (result.status === 'fulfilled') {
          loggedInHaTargets.push(dbname);
        } else {
          const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
          failed.push({ dbname, error });
        }
      });

      if (loggedInHaTargets.length > 0) {
        try {
          await this.haService.haStart(userId, hostUid);
          succeeded.push(...loggedInHaTargets);
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : String(err);
          loggedInHaTargets.forEach((dbname) => failed.push({ dbname, error }));
        }
      }
    }

    const results = await mapWithConcurrency(
      nonHaTargets,
      NON_HA_BULK_ACTION_CONCURRENCY,
      (dbname) => this.startNonHaDatabase(userId, hostUid, dbname)
    );
    results.forEach((result, index) => {
      const dbname = nonHaTargets[index];
      if (result.status === 'fulfilled') {
        succeeded.push(dbname);
      } else {
        const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
        failed.push({ dbname, error });
      }
    });

    return { succeeded, failed };
  }

  /**
   * Stop every database in `dbnames` on a host, correctly for the whole
   * service — see startAllDatabases for why HA databases are stopped with a
   * single bulk `ha_stop` (no dbname) instead of one per database.
   *
   * Every `ha_db_list` entry is stopped regardless of whether it's also
   * present in `dbnames` — see startAllDatabases.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbnames Non-HA database names to stop (e.g. the currently active list)
   * @returns Per-database outcome; never throws for individual failures
   */
  async stopAllDatabases(
    userId: string,
    hostUid: string,
    dbnames: string[]
  ): Promise<{ succeeded: string[]; failed: Array<{ dbname: string; error: string }> }> {
    await this.assertNoActiveJob(userId, hostUid);

    const haDbNames = await this.databaseInfoService.getHaDbNames(userId, hostUid);
    const haTargets = [...haDbNames];
    const nonHaTargets = dbnames.filter((d) => !haDbNames.has(d));

    const succeeded: string[] = [];
    const failed: Array<{ dbname: string; error: string }> = [];

    if (haTargets.length > 0) {
      // See startAllDatabases's matching comment — same gate, same
      // exclude-and-report-individually treatment for a failed login.
      const loginResults = await Promise.allSettled(
        haTargets.map((dbname) => this.databaseUserService.ensureDbLogin(userId, hostUid, dbname))
      );
      const loggedInHaTargets: string[] = [];
      loginResults.forEach((result, index) => {
        const dbname = haTargets[index];
        if (result.status === 'fulfilled') {
          loggedInHaTargets.push(dbname);
        } else {
          const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
          failed.push({ dbname, error });
        }
      });

      if (loggedInHaTargets.length > 0) {
        try {
          await this.haService.haStop(userId, hostUid);
          succeeded.push(...loggedInHaTargets);
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : String(err);
          loggedInHaTargets.forEach((dbname) => failed.push({ dbname, error }));
        }
      }
    }

    const results = await mapWithConcurrency(
      nonHaTargets,
      NON_HA_BULK_ACTION_CONCURRENCY,
      (dbname) => this.stopNonHaDatabase(userId, hostUid, dbname)
    );
    results.forEach((result, index) => {
      const dbname = nonHaTargets[index];
      if (result.status === 'fulfilled') {
        succeeded.push(dbname);
      } else {
        const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
        failed.push({ dbname, error });
      }
    });

    return { succeeded, failed };
  }

  /**
   * Start the whole service on a host in one call: brokers, then databases —
   * matching `cubrid service start`. Reads cubridconf's `[service]` section
   * to decide whether server autostart is enabled (`service=...,server,...`)
   * and which non-HA databases are in the autostart list (`server=`);
   * HA-configured databases are always included via startAllDatabases's bulk
   * `ha_start` regardless of this list (a host can be entirely HA with no
   * `server=` line at all).
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @returns Failures across brokers and databases; never throws for partial
   *   failures (a cubridconf read failure is the one exception, since the
   *   autostart list can't be determined without it)
   */
  @HandleCmsErrors()
  async startWholeService(
    userId: string,
    hostUid: string
  ): Promise<{ failed: Array<{ name: string; error: string }> }> {
    // Checked once, up front — brokers start before databases below, and a
    // job-in-progress error surfacing only at the database step would mean
    // brokers already started for a service-start we should have blocked
    // outright.
    await this.assertNoActiveJob(userId, hostUid);

    const failed: Array<{ name: string; error: string }> = [];

    try {
      await this.brokerService.startAllBrokers(userId, hostUid);
    } catch (err: unknown) {
      failed.push({ name: 'brokers', error: err instanceof Error ? err.message : String(err) });
    }

    const cubridConf = await this.cmsConfigService.getAllSystemParam(
      userId,
      hostUid,
      CMS_CONFNAME_CUBRID
    );
    const serviceParams =
      getSectionParams(parseConfigParamsBySection(cubridConf as GetAllSysParamCmsResponse), 'service') || {};
    const serviceEnabled = (serviceParams.service || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .includes('server');
    const autoStartServers = (serviceParams.server || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (serviceEnabled) {
      const { failed: dbFailed } = await this.startAllDatabases(userId, hostUid, autoStartServers);
      failed.push(...dbFailed.map(({ dbname, error }) => ({ name: dbname, error })));
    }

    return { failed };
  }

  /**
   * Stop the whole service on a host in one call: databases, then brokers —
   * matching `cubrid service stop`. Every currently-active database (from
   * start-info's `dblist`) is stopped, with HA-configured databases always
   * included via stopAllDatabases's bulk `ha_stop` regardless of this list.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @returns Failures across databases and brokers; never throws for partial
   *   failures
   */
  @HandleCmsErrors()
  async stopWholeService(
    userId: string,
    hostUid: string
  ): Promise<{ failed: Array<{ name: string; error: string }> }> {
    // See startWholeService's matching comment — checked once, up front, so
    // a job-in-progress block can't happen only after databases already
    // stopped.
    await this.assertNoActiveJob(userId, hostUid);

    const failed: Array<{ name: string; error: string }> = [];

    const startInfo = await this.databaseInfoService.startInfo(userId, hostUid);
    const dbnames = (startInfo?.dblist?.dbs || []).map((db) => db.dbname);

    const { failed: dbFailed } = await this.stopAllDatabases(userId, hostUid, dbnames);
    failed.push(...dbFailed.map(({ dbname, error }) => ({ name: dbname, error })));

    try {
      await this.brokerService.stopAllBrokers(userId, hostUid);
    } catch (err: unknown) {
      failed.push({ name: 'brokers', error: err instanceof Error ? err.message : String(err) });
    }

    return { failed };
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
   * Forgets a database's stored login profile (saved id/password) so future
   * actions on it fall back to the manual Login Database flow.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @returns Latest start info (StartInfoClientResponse) on success
   */
  @HandleCmsErrors()
  async deleteDatabaseProfile(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<StartInfoClientResponse> {
    await this.databaseUserService.deleteDbProfile(userId, hostUid, dbname);
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

    await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);

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
    request: CreateDatabaseClientRequest,
    onUuid?: (uuid: string) => void | Promise<void>
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

    this.logger.log(JSON.stringify(await this.executeAsyncCmsJobRequest<CreateDatabaseCmsRequest, CreateDatabaseCmsResponse>(
      userId,
      hostUid,
      cmsRequest,
      { onUuid }
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
    request: CreateDatabaseWithConfigRequest,
    onUuid?: (uuid: string) => void | Promise<void>
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
      createDbRequest,
      onUuid
    );

    response.createDatabase = {
      success: true,
      data: createDatabaseResult,
    };

    // A freshly created database's dba user already has a blank password, so
    // an empty `userpass` is a no-op update — treating it as "requested"
    // anyway forced the database to start (see below) even with both the
    // auto-start toggle and the password field left off/empty.
    const wantsPasswordChange = Boolean(updateUser?.userpass);

    // 1-1. Start database when requested OR when updateUser needs DB access.
    // userinfo/updateuser CMS tasks require the database to be running.
    if (setAutoStart || wantsPasswordChange) {
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
    if (updateUser?.userpass) {
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

        let groups: { group: string[] } = { group: [] };
        let authorization: string[] = [];

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

    // 2-1. Warm ensureDbLogin's cache before the config steps below when step
    // 2 (updateUser) didn't already do it — a freshly created database's dba
    // user always has a blank password until step 2 changes it, so logging in
    // as dba/"" here is safe regardless of whether a profile is stored yet.
    // Failures are swallowed: setAutoAddVol/setAutoStart below hit the same
    // missing-login/CMS error and report it themselves, same as any other
    // per-step failure in this function.
    if (!updateUser?.userpass && (setAutoAddVol || setAutoStart)) {
      try {
        await this.databaseUserService.loginDatabase(userId, hostUid, createDbRequest.dbname, 'dba', '');
      } catch {
        // swallowed — see comment above
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

    await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);

    const cmsRequest: DeleteDatabaseCmsRequest = {
      task: 'deletedb',
      dbname: dbname,
      delbackup: request.delbackup,
    };

    this.logger.debug(`Deleting database: ${dbname} on host: ${hostUid}`);

    await this.executeAsyncCmsJobRequest<DeleteDatabaseCmsRequest, DeleteDatabaseCmsResponse>(
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
