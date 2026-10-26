import { Test, TestingModule } from '@nestjs/testing';
import { HostService } from '@host';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { DatabaseUserService } from '@database/user/database-user.service';
import {
  CmsConfigService,
  STATDUMP_WATCHER_INTERVAL_SEC,
  STATDUMP_WATCHER_LEASE_TTL_MS,
  STATDUMP_WATCHER_SWEEP_INTERVAL_MS,
  statdumpWatcherTarget,
} from './cms-config.service';

describe('CmsConfigService statdump watcher', () => {
  let service: CmsConfigService;
  let module: TestingModule;
  const cmsClient = { postAuthenticated: jest.fn() };
  const hostService = {
    findHostInternal: jest.fn().mockResolvedValue({ address: '10.0.0.1', port: 8001, token: 'tok' }),
  };
  const databaseUserService = { ensureDbLogin: jest.fn() };

  beforeEach(async () => {
    cmsClient.postAuthenticated.mockReset();
    databaseUserService.ensureDbLogin.mockReset();
    module = await Test.createTestingModule({
      providers: [
        CmsConfigService,
        { provide: HostService, useValue: hostService },
        { provide: CmsHttpsClientService, useValue: cmsClient },
        { provide: DatabaseUserService, useValue: databaseUserService },
      ],
    }).compile();
    service = module.get(CmsConfigService);
  });

  it('targets the local server explicitly so HA (multihost databases.txt) works', () => {
    expect(statdumpWatcherTarget('testdb29')).toBe('testdb29@127.0.0.1');
  });

  describe('startStatDumpWatcher', () => {
    it('sends start_statdump with the host-qualified name and interval', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ task: 'start_statdump', status: 'success', note: 'testdb29@127.0.0.1', pid: '4242' });

      await expect(service.startStatDumpWatcher('u1', 'h1', 'testdb29')).resolves.toEqual({ running: true, alreadyRunning: false });
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith('https://10.0.0.1:8001/cm_api', {
        task: 'start_statdump',
        dbname: 'testdb29@127.0.0.1',
        interval: String(STATDUMP_WATCHER_INTERVAL_SEC),
        token: 'tok',
      });
      // Starting a watcher needs no database login.
      expect(databaseUserService.ensureDbLogin).not.toHaveBeenCalled();
    });

    it('treats "already running" (status none) as running', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ task: 'start_statdump', status: 'none', note: 'already running' });

      await expect(service.startStatDumpWatcher('u1', 'h1', 'testdb29')).resolves.toEqual({ running: true, alreadyRunning: true });
    });

    it('rejects any other CMS failure', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ task: 'start_statdump', status: 'none', note: 'could not execute statdump' });

      await expect(service.startStatDumpWatcher('u1', 'h1', 'testdb29')).rejects.toBeDefined();
    });
  });

  describe('stopStatDumpWatcher', () => {
    it('sends stop_statdump with the same host-qualified name', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ task: 'stop_statdump', status: 'success', note: 'testdb29@127.0.0.1' });

      await expect(service.stopStatDumpWatcher('u1', 'h1', 'testdb29')).resolves.toEqual({ running: false, wasRunning: true });
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith('https://10.0.0.1:8001/cm_api', {
        task: 'stop_statdump',
        dbname: 'testdb29@127.0.0.1',
        token: 'tok',
      });
    });

    it('treats "no statdump running" as already stopped', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ task: 'stop_statdump', status: 'failed', note: 'no statdump running' });

      await expect(service.stopStatDumpWatcher('u1', 'h1', 'testdb29')).resolves.toEqual({ running: false, wasRunning: false });
    });

    it('rejects when the kill failed', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ task: 'stop_statdump', status: 'failed', note: 'testdb29@127.0.0.1', pid: '4242' });

      await expect(service.stopStatDumpWatcher('u1', 'h1', 'testdb29')).rejects.toBeDefined();
    });
  });

  describe('lease', () => {
    const stopCalls = () =>
      cmsClient.postAuthenticated.mock.calls.filter(([, body]) => body.task === 'stop_statdump');
    const succeed = () =>
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => ({ task: body.task, status: 'success', note: body.dbname }));

    beforeEach(async () => {
      jest.useFakeTimers({ now: 0 });
      succeed();
      await module.init(); // starts the sweeper
    });

    afterEach(async () => {
      await module.close();
      jest.useRealTimers();
      hostService.findHostInternal.mockReset();
      hostService.findHostInternal.mockResolvedValue({ address: '10.0.0.1', port: 8001, token: 'tok' });
    });

    it('stops a watcher whose lease was not renewed, as the user who renewed it last', async () => {
      await service.startStatDumpWatcher('u1', 'h1', 'testdb29');
      await jest.advanceTimersByTimeAsync(STATDUMP_WATCHER_LEASE_TTL_MS - 1);
      expect(stopCalls()).toHaveLength(0);

      await jest.advanceTimersByTimeAsync(STATDUMP_WATCHER_SWEEP_INTERVAL_MS);
      expect(stopCalls()).toEqual([
        ['https://10.0.0.1:8001/cm_api', { task: 'stop_statdump', dbname: 'testdb29@127.0.0.1', token: 'tok' }],
      ]);
      expect(hostService.findHostInternal).toHaveBeenLastCalledWith('u1', 'h1');

      // Dropped: not stopped again.
      await jest.advanceTimersByTimeAsync(STATDUMP_WATCHER_LEASE_TTL_MS * 2);
      expect(stopCalls()).toHaveLength(1);
    });

    it('does not expire while starts keep renewing it', async () => {
      await service.startStatDumpWatcher('u1', 'h1', 'testdb29');
      for (let i = 0; i < 5; i += 1) {
        await jest.advanceTimersByTimeAsync(60 * 1000);
        await service.startStatDumpWatcher('u1', 'h1', 'testdb29');
      }
      expect(stopCalls()).toHaveLength(0);
    });

    it('ends the lease on an explicit stop', async () => {
      await service.startStatDumpWatcher('u1', 'h1', 'testdb29');
      await service.stopStatDumpWatcher('u1', 'h1', 'testdb29');
      await jest.advanceTimersByTimeAsync(STATDUMP_WATCHER_LEASE_TTL_MS * 2);
      expect(stopCalls()).toHaveLength(1);
    });

    it('keeps the lease when an explicit stop fails, so the sweeper retries once', async () => {
      await service.startStatDumpWatcher('u1', 'h1', 'testdb29');
      cmsClient.postAuthenticated.mockResolvedValueOnce({ task: 'stop_statdump', status: 'failed', note: 'testdb29@127.0.0.1' });
      await expect(service.stopStatDumpWatcher('u1', 'h1', 'testdb29')).rejects.toBeDefined();

      await jest.advanceTimersByTimeAsync(STATDUMP_WATCHER_LEASE_TTL_MS * 3);
      expect(stopCalls()).toHaveLength(2);
    });

    it('logs a failed expiry stop and drops the lease anyway', async () => {
      const warn = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
      await service.startStatDumpWatcher('u1', 'h1', 'testdb29');
      cmsClient.postAuthenticated.mockRejectedValue(new Error('ECONNREFUSED'));

      await jest.advanceTimersByTimeAsync(STATDUMP_WATCHER_LEASE_TTL_MS * 3);
      expect(stopCalls()).toHaveLength(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
    });

    it('keeps leases for the same dbname on different hosts apart', async () => {
      hostService.findHostInternal.mockImplementation(async (_userId: string, hostUid: string) => ({
        address: hostUid === 'h1' ? '10.0.0.1' : '10.0.0.2',
        port: 8001,
        token: 'tok',
      }));
      await service.startStatDumpWatcher('u1', 'h1', 'demodb');
      await jest.advanceTimersByTimeAsync(100 * 1000);
      await service.startStatDumpWatcher('u2', 'h2', 'demodb');

      // h1's lease expires first; h2's is untouched.
      await jest.advanceTimersByTimeAsync(STATDUMP_WATCHER_LEASE_TTL_MS - 100 * 1000 + STATDUMP_WATCHER_SWEEP_INTERVAL_MS);
      expect(stopCalls().map(([url]) => url)).toEqual(['https://10.0.0.1:8001/cm_api']);

      // An explicit stop on h1 leaves h2's lease in place.
      await service.stopStatDumpWatcher('u1', 'h1', 'demodb');
      await jest.advanceTimersByTimeAsync(STATDUMP_WATCHER_LEASE_TTL_MS);
      expect(stopCalls().map(([url]) => url)).toEqual([
        'https://10.0.0.1:8001/cm_api',
        'https://10.0.0.1:8001/cm_api',
        'https://10.0.0.2:8001/cm_api',
      ]);
    });

    it('stops sweeping once the module is destroyed', async () => {
      await service.startStatDumpWatcher('u1', 'h1', 'testdb29');
      service.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(STATDUMP_WATCHER_LEASE_TTL_MS * 2);
      expect(stopCalls()).toHaveLength(0);
    });
  });
});
