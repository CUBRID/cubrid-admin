import { Test, TestingModule } from '@nestjs/testing';
import { HostService } from '@host';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { DatabaseUserService } from '@database/user/database-user.service';
import { CmsConfigService, STATDUMP_WATCHER_INTERVAL_SEC, statdumpWatcherTarget } from './cms-config.service';

describe('CmsConfigService statdump watcher', () => {
  let service: CmsConfigService;
  const cmsClient = { postAuthenticated: jest.fn() };
  const hostService = {
    findHostInternal: jest.fn().mockResolvedValue({ address: '10.0.0.1', port: 8001, token: 'tok' }),
  };
  const databaseUserService = { ensureDbLogin: jest.fn() };

  beforeEach(async () => {
    cmsClient.postAuthenticated.mockReset();
    databaseUserService.ensureDbLogin.mockReset();
    const module: TestingModule = await Test.createTestingModule({
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
});
