import { CmsJobService } from './cms-job.service';
import type { CmsJobRecord } from './cms-job.types';

jest.mock('@common', () => ({
  ...jest.requireActual('@common'),
  pollCmsAsyncJob: jest.fn(),
}));

import { pollCmsAsyncJob } from '@common';

const renameJob = (patch: Partial<CmsJobRecord> = {}): CmsJobRecord => ({
  jobId: 'job-1', userId: 'user-1', hostUid: 'host-1', dbname: 'olddb',
  type: 'rename', status: 'running', createdAt: '2026-10-26T01:00:00Z', cmsUuid: 'uuid-1',
  payload: { rename: 'newdb', exvolpath: 'none', advanced: 'off', forcedel: 'n' }, ...patch,
});

describe('CmsJobService rename alias-cache cleanup', () => {
  let service: CmsJobService;
  let store: Record<string, jest.Mock>;
  let managementService: Record<string, jest.Mock>;
  let cmsClient: { postAuthenticated: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    store = {
      getJob: jest.fn(),
      saveJob: jest.fn().mockResolvedValue(undefined),
      readGlobalOperations: jest.fn().mockResolvedValue({}),
      writeGlobalOperations: jest.fn().mockResolvedValue(undefined),
      finalizeOrphanedJob: jest.fn().mockResolvedValue(undefined),
    };
    managementService = {
      renameDatabaseCmsResponse: jest.fn().mockResolvedValue({ status: 'success' }),
      getDatabaseStartInfo: jest.fn().mockResolvedValue({ dblist: { dbs: [] } }),
      clearDbAliasCachesAfterRename: jest.fn().mockResolvedValue(undefined),
      updateAutoStartAfterRename: jest.fn().mockResolvedValue([]),
    };
    cmsClient = { postAuthenticated: jest.fn().mockResolvedValue({ status: 'success' }) };
    const lockService = { withLock: jest.fn((_file: string, fn: () => Promise<unknown>) => fn()) };
    const hostService = { findHostInternal: jest.fn().mockResolvedValue({ address: 'h', port: 8001, token: 't' }) };

    service = new CmsJobService(
      store as any,
      lockService as any,
      {} as any,
      hostService as any,
      managementService as any,
      {} as any,
      {} as any,
      cmsClient as any
    );
  });

  it('clears old/new name caches even when the post-rename startinfo lookup fails', async () => {
    const job = renameJob();
    store.getJob.mockResolvedValue(job);
    managementService.getDatabaseStartInfo.mockRejectedValue(new Error('CMS unreachable'));

    await (service as any).runJob('ukey', 'job-1', 'op-key');

    expect(managementService.clearDbAliasCachesAfterRename).toHaveBeenCalledWith(
      'user-1', 'host-1', 'olddb', 'newdb'
    );
  });

  it('ends a copy as succeeded with warnings when its follow-up or the list refresh fails', async () => {
    const job = renameJob({ type: 'copy', dbname: 'newdb', payload: { srcdbname: 'olddb', destdbname: 'newdb', move: 'y' } as any });
    store.getJob.mockResolvedValue(job);
    managementService.copyDbCmsResponse = jest.fn().mockResolvedValue({ status: 'success' });
    managementService.finishCopy = jest.fn().mockResolvedValue(['autostart not updated']);
    managementService.getDatabaseStartInfo.mockRejectedValue(new Error('CMS unreachable'));

    await (service as any).runJob('ukey', 'job-1', 'op-key');

    expect(job.status).toBe('succeeded');
    expect(job.warnings).toEqual(['autostart not updated', expect.stringContaining('could not be refreshed')]);
  });

  it('clears old/new name caches when an orphaned rename reconciles as succeeded after restart', async () => {
    (pollCmsAsyncJob as jest.Mock).mockResolvedValue({ response: { status: 'success' } });
    const job = renameJob();

    await expect((service as any).tryReconcileOrphanedJob('ukey', job)).resolves.toBe(true);

    expect(job.status).toBe('succeeded');
    expect(managementService.clearDbAliasCachesAfterRename).toHaveBeenCalledWith(
      'user-1', 'host-1', 'olddb', 'newdb'
    );
    expect(store.finalizeOrphanedJob).toHaveBeenCalledWith('ukey', job);
  });

  it('does not clear caches when an orphaned rename reconciles as failed', async () => {
    (pollCmsAsyncJob as jest.Mock).mockResolvedValue({
      response: { status: 'failure', note: 'renamedb failed' },
    });
    const job = renameJob();

    await (service as any).tryReconcileOrphanedJob('ukey', job);

    expect(job.status).toBe('failed');
    expect(managementService.clearDbAliasCachesAfterRename).not.toHaveBeenCalled();
    expect(managementService.updateAutoStartAfterRename).not.toHaveBeenCalled();
  });

  it('still finalizes a reconciled rename as succeeded if the cache cleanup throws', async () => {
    (pollCmsAsyncJob as jest.Mock).mockResolvedValue({ response: { status: 'success' } });
    managementService.clearDbAliasCachesAfterRename.mockRejectedValue(new Error('disk write failed'));
    const job = renameJob();

    await expect((service as any).tryReconcileOrphanedJob('ukey', job)).resolves.toBe(true);

    expect(job.status).toBe('succeeded');
    expect(store.finalizeOrphanedJob).toHaveBeenCalledWith('ukey', job);
  });
  it('updates autostart for a normal rename, preserving success if list refresh fails', async () => {
    const job = renameJob();
    store.getJob.mockResolvedValue(job);
    managementService.getDatabaseStartInfo.mockRejectedValue(new Error('unavailable'));
    await (service as any).runJob('ukey', job.jobId, 'op-key');
    expect(managementService.updateAutoStartAfterRename).toHaveBeenCalledWith('user-1', 'host-1', 'olddb', 'newdb');
    expect(job.status).toBe('succeeded');
    expect(job.warnings?.[0]).toContain('could not be refreshed');
    expect(managementService.renameDatabaseCmsResponse).toHaveBeenCalledTimes(1);
  });

  it('persists and exposes config warnings on a completed job', async () => {
    const job = renameJob();
    store.getJob.mockResolvedValue(job);
    managementService.updateAutoStartAfterRename.mockResolvedValue(['Rename succeeded; autostart needs attention.']);
    await (service as any).runJob('ukey', job.jobId, 'op-key');
    expect(job.status).toBe('succeeded');
    expect(store.saveJob).toHaveBeenLastCalledWith('ukey', expect.objectContaining({ warnings: job.warnings }));
    expect((service as any).toStatusResponse(job).warnings).toEqual(job.warnings);
  });

  it('updates autostart during reconciliation without resubmitting the physical rename', async () => {
    (pollCmsAsyncJob as jest.Mock).mockResolvedValue({ response: { status: 'success' } });
    const job = renameJob();
    await (service as any).tryReconcileOrphanedJob('ukey', job);
    expect(managementService.updateAutoStartAfterRename).toHaveBeenCalledWith('user-1', 'host-1', 'olddb', 'newdb');
    expect(managementService.renameDatabaseCmsResponse).not.toHaveBeenCalled();
  });

});

