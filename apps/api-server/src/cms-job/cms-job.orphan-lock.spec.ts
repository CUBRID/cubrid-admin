import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CmsJobService } from './cms-job.service';
import { CmsJobStore } from './cms-job.store';
import { LockService } from '../lock/lock.service';
import type { CmsJobRecord } from './cms-job.types';

// A followed (orphaned) job ends minutes after the restart; meanwhile
// createJob may write a lock for another job. Ending the orphan must not
// drop that lock. Real store and file lock on a temp storage folder.
describe('ending a job followed after a restart keeps locks written meanwhile', () => {
  const saved = process.env.STORAGE_PATH;
  let store: CmsJobStore;
  let lockService: LockService;
  let service: CmsJobService;
  const GLOBAL = 'jobs-ops-global';
  const job = (jobId: string): CmsJobRecord => ({
    jobId, userId: 'u', hostUid: 'h', dbname: jobId, type: 'create', status: 'succeeded',
    createdAt: '2026-11-06T00:00:00Z', payload: {} as never,
  });
  const addLock = (key: string, jobId: string) => lockService.withLock(GLOBAL, async () => {
    const ops = await store.readGlobalOperations();
    ops[key] = { jobId, userKey: 'uk' };
    await store.writeGlobalOperations(ops);
  });

  beforeEach(async () => {
    process.env.STORAGE_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-jobs-'));
    store = new CmsJobStore();
    lockService = new LockService();
    service = new CmsJobService(store, lockService, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    await store.writeGlobalOperations({ '["h:1","olddb"]': { jobId: 'orphan-1', userKey: 'uk' }, '["h:1","other"]': { jobId: 'orphan-2', userKey: 'uk' } });
    // The orphan's read of the lock file is slow, so a lock written by
    // createJob lands between its read and its write back.
    const read = store.readGlobalOperations.bind(store);
    let first = true;
    jest.spyOn(store, 'readGlobalOperations').mockImplementation(async () => {
      const ops = await read();
      if (first) { first = false; await new Promise((r) => setTimeout(r, 150)); }
      return ops;
    });
  });
  afterEach(() => {
    process.env.STORAGE_PATH = saved;
    jest.restoreAllMocks();
  });

  it('keeps a lock createJob wrote while the orphan was being ended', async () => {
    await Promise.all([
      (service as any).finalizeOrphan('uk', job('orphan-1')),
      new Promise((r) => setTimeout(r, 30)).then(() => addLock('["h:1","newdb"]', 'new-job')),
    ]);
    const ops = await store.readGlobalOperations();
    expect(Object.values(ops).map((e) => e.jobId).sort()).toEqual(['new-job', 'orphan-2']);
  });

  it('two orphans ending at once both drop their own lock and nothing else', async () => {
    await Promise.all([
      (service as any).finalizeOrphan('uk', job('orphan-1')),
      (service as any).finalizeOrphan('uk', job('orphan-2')),
      new Promise((r) => setTimeout(r, 30)).then(() => addLock('["h:1","newdb"]', 'new-job')),
    ]);
    const ops = await store.readGlobalOperations();
    expect(Object.values(ops).map((e) => e.jobId)).toEqual(['new-job']);
  });
});
