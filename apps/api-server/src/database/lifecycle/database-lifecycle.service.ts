import {
  CreateDatabaseClientRequest,
  CreateDatabaseClientResponse,
  CreateDatabaseWithConfigRequest,
  CreateDatabaseWithConfigResponse,
  DatabaseVolumeInfoClientResponse,
  DeleteDatabaseRequest,
  StartInfoClientResponse,
  autoStartDatabases,
} from '@api-interfaces';
import { GetCreatedbInfoClientResponse } from '@api-interfaces/response/get-createdb-info-client-response';
import { CmsConfigService } from '@cms-config/cms-config.service';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { CmsJobLockService } from '@cms-job/cms-job-lock.service';
import { BaseService, HandleCmsErrors, Warning } from '@common';
import { ConfigError } from '@error/config/config-error';
import { ConfigErrorCode } from '@error/config/config-error-code';
import { DatabaseError } from '@error/database/database-error';
import { CmsError, CmsErrorCode, FailureDetails, HostError, failureDetails } from '@error/index';
import { getHost } from '@host/host-group.util';
import { ValidationError } from '@error/validation/validation-error';
import { ValidationErrorCode } from '@error/validation/validation-error-code';
import { FileService } from '@file/file.service';
import { HaService } from '@ha';
import { HostService } from '@host';
import { Injectable } from '@nestjs/common';
import { UserRepositoryService } from '@repository';
import { BaseCmsResponse } from '@type';
import { DatabaseInfoService, HaNodeState } from '../info/database-info.service';
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
import {
  convertExvolArrayToCmsFormat,
  isHostHaModeOnFromCubridConf,
  getPerDbHaModeOffDbNames,
  mapWithConcurrency,
} from '@util';
import { BrokerService } from '@broker';
import { assertValidGeneralVolumeSize } from './database-volume-size';
import { withDatabaseActionLock } from './database-action-lock';

/**
 * startdb/stopdb now go through executeAsyncCmsJobRequest, so each one
 * consumes one of CMS's async-job slots for the duration of the call. That
 * cap is small (CMS enforces a single-digit global limit per host, shared
 * across every task and user), so a host with many non-HA databases must
 * not fire its per-db calls all at once — see runNonHaAction. Kept well
 * under the cap to leave headroom for whatever else is concurrently using
 * async jobs on the same host.
 */
const NON_HA_BULK_ACTION_CONCURRENCY = 4;

/** Outcome of a bulk or service database start/stop, per database. */
export type BulkDatabaseActionResult = {
  succeeded: string[];
  /**
   * `error` and the fields a client maps it by (failureDetails). `phase` is
   * set only by a restart, for the step that failed.
   */
  failed: Array<FailureDetails & { dbname: string; phase?: 'stop' | 'start' }>;
  skipped: Array<{ dbname: string; reason: string }>;
};

export type SelectedDatabasesAction = 'start' | 'stop' | 'restart';

/** Names start-info lists as running; throws if the list is missing. */
function activeDbnamesOf(info: { activelist?: { active?: unknown } } | null | undefined): Set<string> {
  const active = info?.activelist?.active;
  if (!Array.isArray(active)) {
    throw DatabaseError.GetStartInfoFailed({ reason: 'ACTIVE_LIST_MISSING' });
  }
  return new Set(active.map((a: { dbname: string } | string) => (typeof a === 'string' ? a : a?.dbname)));
}

/** A broker or database step of a whole-service start/stop that failed (failureDetails). */
export type ServiceFailure = FailureDetails & { name: string };

/**
 * A database a whole-service step left alone because the user isn't logged
 * in to it: nothing was sent to it, so it is still in the state it was in. A
 * restart sets `phase`: skipped at the stop, it kept running; skipped at the
 * start, it was stopped and was not started.
 */
export type ServiceSkip = { name: string; reason: string; phase?: 'stop' | 'start' };

/** What restartWholeService reports; see there. */
export type ServiceRestartResult = {
  stopFailed: ServiceFailure[];
  startFailed: ServiceFailure[];
  skipped: ServiceSkip[];
  /** Running before, stopped by the restart and not started again (not in the autostart list, or no server in `service=`). */
  leftStopped: string[];
};

/**
 * Name of the one result entry for a whole-service start or stop's HA step
 * (a dbname-less `ha_start`/`ha_stop` for the node), which has no
 * per-database outcome.
 */
export const HA_NODE_STEP = 'HA databases (heartbeat)';

/**
 * The non-HA databases of `dbnames` an action needs: not running for a
 * start, running for a stop. One already in the wanted state is left out,
 * since CMS answers a second start or stop with an error; if the running
 * list couldn't be read (`running` null), every one is tried.
 */
function nonHaTargets(
  dbnames: string[],
  haDbNames: Set<string>,
  running: Set<string> | null,
  action: 'start' | 'stop'
): string[] {
  return dbnames.filter(
    (d) => !haDbNames.has(d) && (running === null || (action === 'start' ? !running.has(d) : running.has(d)))
  );
}

/**
 * A create-database step's error: `message` is what the API would send for it
 * (for an AppError, its message rather than its bare code), with the fields a
 * client maps it by (failureDetails).
 */
function stepError(error: unknown, fallback: string, code: string, details: unknown) {
  const { error: message, ...fields } = failureDetails(error);
  return { ...fields, message: message || fallback, code, details };
}

/**
 * `code` and `type` of an HA step outcome that is not an error the request
 * threw, shaped like an error's so a client maps it the same way.
 */
const haResultCode = (code: string) => ({ code, type: `/errors/database/${code.toLowerCase()}` });

export const BULK_SKIP_REASON = {
  notFound: 'Not a database on this host',
  alreadyRunning: 'Already running',
  notRunning: 'Not running',
  loggedOut: 'Logged out',
  notLoggedIn: 'Not logged in',
  jobRunning: 'A job is running on it',
} as const;

/**
 * The skip reason when `err` is ensureDbLogin's "no login" error, else null.
 * A bulk or service step skips such a database instead of failing it: the
 * check runs before anything is sent to CMS.
 */
