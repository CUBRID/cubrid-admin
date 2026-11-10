import { pollCmsAsyncJob } from './poll-cms-async-job';
import { clearAllHostConfCache, getCachedHostConf, setCachedHostConf } from '../util/concurrency/host-conf-cache';

const HOST = 'host-1';

const deps = (postAuthenticated: jest.Mock) => ({
  hostService: { findHostInternal: jest.fn().mockResolvedValue({ address: '127.0.0.1', port: 8001, token: 't' }) },
  cmsClient: { postAuthenticated },
}) as any;

const seedDatabasesTxt = () => setCachedHostConf(HOST, 'databasesTxt', ['demodb']);

describe('pollCmsAsyncJob and the per-host conf cache', () => {
  beforeEach(() => {
    clearAllHostConfCache();
    seedDatabasesTxt();
  });

  it.each(['createdb', 'deletedb', 'renamedb', 'copydb', 'create', 'delete', 'rename', 'copy'])(
    'drops the host\'s cached databases.txt once %s ends',
    async (task) => {
      await pollCmsAsyncJob(deps(jest.fn()), 'u', HOST, task, { status: 'success' });
      expect(getCachedHostConf(HOST, 'databasesTxt')).toBeUndefined();
    }
  );

  it('drops it also when the task failed partway', async () => {
    const post = jest.fn().mockRejectedValue(new Error('socket hang up'));
    await expect(
      pollCmsAsyncJob(deps(post), 'u', HOST, 'copydb', { 'job-status': 'running', uuid: 'x' })
    ).rejects.toThrow('socket hang up');
    expect(getCachedHostConf(HOST, 'databasesTxt')).toBeUndefined();
  });

  it('keeps it after a task that does not change the database list', async () => {
    await pollCmsAsyncJob(deps(jest.fn()), 'u', HOST, 'addvoldb', { status: 'success' });
    expect(getCachedHostConf(HOST, 'databasesTxt')).toEqual(['demodb']);
  });
});
