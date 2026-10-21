import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  AddVolDbRequest,
  BackupDbClientRequest,
  CheckDatabaseRequest,
  CompactDatabaseRequest,
  CopyDbRequest,
  CreateDatabaseWithConfigRequest,
  CreateDatabaseWithConfigResponse,
  CmsJobStatusResponse,
  CmsJobType,
  CreateCmsJobResponse,
  LoadDatabaseRequest,
  OptimizeDatabaseRequest,
  RenameDatabaseRequest,
  RestoreDbClientRequest,
  UnloadDatabaseRequest,
} from '@api-interfaces';
import { extractCmsLongJobFailureMessage, isCmsLongJobFailure, pollCmsAsyncJob } from '@common';
import { AppError } from '@error';
import { DatabaseError } from '@error/database/database-error';
import { DatabaseManagementService } from '@database/management/database-management.service';
import { DatabaseLifecycleService } from '@database/lifecycle/database-lifecycle.service';
import { DatabaseBackupService } from '@database/backup/database-backup.service';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { EncryptionService } from '@security';
import { HostService } from '@host';
import { LockService } from '@lock/lock.service';
import {
  buildOperationKey,
  CmsJobPayload,
  CmsJobRecord,
  resolveJobDbname,
} from './cms-job.types';
import { CmsJobStore } from './cms-job.store';
import { CMS_JOB_CLEANUP_INTERVAL_MS, isTerminalJobStatus } from './cms-job.cleanup';
import { CMS_JOB_RECENT_LIST_LIMIT } from './cms-job.constants';
import { getMaintenanceResult, getMaintenanceSummary, redactMaintenanceText } from './maintenance-job';