function notLoggedInSkipReason(err: unknown): string | null {
  if (!(err instanceof ValidationError) || err.code !== ValidationErrorCode.MISSING_DB_CREDENTIALS) return null;
  return err.additionalData?.reason === 'loggedOut' ? BULK_SKIP_REASON.loggedOut : BULK_SKIP_REASON.notLoggedIn;
}

/** Adds one database's settled result to `out`: succeeded, skipped (no login) or failed. */
function addOutcome(out: BulkDatabaseActionResult, dbname: string, result: PromiseSettledResult<unknown>): void {
  if (result.status === 'fulfilled') {
    out.succeeded.push(dbname);
    return;
  }
  const reason = notLoggedInSkipReason(result.reason);
  if (reason) {
    out.skipped.push({ dbname, reason });
  } else {
    out.failed.push({ dbname, ...failureDetails(result.reason) });
  }
}

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
   * Deliberate policy, not a CMS/engine requirement: a whole-service start,
   * stop or restart (every database of the host, and the HA node itself) is
   * refused while any CMS job (load/unload/backup/etc.) is actively running
   * on this host — restarting the engine underneath a job that's mid-write
   * risks corrupting whatever it's in the middle of.
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

  /**
   * A start, stop or restart of single databases is refused only when a job
   * works on one of them (jobDatabases: for a copy the source and the new
   * database, for a rename the old and the new name). Starting or stopping
   * another database leaves the job's database alone: `startdb`/`stopdb` and
   * `cubrid heartbeat start|stop <db>` act on that database's processes only
   * (util_service.c us_hb_process_start/stop).
   */
  private async assertNoActiveJobOn(userId: string, hostUid: string, dbnames: string[]): Promise<void> {
    const busy = await this.cmsJobLockService.activeJobDatabasesForHost(userId, hostUid);
    const dbname = dbnames.find((name) => busy.has(name));
    if (dbname !== undefined) {
      throw DatabaseError.OperationInProgress({ hostUid, dbname, existingJobId: busy.get(dbname) });
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
    // startDatabase, restartDatabase, and the bulk and service paths alike
    // (runNonHaAction), so this one call site covers them together.
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
    // stopDatabase, restartDatabase, and runNonHaAction together.
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
    return this.holdingDatabases(userId, hostUid, [dbname], 'startDatabase', () =>
      this.startDatabaseUnlocked(userId, hostUid, dbname)
    );
  }

  private async startDatabaseUnlocked(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<StartInfoClientResponse> {
    await this.assertNoActiveJobOn(userId, hostUid, [dbname]);

    const useHa = await this.databaseInfoService.effectiveHaDbForDbname(userId, hostUid, dbname);
    if (useHa) {
      // Same standing policy as startNonHaDatabase — ha_start needs no
      // dbmtuserlogin of its own, but every database action goes through
      // this gate regardless.
      await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);
      // `heartbeat start <db>` on a running database can stop it again (its
      // start check stops the database when a log process it spawns exits),
      // so a stale screen asking to start a running HA database is a no-op.
      const info = await this.databaseInfoService.startInfo(userId, hostUid);
      let alreadyRunning = false;
      try {
        alreadyRunning = activeDbnamesOf(info).has(dbname);
      } catch {
        // No running list in the reply: start as before.
      }
      if (alreadyRunning) return info;
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
    return this.holdingDatabases(userId, hostUid, [dbname], 'stopDatabase', () =>
      this.stopDatabaseUnlocked(userId, hostUid, dbname)
    );
  }

  private async stopDatabaseUnlocked(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<StartInfoClientResponse> {
    await this.assertNoActiveJobOn(userId, hostUid, [dbname]);

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
    return this.holdingDatabases(userId, hostUid, [dbname], 'restartDatabase', () =>
      this.restartDatabaseUnlocked(userId, hostUid, dbname)
    );
  }

  private async restartDatabaseUnlocked(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<StartInfoClientResponse> {
    await this.assertNoActiveJobOn(userId, hostUid, [dbname]);

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
   * HA half of startAllDatabases/stopAllDatabases. Every HA database gets its
   * own `ha_start <db>`/`ha_stop <db>`, one at a time: a dbname-less
   * `ha_stop` is `cubrid heartbeat stop`, which deactivates heartbeat on the
   * whole node (us_hb_deactivate) and leaves its HA state unknown, and
   * parallel `ha_start`s race cub_master's HA activation.
   *
   * Only databases that need it are touched — not-running ones for start,
   * running ones for stop — because `heartbeat start <db>` stops that
   * database again if its start check fails. If the running list can't be
   * read, nothing is sent and every HA database is reported failed.
   *
   * Each database goes through the same DB-login gate as a single start or
   * stop (ensureDbLogin); whether a CMS account may do this at all is left
   * to the CMS user permission rework.
   */
  private async runHaBulkAction(
    userId: string,
    hostUid: string,
    haDbNames: string[],
    action: 'start' | 'stop',
    out: BulkDatabaseActionResult,
    knownRunning?: Set<string> | null
  ): Promise<void> {
    if (haDbNames.length === 0) return;

    let running: Set<string>;
    try {
      running = knownRunning ?? (await this.readActiveDbnames(userId, hostUid));
    } catch (err: unknown) {
      const failure = failureDetails(err);
      haDbNames.forEach((dbname) => out.failed.push({ dbname, ...failure }));
      return;
    }

    const targets = haDbNames.filter((dbname) => (action === 'start' ? !running.has(dbname) : running.has(dbname)));
    const results = await mapWithConcurrency(targets, 1, async (dbname) => {
      await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);
      if (action === 'start') {
        await this.haService.haStart(userId, hostUid, dbname);
      } else {
        await this.haService.haStop(userId, hostUid, dbname);
      }
    });
    results.forEach((result, index) => addOutcome(out, targets[index], result));
  }

  /**
   * HA half of a whole-service start or stop on an HA node (`ha.haNode`):
   * one dbname-less `ha_start` or `ha_stop` (haStartNode/haStopNode), always
   * sent, also when `ha_db_list` is empty or cubrid_ha.conf can't be read;
   * the engine decides which `ha_db_list` databases go up or down and skips
   * what is already in that state. There is no login check: the node acts on
   * all its HA databases at once.
   *
   * CMS judges these by stderr only, while the engine reports a heartbeat
   * failure on stdout, so a failed start can come back as success. The
   * outcome (one entry, HA_NODE_STEP) is therefore decided by the running
   * list read afterwards: a start fails if an HA database is not running, a
   * stop if one still is. A stop finding none running is done, whatever CMS
   * answered (e.g. no cub_master left). If that read fails, a start is
   * reported as not confirmed and a stop as failed only when the request
   * itself failed. Without the `ha_db_list` names (empty, or cubrid_ha.conf
   * unreadable) only a stop that leaves nothing running is judged; otherwise
   * the entry says it was not checked (HA_START_NOT_CHECKED or
   * HA_STOP_NOT_CHECKED, `reason` HA_DB_LIST_EMPTY or HA_DB_LIST_UNREADABLE).
   */
  private async runHaNodeAction(
    userId: string,
    hostUid: string,
    ha: HaNodeState,
    action: 'start' | 'stop',
    out: BulkDatabaseActionResult
  ): Promise<void> {
    if (!ha.haNode) return;
    const haDbNames = [...ha.haDbNames];
    // A failed ha_start/ha_stop request itself, kept whole (failureDetails) so
    // the entry carries CMS's own text as `sendFailure`.
    let sendFailure: FailureDetails | null = null;
    try {
      if (action === 'start') {
        await this.haService.haStartNode(userId, hostUid);
      } else {
        await this.haService.haStopNode(userId, hostUid);
      }
    } catch (err: unknown) {
      sendFailure = failureDetails(err);
    }
    const sendError = sendFailure?.error ?? null;
    const sent = sendFailure ? { sendFailure } : {};

    // Without the ha_db_list names: why (`reason`, and `haConfFailure` when
    // cubrid_ha.conf could not be read), and `readFailure` when the running
    // list could not be read either.
    const notChecked = (readFailure?: FailureDetails) => {
      const code = action === 'start' ? 'HA_START_NOT_CHECKED' : 'HA_STOP_NOT_CHECKED';
      const haConfFailure = ha.haConfFailure;
      const why = haConfFailure ? `cubrid_ha.conf could not be read: ${haConfFailure.error}` : 'ha_db_list in cubrid_ha.conf is empty';
      return {
        dbname: HA_NODE_STEP,
        ...haResultCode(code),
        reason: haConfFailure ? 'HA_DB_LIST_UNREADABLE' : 'HA_DB_LIST_EMPTY',
        error: `Could not check the HA ${action}, since ${why}${sendError ? ` (${sendError})` : ''}`,
        ...(haConfFailure ? { haConfFailure } : {}),
        ...(readFailure ? { readFailure } : {}),
        ...sent,
      };
    };

    let running: Set<string>;
    try {
      running = await this.readActiveDbnames(userId, hostUid);
    } catch (err: unknown) {
      if (haDbNames.length === 0) {
        out.failed.push(notChecked(failureDetails(err)));
      } else if (action === 'stop' && sendError === null) {
        out.succeeded.push(HA_NODE_STEP);
      } else {
        const readFailure = failureDetails(err);
        const readError = readFailure.error;
        out.failed.push({
          dbname: HA_NODE_STEP,
          ...haResultCode(action === 'start' ? 'HA_START_NOT_CHECKED' : 'HA_STOP_NOT_CHECKED'),
          error: action === 'start'
            ? `Could not check whether the HA databases started: ${readError}${sendError ? ` (${sendError})` : ''}`
            : `${sendError} (could not read which databases are running: ${readError})`,
          readFailure,
          ...sent,
        });
      }
      return;
    }

    if (haDbNames.length === 0 && !(action === 'stop' && running.size === 0)) {
      out.failed.push(notChecked());
      return;
    }

    const wrong = haDbNames.filter((dbname) => (action === 'start' ? !running.has(dbname) : running.has(dbname)));
    if (wrong.length === 0) {
      out.succeeded.push(HA_NODE_STEP);
      return;
    }
    out.failed.push({
      dbname: HA_NODE_STEP,
      ...haResultCode(action === 'start' ? 'HA_NOT_RUNNING_AFTER_START' : 'HA_STILL_RUNNING_AFTER_STOP'),
      error: `${action === 'start' ? 'Not running after the HA start' : 'Still running after the HA stop'}: ${wrong.join(', ')}${sendError ? ` (${sendError})` : ''}`,
      dbnames: wrong,
      ...sent,
    });
  }

  /**
   * Start, stop or restart exactly the selected databases (multi-select),
   * unlike startAllDatabases/stopAllDatabases, which take every HA database
   * on the host. Databases the action doesn't apply to (unknown, already
   * running for start, not running for stop/restart) are reported skipped.
   * Each database goes through the same login gate as a single action; HA
   * ones run one at a time with `ha_start|ha_stop <db>`.
   *
   * A restart stops the targets, then starts the ones that stopped; a
   * database whose stop failed is not started, and failures carry the phase.
   *
   * Every requested database is held (as for single and all-database
   * actions) before start-info decides which apply, so a start or stop that
   * finished just before can't leave a target decided on stale state.
   */
  async runSelectedDatabasesAction(
    userId: string,
    hostUid: string,
    action: SelectedDatabasesAction,
    dbnames: string[]
  ): Promise<BulkDatabaseActionResult> {
    // A database a job works on is skipped with a reason, as a database
    // that is not logged in is; the others go ahead.
    const jobBusy = await this.cmsJobLockService.activeJobDatabasesForHost(userId, hostUid);
    const requested = [...new Set(dbnames)];
    return this.holdingDatabases(userId, hostUid, requested, `${action}SelectedDatabases`, async () => {
      const out: BulkDatabaseActionResult = { succeeded: [], failed: [], skipped: [] };
      const info = await this.databaseInfoService.startInfo(userId, hostUid);
      // An empty dblist (CMS sends `null` for an empty section) means no
      // databases to act on: none on the host, or CMS could not resolve the
      // host's own name, which it still reports as success with no dblist.
      // Either way every selected database is skipped, nothing is run.
      // A running database can be missing from dblist (CMS lists only the
      // databases.txt entries whose host field matches), so the running ones
      // count as known too.
      const running = activeDbnamesOf(info);
      const known = new Set([...(info?.dblist?.dbs || []).map((db) => db.dbname), ...running]);
      const targets: string[] = [];
      for (const dbname of requested) {
        if (!known.has(dbname)) {
          out.skipped.push({ dbname, reason: BULK_SKIP_REASON.notFound });
        } else if (jobBusy.has(dbname)) {
          out.skipped.push({ dbname, reason: BULK_SKIP_REASON.jobRunning });
        } else if (action === 'start' && running.has(dbname)) {
          out.skipped.push({ dbname, reason: BULK_SKIP_REASON.alreadyRunning });
        } else if (action !== 'start' && !running.has(dbname)) {
          out.skipped.push({ dbname, reason: BULK_SKIP_REASON.notRunning });
        } else {
          targets.push(dbname);
        }
      }
      if (targets.length === 0) return out;
      return this.runSelectedDatabasesActionUnlocked(userId, hostUid, action, targets, out);
    });
  }

  private async runSelectedDatabasesActionUnlocked(
    userId: string,
    hostUid: string,
    action: SelectedDatabasesAction,
    targets: string[],
    out: BulkDatabaseActionResult
  ): Promise<BulkDatabaseActionResult> {
    const haDbNames = await this.databaseInfoService.getHaDbNames(userId, hostUid);
    const runPhase = async (phase: 'start' | 'stop', dbs: string[]): Promise<BulkDatabaseActionResult> => {
      const phaseOut: BulkDatabaseActionResult = { succeeded: [], failed: [], skipped: [] };
      await this.runHaBulkAction(userId, hostUid, dbs.filter((d) => haDbNames.has(d)), phase, phaseOut);
      await this.runNonHaAction(userId, hostUid, dbs.filter((d) => !haDbNames.has(d)), phase, phaseOut);
      return phaseOut;
    };

    if (action !== 'restart') {
      const result = await runPhase(action, targets);
      out.succeeded.push(...result.succeeded);
      out.failed.push(...result.failed);
      out.skipped.push(...result.skipped);
      return out;
    }

    // A database skipped at the stop (no login) is neither stopped nor started.
    const stopped = await runPhase('stop', targets);
    out.failed.push(...stopped.failed.map((f) => ({ ...f, phase: 'stop' as const })));
    out.skipped.push(...stopped.skipped);
    const started = await runPhase('start', stopped.succeeded);
    out.succeeded.push(...started.succeeded);
    out.failed.push(...started.failed.map((f) => ({ ...f, phase: 'start' as const })));
    out.skipped.push(...started.skipped);
    return out;
  }

  /**
   * Runs `fn` while holding `dbnames` against any other start/stop/restart of
   * the same databases on this CMS host (database-action-lock.ts); throws
   * DatabaseActionInProgress instead of running when one is already held.
   */
  private async holdingDatabases<T>(
    userId: string,
    hostUid: string,
    dbnames: string[],
    action: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const host = await this.hostService.findHostInternal(userId, hostUid);
    const outcome = await withDatabaseActionLock(`${host.address}:${host.port}`, dbnames, action, fn);
    if ('busy' in outcome) {
      throw DatabaseError.DatabaseActionInProgress({ hostUid, dbname: outcome.busy.dbname });
    }
    return outcome.result;
  }

  /** Names of the databases start-info lists as running; throws if it can't be read. */
  private async readActiveDbnames(userId: string, hostUid: string): Promise<Set<string>> {
    return activeDbnamesOf(await this.databaseInfoService.startInfo(userId, hostUid));
  }

  /**
   * Start every database in `dbnames` on a host (Start All): non-HA
   * databases with `startdb` in parallel, HA databases (getHaDbNames) one by
   * one with `ha_start <db>` (see runHaBulkAction).
   *
   * CUBRID refuses to start an HA database through the non-HA `server=`
   * autostart list, so every `ha_db_list` entry that isn't running is
   * started regardless of whether it's also present in `dbnames`, if the
   * database is logged in.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbnames Non-HA database names to start
   * @returns Per-database outcome (succeeded/failed/skipped); never throws
   *   for individual failures
   */
  async startAllDatabases(userId: string, hostUid: string, dbnames: string[]): Promise<BulkDatabaseActionResult> {
    const all = await this.withoutJobDatabases(userId, hostUid, dbnames,
      await this.databaseInfoService.getHaDbNames(userId, hostUid));
    const result = await this.holdingDatabases(userId, hostUid, [...all.haDbNames, ...all.dbnames], 'startAllDatabases', () =>
      this.runAllDatabasesAction(userId, hostUid, all.dbnames, all.haDbNames, 'start')
    );
    result.skipped.unshift(...all.skipped);
    return result;
  }

  /**
   * Stop every database in `dbnames` on a host (Stop All): non-HA with
   * `stopdb`, HA (getHaDbNames) one by one with `ha_stop <db>`.
   *
   * Every running `ha_db_list` entry is stopped regardless of whether it's
   * also present in `dbnames`, if the database is logged in.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbnames Non-HA database names to stop
   * @returns Per-database outcome; never throws for individual failures
   */
  async stopAllDatabases(userId: string, hostUid: string, dbnames: string[]): Promise<BulkDatabaseActionResult> {
    const all = await this.withoutJobDatabases(userId, hostUid, dbnames,
      await this.databaseInfoService.getHaDbNames(userId, hostUid));
    const result = await this.holdingDatabases(userId, hostUid, [...all.haDbNames, ...all.dbnames], 'stopAllDatabases', () =>
      this.runAllDatabasesAction(userId, hostUid, all.dbnames, all.haDbNames, 'stop')
    );
    result.skipped.unshift(...all.skipped);
    return result;
  }

  /**
   * Start All / Stop All leave out the databases a job works on, each
   * reported as skipped with the reason; the rest go ahead.
   */
  private async withoutJobDatabases(
    userId: string,
    hostUid: string,
    dbnames: string[],
    haDbNames: Set<string>
  ): Promise<{ dbnames: string[]; haDbNames: Set<string>; skipped: BulkDatabaseActionResult['skipped'] }> {
    const busy = await this.cmsJobLockService.activeJobDatabasesForHost(userId, hostUid);
    const skipped = [...new Set([...haDbNames, ...dbnames])]
      .filter((dbname) => busy.has(dbname))
      .map((dbname) => ({ dbname, reason: BULK_SKIP_REASON.jobRunning }));
    return {
      dbnames: dbnames.filter((dbname) => !busy.has(dbname)),
      haDbNames: new Set([...haDbNames].filter((dbname) => !busy.has(dbname))),
      skipped,
    };
  }

  /** startAllDatabases/stopAllDatabases with the databases already held. */
  private async runAllDatabasesAction(
    userId: string,
    hostUid: string,
    dbnames: string[],
    haDbNames: Set<string>,
    action: 'start' | 'stop'
  ): Promise<BulkDatabaseActionResult> {
    const out: BulkDatabaseActionResult = { succeeded: [], failed: [], skipped: [] };
    const running = await this.readRunningOrNull(userId, hostUid);
    const targets = nonHaTargets(dbnames, haDbNames, running, action);
    await this.runHaBulkAction(userId, hostUid, [...haDbNames], action, out, running);
    await this.runNonHaAction(userId, hostUid, targets, action, out);
    return out;
  }

  /**
   * The databases of a whole-service start: the `autoStart` ones with
   * `startdb`, and on an HA node (getHaNodeState) the HA databases with one
   * node-wide `ha_start` (see runHaNodeAction).
   */
  private async startServiceDatabases(userId: string, hostUid: string, autoStart: string[]): Promise<BulkDatabaseActionResult> {
    await this.assertNoActiveJob(userId, hostUid);

    const haNode = await this.databaseInfoService.getHaNodeState(userId, hostUid);
    return this.holdingDatabases(userId, hostUid, [...haNode.haDbNames, ...autoStart], 'startServiceDatabases', () =>
      this.runServiceDatabasesAction(userId, hostUid, autoStart, haNode, 'start')
    );
  }

  /**
   * The databases of a whole-service stop: the `dbnames` ones with
   * `stopdb`, and on an HA node (getHaNodeState) the HA databases with one
   * node-wide `ha_stop` (see runHaNodeAction).
   */
  private async stopServiceDatabases(userId: string, hostUid: string, dbnames: string[]): Promise<BulkDatabaseActionResult> {
    await this.assertNoActiveJob(userId, hostUid);

    const haNode = await this.databaseInfoService.getHaNodeState(userId, hostUid);
    return this.holdingDatabases(userId, hostUid, [...haNode.haDbNames, ...dbnames], 'stopServiceDatabases', () =>
      this.runServiceDatabasesAction(userId, hostUid, dbnames, haNode, 'stop')
    );
  }

  /** startServiceDatabases/stopServiceDatabases with the databases already held (also restartWholeService). */
  private async runServiceDatabasesAction(
    userId: string,
    hostUid: string,
    dbnames: string[],
    haNode: HaNodeState,
    action: 'start' | 'stop'
  ): Promise<BulkDatabaseActionResult> {
    const out: BulkDatabaseActionResult = { succeeded: [], failed: [], skipped: [] };
    const running = await this.readRunningOrNull(userId, hostUid);
    const targets = nonHaTargets(dbnames, haNode.haDbNames, running, action);
    await this.runHaNodeAction(userId, hostUid, haNode, action, out);
    await this.runNonHaAction(userId, hostUid, targets, action, out);
    return out;
  }

  /** The running databases, or null when the list can't be read. */
  private async readRunningOrNull(userId: string, hostUid: string): Promise<Set<string> | null> {
    try {
      return await this.readActiveDbnames(userId, hostUid);
    } catch {
      return null;
    }
  }

  /** `startdb`/`stopdb` for each of `targets`, NON_HA_BULK_ACTION_CONCURRENCY at a time. */
  private async runNonHaAction(
    userId: string,
    hostUid: string,
    targets: string[],
    action: 'start' | 'stop',
    out: BulkDatabaseActionResult
  ): Promise<void> {
    const results = await mapWithConcurrency(targets, NON_HA_BULK_ACTION_CONCURRENCY, (dbname) =>
      action === 'start' ? this.startNonHaDatabase(userId, hostUid, dbname) : this.stopNonHaDatabase(userId, hostUid, dbname)
    );
    results.forEach((result, index) => addOutcome(out, targets[index], result));
  }

  /**
   * Start the whole service on a host in one call: brokers, then databases —
   * matching `cubrid service start`. Reads cubridconf's `[service]` section
   * to decide whether server autostart is enabled (`service=...,server,...`)
   * and which non-HA databases are in the autostart list (`server=`), as the
   * engine reads them (autoStartDatabases).
   * On an HA node (getHaNodeState: cubrid.conf ha_mode not off) the HA
   * databases are brought up with one node-wide `ha_start` (runHaNodeAction)
   * whatever `service=` and `server=` say, also when `ha_db_list` is empty
   * or unreadable: the engine decides which come up, and no login is
   * checked for them.
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
  ): Promise<{ failed: ServiceFailure[]; skipped: ServiceSkip[] }> {
    // Checked once, up front — brokers start before databases below, and a
    // job-in-progress error surfacing only at the database step would mean
    // brokers already started for a service-start we should have blocked
    // outright.
    await this.assertNoActiveJob(userId, hostUid);
    const { failed, skipped } = await this.startWholeServiceSteps(userId, hostUid, (autoStart) =>
      this.startServiceDatabases(userId, hostUid, autoStart)
    );
    return { failed, skipped };
  }

  /**
   * startWholeService's steps; `startDatabases` starts the databases
   * (holding them, or not when the caller already holds them).
   * `haNodeSent`: the node-wide ha_start was sent (whatever its outcome) —
   * on an HA node, unless the database step failed as a whole.
   */
  private async startWholeServiceSteps(
    userId: string,
    hostUid: string,
    startDatabases: (autoStartServers: string[]) => Promise<BulkDatabaseActionResult>
  ): Promise<{ failed: ServiceFailure[]; skipped: ServiceSkip[]; haNodeSent: boolean }> {
    const failed: ServiceFailure[] = [];
    const skipped: ServiceSkip[] = [];
    let haNodeSent = false;

    try {
      await this.brokerService.startAllBrokers(userId, hostUid);
    } catch (err: unknown) {
      failed.push({ name: 'brokers', ...failureDetails(err) });
    }

    const cubridConf = await this.cmsConfigService.getAllSystemParam(
      userId,
      hostUid,
      CMS_CONFNAME_CUBRID
    );
    const autoStart = autoStartDatabases(cubridConf.conflist?.[0]?.confdata ?? []);

    // The non-HA autostart list only when service= includes server; on an HA
    // node the node-wide ha_start goes out either way (startDatabases does
    // it), as the user asked, unlike `cubrid service start`.
    // Brokers may already be up; a database step that throws as a whole
    // (busy database, job check, HA list read) is reported, not thrown —
    // same as stopWholeService.
    try {
      const { succeeded: dbSucceeded, failed: dbFailed, skipped: dbSkipped } = await startDatabases(autoStart);
      haNodeSent = dbSucceeded.includes(HA_NODE_STEP) || dbFailed.some((f) => f.dbname === HA_NODE_STEP);
      failed.push(...dbFailed.map(({ dbname, ...failure }) => ({ name: dbname, ...failure })));
      // Not logged in: left stopped, nothing sent to it.
      skipped.push(...dbSkipped.map(({ dbname, reason }) => ({ name: dbname, reason })));
    } catch (err: unknown) {
      failed.push({ name: 'databases', ...failureDetails(err) });
    }

    return { failed, skipped, haNodeSent };
  }

  /**
   * Stop the whole service on a host in one call: brokers, then databases —
   * deliberately the reverse of `cubrid service stop` (which stops the
   * server before the broker; verified in util_service.c's STOP case).
   * Every currently-active database (from start-info's `dblist`) is
   * stopped. On an HA node (getHaNodeState) the HA databases go down with
   * one node-wide `ha_stop` (runHaNodeAction), without a login check.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @returns Failures across brokers and databases; never throws for partial
   *   failures
   */
  @HandleCmsErrors()
  async stopWholeService(
    userId: string,
    hostUid: string
  ): Promise<{ failed: ServiceFailure[]; skipped: ServiceSkip[] }> {
    // See startWholeService's matching comment — checked once, up front, so
    // a job-in-progress block can't happen only after brokers already
    // stopped.
    await this.assertNoActiveJob(userId, hostUid);
    return this.stopWholeServiceSteps(userId, hostUid, (dbnames) =>
      this.stopServiceDatabases(userId, hostUid, dbnames)
    );
  }

  /**
   * stopWholeService's steps; `stopDatabases` stops the databases (holding
   * them, or not when the caller already holds them).
   */
  private async stopWholeServiceSteps(
    userId: string,
    hostUid: string,
    stopDatabases: (dbnames: string[]) => Promise<BulkDatabaseActionResult>
  ): Promise<{ failed: ServiceFailure[]; skipped: ServiceSkip[] }> {
    const failed: ServiceFailure[] = [];
    const skipped: ServiceSkip[] = [];

    try {
      await this.brokerService.stopAllBrokers(userId, hostUid);
    } catch (err: unknown) {
      failed.push({ name: 'brokers', ...failureDetails(err) });
    }

    // Brokers may already be stopped above regardless of what happens next —
    // an uncaught throw here would both lose that broker failure (we'd never
    // reach `return { failed }`) and skip stopping the databases entirely,
    // leaving the host in an undocumented partial-stop state. Without a
    // dbname list there is nothing to pass to stopDatabases, so surface
    // this as its own failure entry instead of continuing.
    // A running database can be missing from dblist (CMS lists only the
    // databases.txt entries whose host field matches), so the active list is
    // added to it; otherwise such a database would neither stop nor be
    // reported.
    let dbnames: string[];
    try {
      const startInfo = await this.databaseInfoService.startInfo(userId, hostUid);
      dbnames = [
        ...new Set([
          ...(startInfo?.dblist?.dbs || []).map((db) => db.dbname),
          ...(startInfo?.activelist?.active || []).map((db) => db.dbname),
        ]),
      ];
    } catch (err: unknown) {
      failed.push({ name: 'databases', ...failureDetails(err) });
      return { failed, skipped };
    }

    // stopDatabases itself can throw uncaught (its own assertNoActiveJob
    // re-check, or a getHaNodeState CMS query failure) before it ever produces
    // a per-dbname { failed } list — same reasoning as the startInfo guard
    // above, so it gets the same treatment instead of losing the brokers
    // failure already collected.
    try {
      const { failed: dbFailed, skipped: dbSkipped } = await stopDatabases(dbnames);
      failed.push(...dbFailed.map(({ dbname, ...failure }) => ({ name: dbname, ...failure })));
      // Not logged in: databases are stopped one by one here (no whole-host
      // `cubrid service stop`), so a skipped one keeps running.
      skipped.push(...dbSkipped.map(({ dbname, reason }) => ({ name: dbname, reason })));
    } catch (err: unknown) {
      failed.push({ name: 'databases', ...failureDetails(err) });
    }

    return { failed, skipped };
  }

  /**
   * Restart the whole service on a host in one call: stop it, then start it
   * as startWholeService does, which (when `service=` includes server)
   * brings up only the `server=` autostart list and the HA databases. A
   * database that was started by hand and is not in that list stays
   * stopped. Every database of the host and every HA
   * database is held for the whole sequence, so no other start/stop or job
   * on them runs in between. Which databases were running is read once they
   * are held, only to report the ones left stopped; if that read fails,
   * nothing is stopped and this throws. The start is tried even if the stop
   * reported failures (part of it did stop).
   *
   * @returns The stop and start failures and skips (as stopWholeService and
   *   startWholeService report them), and the databases that were running
   *   and are stopped now without a failure or skip saying why (not in the
   *   autostart list, or no server in `service=`); empty when the status
   *   can't be read afterwards
   */
  @HandleCmsErrors()
  async restartWholeService(userId: string, hostUid: string): Promise<ServiceRestartResult> {
    await this.assertNoActiveJob(userId, hostUid);
    const [info, haNode] = await Promise.all([
      this.databaseInfoService.startInfo(userId, hostUid),
      this.databaseInfoService.getHaNodeState(userId, hostUid),
    ]);
    const haDbNames = haNode.haDbNames;
    const held = [
      ...(info?.dblist?.dbs || []).map((db) => db.dbname),
      ...activeDbnamesOf(info),
      ...haDbNames,
    ];
    return this.holdingDatabases(userId, hostUid, held, 'restartWholeService', async () => {
      const wasRunning = await this.readActiveDbnames(userId, hostUid);
      const { failed: stopFailed, skipped: stopSkipped } = await this.stopWholeServiceSteps(userId, hostUid, (dbnames) =>
        this.runServiceDatabasesAction(userId, hostUid, dbnames, haNode, 'stop')
      );
      const { failed: startFailed, skipped: startSkipped, haNodeSent } = await this.startWholeServiceSteps(userId, hostUid, (autoStart) =>
        this.runServiceDatabasesAction(userId, hostUid, autoStart, haNode, 'start')
      );
      // A database skipped at the stop kept running; one skipped at the start
      // stayed stopped.
      const skipped: ServiceSkip[] = [
        ...stopSkipped.map((s) => ({ ...s, phase: 'stop' as const })),
        ...startSkipped
          .filter((s) => !stopSkipped.some((stop) => stop.name === s.name))
          .map((s) => ({ ...s, phase: 'start' as const })),
      ];
      const reported = new Set([...startFailed.map((f) => f.name), ...skipped.map((s) => s.name)]);
      let leftStopped: string[] = [];
      try {
        const running = await this.readActiveDbnames(userId, hostUid);
        // Once the node-wide ha_start went out, the HA databases are the
        // engine's to bring up (HA_NODE_STEP reports it); without it (no
        // server in `service=`), a stopped HA database is left stopped too.
        leftStopped = [...wasRunning].filter(
          (dbname) => !running.has(dbname) && !reported.has(dbname) && !(haNodeSent && haDbNames.has(dbname))
        );
      } catch {
        leftStopped = [];
      }
      return { stopFailed, startFailed, skipped, leftStopped };
    });
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
      // that the value is a non-null array. A running database can be
      // missing from dblist (CMS lists only the databases.txt entries whose
      // host field matches), so a running one exists too.
      const dbExists =
        (startInfo.dblist ?? []).some((el) => (el.dbs ?? []).some((db) => db.dbname === dbname)) ||
        (startInfo.activelist ?? []).some((el) => (el.active ?? []).some((db) => db.dbname === dbname));

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
    assertValidGeneralVolumeSize(request.numpage, request.pagesize);
    const host = await this.hostService.findHostInternal(userId, hostUid);

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
            path: checkFileResponse.existfile,
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
        reason: 'LOG_SIZE_NOT_POSITIVE',
        logsize: request.logsize,
      });
    }
    if (!Number.isFinite(logpagesizeBytes) || logpagesizeBytes <= 0) {
      throw DatabaseError.InvalidVolumeSize('Log page size must be a positive number in bytes', {
        reason: 'LOG_PAGE_SIZE_NOT_POSITIVE',
        logpagesize: request.logpagesize,
      });
    }
    const logsizeInPages = Math.floor((logsizeMb * 1024 * 1024) / logpagesizeBytes);
    if (logsizeInPages <= 0) {
      throw DatabaseError.InvalidVolumeSize('Log size is too small after MB->pages conversion', {
        reason: 'LOG_SIZE_TOO_SMALL',
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
   * Executes database creation, HA mode config, user update, auto-add volume, and auto-start in sequence.
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
    // createdb takes the database fields; the rest is for finishCreateDatabase.
    const {
      username: _username, updateUser: _updateUser, setAutoAddVol: _setAutoAddVol, setAutoStart: _setAutoStart,
      ...createDbRequest
    } = request;

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
    return this.finishCreateDatabase(userId, hostUid, request, response);
  }

  /**
   * A create job's createdb that was already sent to CMS when this server
   * restarted: follows the CMS task (its uuid) to its end and, when the
   * database was created, runs the follow-up steps as createDatabase does.
   * A CMS failure is thrown as createDatabase would.
   */
  async resumeCreateDatabase(
    userId: string,
    hostUid: string,
    request: CreateDatabaseWithConfigRequest,
    uuid: string
  ): Promise<CreateDatabaseWithConfigResponse> {
    await this.resumeAsyncCmsJobRequest(userId, hostUid, 'createdb', uuid);
    return this.finishCreateDatabase(userId, hostUid, request, {
      createDatabase: { success: true, data: { success: true } },
    });
  }

  /**
   * The steps after createdb succeeded (HA mode off, start, dba password,
   * auto add volume, auto start); each records its own success or error.
   */
  private async finishCreateDatabase(
    userId: string,
    hostUid: string,
    request: CreateDatabaseWithConfigRequest,
    response: CreateDatabaseWithConfigResponse
  ): Promise<CreateDatabaseWithConfigResponse> {
    const { username, updateUser, setAutoAddVol, setAutoStart, ...createDbRequest } = request;

    // 1-0. Opt this database out of the host's HA replication set, if the
    // host is HA-configured. This only runs here, AFTER createDatabaseInternal
    // has already returned successfully above — confirming `createdb` itself
    // genuinely succeeded — so it never races ahead of database creation and
    // never applies to a dbname that createdb just rejected (e.g. already
    // exists). Unlike createDatabase above, a failure here is an independent,
    // recoverable step: the database was already created either way, so we
    // record success/failure on its own response field instead of failing
    // the whole operation (same "continue even if previous steps fail"
    // pattern as startDatabase/updateUser/setAutoAddVol/setAutoStart below).
    //
    // Known residual limitation: if this step fails, no [@dbname] ha_mode=off
    // marker gets written, so deleteDatabase's HA gate will still treat this
    // database as HA-blocked until the marker is added (e.g. via a retry of
    // this step through a config endpoint) — the same pre-existing gap that
    // existed before this database could even be deleted automatically.
    const cubridConf = await this.cmsConfigService.getAllSystemParam(
      userId,
      hostUid,
      CMS_CONFNAME_CUBRID
    );
    const hostIsHaConfigured = isHostHaModeOnFromCubridConf(cubridConf);

    if (hostIsHaConfigured) {
      try {
        await this.databaseConfigService.ensureDbHaModeOff(userId, hostUid, createDbRequest.dbname);
        response.haModeConfig = {
          success: true,
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        const errorCode = (error as any)?.code || (error instanceof Error ? error.name : 'UNKNOWN');
        const errorDetails = (error as any)?.details;
        this.logger.error(`Failed to configure ha_mode=off for new database: ${errorMessage}`, errorStack);
        response.haModeConfig = {
          success: false,
          error: stepError(error, 'Failed to configure ha_mode=off for new database', errorCode, errorDetails),
        };
      }
    }

    // A freshly created database's dba user already has a blank password, so
    // an empty `userpass` is a no-op update — treating it as "requested"
    // anyway forced the database to start (see below) even with both the
    // auto-start toggle and the password field left off/empty.
    const wantsPasswordChange = Boolean(updateUser?.userpass);

    // 1-1. Start database when requested OR when updateUser needs DB access.
    // userinfo/updateuser CMS tasks require the database to be running.
    //
    // Sends the CMS `startdb` task directly instead of going through either
    // startDatabase() or startNonHaDatabase(): this whole createDatabase()
    // call already runs inside this job's own active-job lock (registered by
    // CmsJobService.createJob before executeCmsForJob invokes us), so
    // startDatabase()'s assertNoActiveJobOn() would see that same still-running
    // job and always throw OPERATION_IN_PROGRESS on itself. And
    // startNonHaDatabase() gates on ensureDbLogin(), which requires a live
    // DB login — a database this job just created has none yet, so it would
    // always throw MissingDBCredentials. Neither check means anything for a database
    // we're still in the middle of creating in this same job, and `startdb`
    // itself needs no db user credentials (see ensureDbLogin's own comment),
    // so both gates are just skipped here rather than satisfied indirectly.
    // A freshly created database is also never HA (createDatabaseInternal
    // above rejects HA hosts outright), so no ha_start branch is needed.
    if (setAutoStart || wantsPasswordChange) {
      try {
        await this.executeAsyncCmsJobRequest<
          StartDatabaseCmsRequest & { task: 'startdb' },
          BaseCmsResponse
        >(userId, hostUid, { task: 'startdb', dbname: createDbRequest.dbname });
        const startInfo = await this.databaseInfoService.startInfo(userId, hostUid);
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
          error: stepError(error, 'Failed to start database', errorCode, errorDetails),
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

        // DatabaseUserService.updateUser fetches and preserves the user's
        // real groups/authorization itself now, so these are just
        // placeholders for a caller with nothing to preserve yet (a
        // freshly-created database's dba user has none).
        const updateUserResult = await this.databaseUserService.updateUser(
          userId,
          hostUid,
          createDbRequest.dbname,
          usernameToUse,
          updateUser.userpass,
          { group: [] },
          []
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
          error: stepError(error, 'Failed to update user', errorCode, errorDetails),
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
          error: stepError(error, 'Failed to set auto-add volume', errorCode, errorDetails),
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
          error: stepError(error, 'Failed to set auto-start', errorCode, errorDetails),
        };
      }
    }

    return response;
  }

  /**
   * Delete a database (CMS task: deletedb), run as a CMS job. Refused for a
   * database that still takes part in HA. The bookkeeping after a successful
   * delete is forgetDeletedDatabase, which the job runs.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @param request Client request containing delbackup option
   * @returns The final deletedb response
   * @throws DatabaseError If the database is in HA or the request fails
   */
  @HandleCmsErrors()
  async deleteDatabaseCmsResponse(
    userId: string,
    hostUid: string,
    dbname: string,
    request: DeleteDatabaseRequest,
    onUuid?: (uuid: string) => void | Promise<void>
  ): Promise<DeleteDatabaseCmsResponse> {
    const cubridConf = await this.cmsConfigService.getAllSystemParam(
      userId,
      hostUid,
      CMS_CONFNAME_CUBRID
    );
    // A database with its own [@dbname] ha_mode=off override (e.g. one this
    // service created via createDatabaseInternal's ensureDbHaModeOff) was
    // deliberately excluded from this host's HA replication set, so it's
    // safe to delete even though the host itself is HA-configured — only
    // databases still participating in HA need to stay blocked.
    if (
      isHostHaModeOnFromCubridConf(cubridConf) &&
      !getPerDbHaModeOffDbNames(cubridConf).has(dbname)
    ) {
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

    return this.executeAsyncCmsJobRequest<DeleteDatabaseCmsRequest, DeleteDatabaseCmsResponse>(
      userId,
      hostUid,
      cmsRequest,
      { skipStatusCheck: true, onUuid }
    );
  }

  /**
   * After a successful delete: forgets the database's stored login and
   * removes it from cubrid.conf. The database is already gone, so nothing
   * here throws; what could not be done comes back as warnings for the user.
   */
  async forgetDeletedDatabase(userId: string, hostUid: string, dbname: string): Promise<Warning[]> {
    const warnings: Warning[] = [];
    // Forget this dbname's stored login profile and ensureDbLogin cache
    // entry — both are keyed by dbname alone (see DatabaseUserService), so
    // without this a database later created or renamed to reuse this exact
    // name would silently inherit this now-deleted database's credentials
    // and believed-logged-in state instead of needing its own fresh login.
    try {
      await this.databaseUserService.deleteDbProfile(userId, hostUid, dbname);
    } catch (error: unknown) {
      warnings.push({ code: 'DELETE_LOGIN_NOT_REMOVED', dbname, message: `Database "${dbname}" was deleted, but its saved login could not be removed. Remove it from the database's login settings if "${dbname}" is created again.` });
      this.logger.warn(
        `Failed to clear stored login profile/cache for deleted database ${dbname}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
        { dbname, hostUid }
      );
    }

    // Remove dbname from server parameter in cubridconf if it exists
    try {
      // Not removeAutoStart: its login gate would fail here, since the
      // stored login of this database was just cleared above. Also drops
      // its [@dbname] section.
      await this.databaseConfigService.forgetDatabaseAfterDelete(userId, hostUid, dbname);
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
        warnings.push({ code: 'DELETE_CONF_NOT_UPDATED', dbname, message: `Database "${dbname}" was deleted, but cubrid.conf could not be updated. Remove "${dbname}" from [service] server and drop its [@${dbname}] section by hand.` });
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
    return warnings;
  }
}