describe('CmsJobService delete job', () => {
  let service: CmsJobService;
  let store: Record<string, jest.Mock>;
  let lifecycleService: Record<string, jest.Mock>;
  let cmsClient: { postAuthenticated: jest.Mock };

  const deleteJob = (patch: Partial<CmsJobRecord> = {}): CmsJobRecord => ({
    jobId: 'job-2', userId: 'user-1', hostUid: 'host-1', dbname: 'gonedb',
    type: 'delete', status: 'queued', createdAt: '2026-11-02T01:00:00Z',
    payload: { delbackup: 'y' }, ...patch,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    store = {
      getJob: jest.fn(),
      saveJob: jest.fn().mockResolvedValue(undefined),
      readGlobalOperations: jest.fn().mockResolvedValue({}),
      writeGlobalOperations: jest.fn().mockResolvedValue(undefined),
      finalizeOrphanedJob: jest.fn().mockResolvedValue(undefined),
    };
    lifecycleService = {
      deleteDatabaseCmsResponse: jest.fn().mockResolvedValue({ status: 'success', task: 'deletedb' }),
      forgetDeletedDatabase: jest.fn().mockResolvedValue([]),
    };
    cmsClient = { postAuthenticated: jest.fn().mockResolvedValue({ status: 'success' }) };
    const lockService = { withLock: jest.fn((_file: string, fn: () => Promise<unknown>) => fn()) };
    const hostService = { findHostInternal: jest.fn().mockResolvedValue({ address: 'h', port: 8001, token: 't' }) };

    service = new CmsJobService(
      store as any,
      lockService as any,
      {} as any,
      hostService as any,
      {} as any,
      lifecycleService as any,
      {} as any,
      cmsClient as any
    );
  });

  it('runs deletedb with the job payload, then forgets the database', async () => {
    const job = deleteJob();
    store.getJob.mockResolvedValue(job);

    await (service as any).runJob('ukey', 'job-2', 'op-key');

    expect(lifecycleService.deleteDatabaseCmsResponse).toHaveBeenCalledWith(
      'user-1', 'host-1', 'gonedb', { delbackup: 'y' }, expect.any(Function)
    );
    expect(job.status).toBe('succeeded');
    expect(lifecycleService.forgetDeletedDatabase).toHaveBeenCalledWith('user-1', 'host-1', 'gonedb');
  });

  it('shows what the cleanup after a delete could not do as job warnings, the job still succeeded', async () => {
    const job = deleteJob();
    store.getJob.mockResolvedValue(job);
    lifecycleService.forgetDeletedDatabase.mockResolvedValue(['cubrid.conf could not be updated']);

    await (service as any).runJob('ukey', 'job-2', 'op-key');

    expect(job.status).toBe('succeeded');
    expect(job.warnings).toEqual(['cubrid.conf could not be updated']);
  });

  it('keeps the stored login and cubrid.conf entry when deletedb fails', async () => {
    const job = deleteJob();
    store.getJob.mockResolvedValue(job);
    lifecycleService.deleteDatabaseCmsResponse.mockResolvedValue({ status: 'failure', note: 'database is running' });

    await (service as any).runJob('ukey', 'job-2', 'op-key');

    expect(job.status).toBe('failed');
    expect(job.error?.message).toContain('database is running');
    expect(lifecycleService.forgetDeletedDatabase).not.toHaveBeenCalled();
  });

  it('reports a refused delete (e.g. an HA database) as a failed job', async () => {
    const job = deleteJob();
    store.getJob.mockResolvedValue(job);
    lifecycleService.deleteDatabaseCmsResponse.mockRejectedValue(new Error('Cannot delete databases on hosts configured for HA.'));

    await (service as any).runJob('ukey', 'job-2', 'op-key');

    expect(job.status).toBe('failed');
    expect(job.error?.message).toContain('HA');
    expect(lifecycleService.forgetDeletedDatabase).not.toHaveBeenCalled();
  });

  it('forgets the database when an orphaned delete reconciles as succeeded after restart', async () => {
    (pollCmsAsyncJob as jest.Mock).mockResolvedValue({ response: { status: 'success' } });
    const job = deleteJob({ status: 'running', cmsUuid: 'uuid-2' });

    await expect((service as any).tryReconcileOrphanedJob('ukey', job)).resolves.toBe(true);

    expect(job.status).toBe('succeeded');
    expect(lifecycleService.forgetDeletedDatabase).toHaveBeenCalledWith('user-1', 'host-1', 'gonedb');
  });
});
