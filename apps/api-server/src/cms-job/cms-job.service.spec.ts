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
  });

  it('still finalizes a reconciled rename as succeeded if the cache cleanup throws', async () => {
    (pollCmsAsyncJob as jest.Mock).mockResolvedValue({ response: { status: 'success' } });
    managementService.clearDbAliasCachesAfterRename.mockRejectedValue(new Error('disk write failed'));
    const job = renameJob();

    await expect((service as any).tryReconcileOrphanedJob('ukey', job)).resolves.toBe(true);

    expect(job.status).toBe('succeeded');
    expect(store.finalizeOrphanedJob).toHaveBeenCalledWith('ukey', job);
  });
});
