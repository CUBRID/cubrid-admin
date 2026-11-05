import { Test, TestingModule } from '@nestjs/testing';
import { CmsJobLockService } from './cms-job-lock.service';
import { CmsJobStore } from './cms-job.store';
import { HostService } from '@host';
import { buildOperationKey } from './cms-job.types';

describe('CmsJobLockService', () => {
  let service: CmsJobLockService;
  let store: jest.Mocked<CmsJobStore>;
  let hostService: jest.Mocked<HostService>;

  const mockHost = {
    uid: 'host-uid-1',
    address: 'localhost',
    port: 8001,
  };

  const mockUserId = 'user-123';
  const mockHostUid = 'host-uid-1';
  const hostKey = `${mockHost.address}:${mockHost.port}`;

  beforeEach(async () => {
    const mockStore = {
      readGlobalOperations: jest.fn(),
      getJob: jest.fn(),
    };
    const mockHostService = {
      findHostInternal: jest.fn().mockResolvedValue(mockHost),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CmsJobLockService,
        { provide: CmsJobStore, useValue: mockStore },
        { provide: HostService, useValue: mockHostService },
      ],
    }).compile();

    service = module.get(CmsJobLockService);
    store = module.get(CmsJobStore);
    hostService = module.get(HostService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hasActiveJobForHost', () => {
    it('returns null when no operations are locked', async () => {
      store.readGlobalOperations.mockResolvedValue({});

      const result = await service.hasActiveJobForHost(mockUserId, mockHostUid);

      expect(result).toBeNull();
    });

    it('returns null when the only lock is for a different host', async () => {
      store.readGlobalOperations.mockResolvedValue({
        [buildOperationKey('other-host:9999', 'demodb')]: { jobId: 'job-1', userKey: 'uk-1' },
      });

      const result = await service.hasActiveJobForHost(mockUserId, mockHostUid);

      expect(result).toBeNull();
      expect(store.getJob).not.toHaveBeenCalled();
    });

    it('returns the job when a genuinely active job is locked for this host', async () => {
      store.readGlobalOperations.mockResolvedValue({
        [buildOperationKey(hostKey, 'demodb')]: { jobId: 'job-1', userKey: 'uk-1' },
      });
      store.getJob.mockResolvedValue({
        jobId: 'job-1',
        userId: mockUserId,
        hostUid: mockHostUid,
        dbname: 'demodb',
        type: 'backupdb',
        status: 'running',
        createdAt: new Date().toISOString(),
        payload: {} as any,
      });

      const result = await service.hasActiveJobForHost(mockUserId, mockHostUid);

      expect(result).toEqual({ jobId: 'job-1', dbname: 'demodb' });
    });

    it('ignores a stale lock whose job already finished', async () => {
      store.readGlobalOperations.mockResolvedValue({
        [buildOperationKey(hostKey, 'demodb')]: { jobId: 'job-1', userKey: 'uk-1' },
      });
      store.getJob.mockResolvedValue({
        jobId: 'job-1',
        userId: mockUserId,
        hostUid: mockHostUid,
        dbname: 'demodb',
        type: 'backupdb',
        status: 'succeeded',
        createdAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        payload: {} as any,
      });

      const result = await service.hasActiveJobForHost(mockUserId, mockHostUid);

      expect(result).toBeNull();
    });

    it('ignores a lock whose job file is missing entirely (crash before cleanup)', async () => {
      store.readGlobalOperations.mockResolvedValue({
        [buildOperationKey(hostKey, 'demodb')]: { jobId: 'job-1', userKey: 'uk-1' },
      });
      store.getJob.mockResolvedValue(null);

      const result = await service.hasActiveJobForHost(mockUserId, mockHostUid);

      expect(result).toBeNull();
    });

    it('matches on the physical host key (address:port), not the per-user hostUid', async () => {
      store.readGlobalOperations.mockResolvedValue({
        [buildOperationKey(hostKey, 'otherdb')]: { jobId: 'job-2', userKey: 'uk-2' },
      });
      store.getJob.mockResolvedValue({
        jobId: 'job-2',
        userId: 'a-different-user',
        hostUid: 'their-own-hostUid-for-the-same-physical-host',
        dbname: 'otherdb',
        type: 'unload',
        status: 'queued',
        createdAt: new Date().toISOString(),
        payload: {} as any,
      });

      const result = await service.hasActiveJobForHost(mockUserId, mockHostUid);

      expect(result).toEqual({ jobId: 'job-2', dbname: 'otherdb' });
      expect(hostService.findHostInternal).toHaveBeenCalledWith(mockUserId, mockHostUid);
    });
  });
  describe('activeJobDatabasesForHost', () => {
    const job = (type: string, dbname: string, payload: object, status = 'running') => ({ jobId: 'j', type, dbname, payload, status });

    it('names both databases of a copy (source and new) and of a rename (old and new name)', async () => {
      store.readGlobalOperations.mockResolvedValue({
        [buildOperationKey(hostKey, 'newdb')]: { jobId: 'copy-1', userKey: 'uk' },
        [buildOperationKey(hostKey, 'olddb')]: { jobId: 'rename-1', userKey: 'uk' },
      });
      store.getJob.mockImplementation(async (_uk: string, jobId: string) => (jobId === 'copy-1'
        ? job('copy', 'srcdb', { srcdbname: 'srcdb', destdbname: 'newdb' })
        : job('rename', 'olddb', { rename: 'renamed' })) as never);

      const busy = await service.activeJobDatabasesForHost(mockUserId, mockHostUid);

      expect(Object.fromEntries(busy)).toEqual({ srcdb: 'copy-1', newdb: 'copy-1', olddb: 'rename-1', renamed: 'rename-1' });
    });

    it('leaves out finished jobs and other hosts', async () => {
      store.readGlobalOperations.mockResolvedValue({
        [buildOperationKey(hostKey, 'donedb')]: { jobId: 'done', userKey: 'uk' },
        [buildOperationKey('other-host:9999', 'demodb')]: { jobId: 'other', userKey: 'uk' },
      });
      store.getJob.mockResolvedValue(job('load', 'donedb', {}, 'succeeded') as never);

      expect((await service.activeJobDatabasesForHost(mockUserId, mockHostUid)).size).toBe(0);
    });
  });
});