@Injectable()
export class CmsJobService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CmsJobService.name);
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Fixed name, not per-user — every user's createJob call serializes
  // through this SAME lock file, since the operations it guards
  // (readGlobalOperations/writeGlobalOperations) are shared across accounts.
  private static readonly GLOBAL_OPS_LOCK_FILE = 'jobs-ops-global';

  constructor(
    private readonly store: CmsJobStore,
    private readonly lockService: LockService,
    private readonly encryptionService: EncryptionService,
    private readonly hostService: HostService,
    private readonly managementService: DatabaseManagementService,
    private readonly lifecycleService: DatabaseLifecycleService,
    private readonly backupService: DatabaseBackupService,
    private readonly cmsClient: CmsHttpsClientService
  ) {}

  private userKey(userId: string): string {
    return this.encryptionService.getHashedValue(userId);
  }

  // The physical CMS host, not the per-user hostUid (each user registers
  // "the same" host under their own uid) — this is what actually identifies
  // a shared target for the global operation lock.
  private async hostKey(userId: string, hostUid: string): Promise<string> {
    const host = await this.hostService.findHostInternal(userId, hostUid);
    return `${host.address}:${host.port}`;
  }

  onModuleInit(): void {
    void this.recoverOrphanedJobsOnStartup();
    void this.runJobCleanup('startup');
    this.cleanupTimer = setInterval(
      () => void this.runJobCleanup('interval'),
      CMS_JOB_CLEANUP_INTERVAL_MS
    );
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Restart drops in-process workers (and their poll loops) but the job files
   * may still say queued/running, and CMS itself doesn't know or care that
   * our process restarted — it keeps a still-running async task alive
   * independent of us. For any orphan with a persisted `cmsUuid`, try
   * re-attaching to that real CMS task (same `pollCmsAsyncJob` used by a live
   * job, just starting from a fresh `gettaskstatus` instead of a fresh
   * submission) before giving up and marking it failed — a job that actually
   * finished (or is still going) overnight shouldn't be reported as
   * "interrupted" just because our own process happened to restart.
   *
   * `create` jobs are excluded: their outcome is a composite of createdb plus
   * several follow-up CMS calls (start/updateUser/setAutoAddVol/setAutoStart)
   * that `applyCmsOutcome` can't reconstruct from a single gettaskstatus
   * response, so those still fall back to the plain "interrupted" failure.
   */
  private async recoverOrphanedJobsOnStartup(): Promise<void> {
    if (process.env.CMS_JOB_RECOVER_ON_STARTUP === 'false') {
      return;
    }

    try {
      const orphans = await this.store.listOrphanedActiveJobs();
      let reconciled = 0;
      let failed = 0;

      for (const { userKey, job } of orphans) {
        if (await this.tryReconcileOrphanedJob(userKey, job)) {
          reconciled += 1;
        } else {
          job.status = 'failed';
          job.error = {
            message: 'Job interrupted because the API server restarted.',
            code: 'JOB_INTERRUPTED',
          };
          job.finishedAt = job.finishedAt ?? new Date().toISOString();
          await this.store.finalizeOrphanedJob(userKey, job);
          failed += 1;
        }
      }

      if (reconciled > 0) {
        this.logger.warn(`Reconciled ${reconciled} orphaned CMS job(s) against their real CMS outcome after startup`);
      }
      if (failed > 0) {
        this.logger.warn(`Marked ${failed} orphaned CMS job(s) as failed after startup`);
      }
    } catch (err: unknown) {
      this.logger.warn(
        `CMS job orphan recovery failed: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  /** Returns true if the job was resolved (success or a real CMS failure) and finalized. */
  private async tryReconcileOrphanedJob(userKey: string, job: CmsJobRecord): Promise<boolean> {
    if (!job.cmsUuid || job.type === 'create') {
      return false;
    }

    try {
      const host = await this.hostService.findHostInternal(job.userId, job.hostUid);
      const url = `https://${host.address}:${host.port}/cm_api`;
      const initialResponse = await this.cmsClient.postAuthenticated<
        { task: string; token: string; uuid: string },
        any
      >(url, { task: 'gettaskstatus', token: host.token || '', uuid: job.cmsUuid });

      const { response } = await pollCmsAsyncJob(
        { hostService: this.hostService, cmsClient: this.cmsClient },
        job.userId,
        job.hostUid,
        job.type,
        initialResponse
      );

      this.applyCmsOutcome(job, response);
      job.finishedAt = job.finishedAt ?? new Date().toISOString();
      await this.store.finalizeOrphanedJob(userKey, job);
      return true;
    } catch (err: unknown) {
      this.logger.warn(
        `Could not reconcile orphaned job ${job.jobId} (uuid ${job.cmsUuid}) against CMS: ${
          err instanceof Error ? err.message : err
        }`
      );
      return false;
    }
  }

  private async runJobCleanup(reason: string): Promise<void> {
    try {
      const removed = await this.store.purgeExpiredJobs();
      if (removed > 0) {
        this.logger.log(`Purged ${removed} CMS job file(s) (${reason})`);
      }
    } catch (err: unknown) {
      this.logger.warn(
        `CMS job cleanup failed (${reason}): ${err instanceof Error ? err.message : err}`
      );
    }
  }

  async createJob(
    userId: string,
    hostUid: string,
    type: CmsJobType,
    dbname: string,
    payload: CmsJobPayload
  ): Promise<CreateCmsJobResponse> {
    const uKey = this.userKey(userId);
    const lockDbname = resolveJobDbname(type, dbname, payload);
    const hKey = await this.hostKey(userId, hostUid);
    const operationKey = buildOperationKey(hKey, lockDbname);
    const jobId = uuidv4();

    await this.lockService.withLock(CmsJobService.GLOBAL_OPS_LOCK_FILE, async () => {
      const ops = await this.store.readGlobalOperations();
      const existing = ops[operationKey];
      if (existing) {
        // Stale lock check: the referenced job may have finished or been deleted without
        // releasing the lock (e.g. server crash before finally block ran).
        // Without this check a dead lock blocks the same DB operation for up to 1 hour.
        const existingJob = await this.store.getJob(existing.userKey, existing.jobId);
        const isStale = !existingJob || isTerminalJobStatus(existingJob.status);
        if (isStale) {
          this.logger.warn(
            `Clearing stale operation lock for ${operationKey} (job ${existing.jobId} is ${existingJob?.status ?? 'missing'})`
          );
          delete ops[operationKey];
        } else {
          throw DatabaseError.OperationInProgress({
            hostUid,
            dbname: lockDbname,
            existingJobId: existing.jobId,
          });
        }
      }
      ops[operationKey] = { jobId, userKey: uKey };
      await this.store.writeGlobalOperations(ops);
    });

    const record: CmsJobRecord = {
      jobId,
      userId,
      hostUid,
      dbname: lockDbname,
      type,
      status: 'queued',
      createdAt: new Date().toISOString(),
      payload,
    };
    await this.store.saveJob(uKey, record);

    setImmediate(() => {
      void this.runJob(uKey, jobId, operationKey).catch((err) => {
        this.logger.error(`Job ${jobId} crashed: ${err?.message || err}`, err?.stack);
      });
    });

    return { jobId };
  }

  createUnloadJob(
    userId: string,
    hostUid: string,
    dbname: string,
    payload: UnloadDatabaseRequest
  ): Promise<CreateCmsJobResponse> {
    return this.createJob(userId, hostUid, 'unload', dbname, payload);
  }

  createLoadJob(
    userId: string,
    hostUid: string,
    dbname: string,
    payload: LoadDatabaseRequest
  ): Promise<CreateCmsJobResponse> {
    return this.createJob(userId, hostUid, 'load', dbname, payload);
  }

  private applyCmsOutcome(job: CmsJobRecord, cmsResponse: unknown): boolean {
    if (job.type === 'create') {
      const res = cmsResponse as CreateDatabaseWithConfigResponse;

      // The database itself is the artifact the job is about — a later
      // follow-up step failing (auto-start, dba password, auto-add-vol
      // config) doesn't mean creation failed, it means the database now
      // exists but needs manual follow-up. Reporting the whole job as
      // "failed" in that case hid a database that actually got created.
      // Each step's own success/error is still on job.result either way.
      if (res?.createDatabase?.success !== true) {
        job.status = 'failed';
        job.error = {
          message: res?.createDatabase?.error?.message || 'Create database failed',
          code: res?.createDatabase?.error?.code,
        };
        job.result = res;
        return false;
      }

      job.status = 'succeeded';
      job.result = res;
      return true;
    }

    if (isCmsLongJobFailure(cmsResponse)) {
      job.status = 'failed';
      job.error = {
        message: extractCmsLongJobFailureMessage(cmsResponse),
        cmsStatus: String((cmsResponse as { status?: string }).status ?? ''),
      };
      if (getMaintenanceSummary(job)) {
        job.error.message = redactMaintenanceText(job, cmsResponse, job.error.message);
        job.result = getMaintenanceResult(job, cmsResponse, false);
      }
      return false;
    }

    job.status = 'succeeded';
    job.result = this.mapJobResult(job, cmsResponse);
    return true;
  }

  private mapJobResult(job: CmsJobRecord, cmsResponse: unknown): unknown {
    if (getMaintenanceSummary(job)) {
      return getMaintenanceResult(job, cmsResponse, true);
    }
    if (!cmsResponse || typeof cmsResponse !== 'object') {
      return { success: true };
    }

    const response = cmsResponse as Record<string, unknown>;

    switch (job.type) {
      case 'unload':
        return response.result ?? {};
      case 'compact':
        return response.log
          ? { success: true, log: response.log }
          : { success: true };
      case 'addvol':
        return {
          dbname: response.dbname,
          purpose: response.purpose,
        };
      default:
        return { success: true };
    }
  }

  private cmsResponseFromError(err: unknown): unknown | undefined {
    if (!err || typeof err !== 'object') {
      return undefined;
    }
    const additional = (err as { additionalData?: { response?: unknown } }).additionalData;
    return additional?.response;
  }

  private async executeCmsForJob(uKey: string, job: CmsJobRecord): Promise<unknown> {
    const { userId, hostUid, type, payload } = job;

    // Persisted as soon as CMS returns it, not just held in the poll loop's
    // local variable — otherwise a mid-job failure (e.g. the host token
    // going invalid on a long job) loses it for good, with no way to check
    // what actually happened to that CMS-side task afterward.
    const onUuid = async (uuid: string) => {
      if (job.cmsUuid === uuid) return;
      job.cmsUuid = uuid;
      await this.store.saveJob(uKey, job);
    };

    switch (type) {
      case 'create':
        return this.lifecycleService.createDatabase(
          userId,
          hostUid,
          payload as CreateDatabaseWithConfigRequest,
          onUuid
        );
      case 'unload':
        return this.managementService.unloadDatabaseCmsResponse(
          userId,
          hostUid,
          job.dbname,
          payload as UnloadDatabaseRequest,
          onUuid
        );
      case 'load':
        return this.managementService.loadDatabaseCmsResponse(
          userId,
          hostUid,
          job.dbname,
          payload as LoadDatabaseRequest,
          onUuid
        );
      case 'optimize':
        return this.managementService.optimizeDatabaseCmsResponse(
          userId,
          hostUid,
          job.dbname,
          payload as OptimizeDatabaseRequest,
          onUuid
        );
      case 'check':
        return this.managementService.checkDatabaseCmsResponse(
          userId,
          hostUid,
          job.dbname,
          payload as CheckDatabaseRequest,
          onUuid
        );
      case 'compact':
        return this.managementService.compactDatabaseCmsResponse(
          userId,
          hostUid,
          job.dbname,
          payload as CompactDatabaseRequest,
          onUuid
        );
      case 'copy':
        return this.managementService.copyDbCmsResponse(
          userId,
          hostUid,
          payload as CopyDbRequest,
          onUuid
        );
      case 'addvol':
        return this.managementService.addVolDbCmsResponse(
          userId,
          hostUid,
          job.dbname,
          payload as AddVolDbRequest,
          onUuid
        );
      case 'rename':
        return this.managementService.renameDatabaseCmsResponse(
          userId,
          hostUid,
          job.dbname,
          payload as RenameDatabaseRequest,
          onUuid
        );
      case 'backupdb':
        return this.backupService.backupDb(
          userId,
          hostUid,
          job.dbname,
          payload as BackupDbClientRequest,
          onUuid
        );
      case 'restore':
        return this.backupService.restoreDb(
          userId,
          hostUid,
          job.dbname,
          payload as RestoreDbClientRequest,
          onUuid
        );
      default:
        throw new Error(`Unsupported job type: ${type}`);
    }
  }

  private async runJob(uKey: string, jobId: string, operationKey: string): Promise<void> {
    const job = await this.store.getJob(uKey, jobId);
    if (!job) return;

    job.status = 'running';
    job.startedAt = new Date().toISOString();
    await this.store.saveJob(uKey, job);

    try {
      const cmsResponse = await this.executeCmsForJob(uKey, job);
      const succeeded = this.applyCmsOutcome(job, cmsResponse);

      if (succeeded && (job.type === 'rename' || job.type === 'copy')) {
        job.result = await this.managementService.getDatabaseStartInfo(job.userId, job.hostUid);

        if (job.type === 'rename') {
          // Best-effort: a failure here must not flip an already-successful
          // rename job to "failed" (it would be caught by the outer catch
          // below and misreport the rename itself as having failed).
          try {
            const renameTo = (job.payload as RenameDatabaseRequest)?.rename;
            await this.managementService.clearDbAliasCachesAfterRename(
              job.userId,
              job.hostUid,
              job.dbname,
              renameTo
            );
          } catch (err: unknown) {
            this.logger.warn(
              `Failed to clear stale login profile/cache after renaming database ${job.dbname}: ` +
              `${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }
    } catch (err: unknown) {
      if (job.type === 'create') {
        job.status = 'failed';
        job.error = {
          message: this.jobErrorMessage(err, 'Create database failed'),
        };
      } else {
        const cmsFromError = this.cmsResponseFromError(err);
        if (cmsFromError && isCmsLongJobFailure(cmsFromError)) {
          this.applyCmsOutcome(job, cmsFromError);
        } else {
          job.status = 'failed';
          job.error = {
            message: this.jobErrorMessage(err, 'CMS operation failed'),
          };
          if (getMaintenanceSummary(job)) {
            job.error.message = redactMaintenanceText(job, cmsFromError, job.error.message);
            job.result = getMaintenanceResult(job, cmsFromError, false);
          }
        }
      }
    } finally {
      job.finishedAt = new Date().toISOString();
      await this.store.saveJob(uKey, job);
      await this.lockService.withLock(CmsJobService.GLOBAL_OPS_LOCK_FILE, async () => {
        const ops = await this.store.readGlobalOperations();
        if (ops[operationKey]?.jobId === jobId) {
          delete ops[operationKey];
          await this.store.writeGlobalOperations(ops);
        }
      });
    }
  }

  /**
   * AppError#message is the internal error code (e.g. 'REQUEST_FAILED'), not the
   * human-readable CMS detail — that only exists via toProblemDetails().detail.
   */
  private jobErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof AppError) {
      return err.toProblemDetails().detail ?? fallback;
    }
    return err instanceof Error ? err.message : fallback;
  }

  async getJob(userId: string, jobId: string): Promise<CmsJobStatusResponse> {
    const record = await this.store.getJob(this.userKey(userId), jobId);
    if (!record || record.userId !== userId) {
      throw new NotFoundException(`Job not found: ${jobId}`);
    }
    return this.toStatusResponse(record);
  }

  async listActiveJobs(userId: string): Promise<CmsJobStatusResponse[]> {
    const jobs = await this.store.listJobsForUser(this.userKey(userId));
    return jobs
      .filter((j) => j.userId === userId && (j.status === 'queued' || j.status === 'running'))
      .map((j) => this.toStatusResponse(j));
  }

  /**
   * Active jobs plus recently-finished ones (bounded by the same retention
   * window `purgeExpiredJobs` enforces), most recent first. Lets a client
   * reconnecting after a while (browser closed, tab reloaded) learn about a
   * job that finished while it was gone — `listActiveJobs` alone only shows
   * jobs still queued/running, so a completed job's result was otherwise
   * unrecoverable even though its record is still sitting on disk.
   */
  async listRecentJobs(userId: string): Promise<CmsJobStatusResponse[]> {
    const jobs = await this.store.listJobsForUser(this.userKey(userId));
    return jobs
      .filter((j) => j.userId === userId)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, CMS_JOB_RECENT_LIST_LIMIT)
      .map((j) => this.toStatusResponse(j));
  }

  private toStatusResponse(record: CmsJobRecord): CmsJobStatusResponse {
    const maintenanceSummary = getMaintenanceSummary(record);
    return {
      jobId: record.jobId,
      type: record.type,
      jobStatus: record.status,
      hostUid: record.hostUid,
      dbname: record.dbname,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      maintenanceSummary,
      result: record.result,
      error: maintenanceSummary && record.error
        ? { ...record.error, message: redactMaintenanceText(record, undefined, record.error.message) }
        : record.error,
    };
  }
}
