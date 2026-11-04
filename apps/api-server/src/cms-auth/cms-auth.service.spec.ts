import { Test, TestingModule } from '@nestjs/testing';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { CmsConfigService } from '@cms-config/cms-config.service';
import { UserRepositoryService } from '@repository';
import { HaService } from '@ha';
import { DatabaseUserService } from '@database/user/database-user.service';
import { HostService } from '@host';
import { CONNECT_LOGIN_DEADLINE_MS, CmsAuthService } from './cms-auth.service';
import { HostInfo, User } from '@type/index';
import { getHost } from '@host/host-group.util';

describe('CMSAuthService', () => {
  let service: CmsAuthService;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CmsAuthService,
        { provide: CmsHttpsClientService, useValue: { postPublic: jest.fn() } },
        {
          provide: UserRepositoryService,
          useValue: { loadUserById: jest.fn(), atomicUpdateUser: jest.fn() },
        },
        { provide: CmsConfigService, useValue: { getAllSystemParam: jest.fn() } },
        { provide: HaService, useValue: { heartbeatlistInternal: jest.fn() } },
        { provide: DatabaseUserService, useValue: { restoreDbLoginsAfterHostLogin: jest.fn() } },
        { provide: HostService, useValue: { updateHost: jest.fn(), checkHostUpdate: jest.fn() } },
      ],
    }).compile();

    moduleRef = module;
    service = module.get<CmsAuthService>(CmsAuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('CMS session tracking', () => {
    const host = () => ({
      uid: 'h1', id: 'admin', address: '10.0.0.1', port: 8001, password: 'pw',
      alias: 'h1', initialLogin: true, dbProfiles: {}, token: 'old-token',
    });
    let user: User;
    const saved = () => getHost(user, 'h1') as HostInfo;
    let client: { postPublic: jest.Mock };
    let repository: { loadUserById: jest.Mock; atomicUpdateUser: jest.Mock };
    let cmsConfig: { getAllSystemParam: jest.Mock };

    beforeEach(() => {
      user = { host_groups: { g: { name: 'G', hosts: { h1: host() } } } } as unknown as User;
      client = moduleRef.get(CmsHttpsClientService);
      repository = moduleRef.get(UserRepositoryService);
      cmsConfig = moduleRef.get(CmsConfigService);
      repository.loadUserById.mockResolvedValue(user);
      repository.atomicUpdateUser.mockImplementation(async (_id, update) => update(user));
      client.postPublic.mockResolvedValue({ status: 'success', token: 'new-token' });
      jest.spyOn(service, 'getHaInfo').mockResolvedValue({ success: true, isHA: false });
    });

    it('stores the login time and cm.conf token_active_time with the new token', async () => {
      cmsConfig.getAllSystemParam.mockResolvedValue({ conflist: [{ confdata: ['token_active_time=600'] }] });
      const before = Date.now();

      await service.login('u1', 'h1');

      expect(saved().token).toBe('new-token');
      expect(saved().cmsTokenIssuedAt).toBeGreaterThanOrEqual(before);
      expect(saved().cmsTokenActiveTimeSec).toBe(600);
      expect(cmsConfig.getAllSystemParam).toHaveBeenCalledWith('u1', 'h1', 'cmconf');
    });

    it('starts logging back in to the databases the old token had, before anything else awaits', async () => {
      let readCmConf!: () => void;
      cmsConfig.getAllSystemParam.mockReturnValue(new Promise((resolve) => { readCmConf = () => resolve({ conflist: [{ confdata: [] }] }); }));
      const restore = moduleRef.get(DatabaseUserService).restoreDbLoginsAfterHostLogin as jest.Mock;

      const login = service.login('u1', 'h1');
      await new Promise((r) => setImmediate(r));
      expect(restore).toHaveBeenCalledWith('u1', 'h1', 'new-token');
      readCmConf();
      await login;
    });

    it('still logs in when cm.conf cannot be read, leaving the CMS default', async () => {
      cmsConfig.getAllSystemParam.mockRejectedValue(new Error('denied'));

      await expect(service.login('u1', 'h1')).resolves.toEqual({ success: true, isHA: false });

      expect(saved().cmsTokenActiveTimeSec).toBeUndefined();
    });

    it('flags a CMS account still on the installed admin/admin password', async () => {
      cmsConfig.getAllSystemParam.mockResolvedValue({ conflist: [] });
      saved().password = 'admin';

      await expect(service.login('u1', 'h1')).resolves.toEqual({ success: true, isHA: false, usesDefaultPassword: true });
    });

    it('names a login that CMS answered without a token', async () => {
      client.postPublic.mockResolvedValue({ status: 'success', task: 'login' });

      const err = await service.login('u1', 'h1').catch((e) => e);

      expect(err.toProblemDetails()).toMatchObject({
        type: '/errors/cms/request_failed',
        reason: 'NO_TOKEN',
        detail: 'CMS login did not return a token',
      });
      expect(saved().token).toBe('old-token');
    });

    it('does not flag admin with a changed password', async () => {
      cmsConfig.getAllSystemParam.mockResolvedValue({ conflist: [] });

      await expect(service.login('u1', 'h1')).resolves.toEqual({ success: true, isHA: false });
    });

    it('forgets the session on disconnect but keeps the token', async () => {
      saved().cmsTokenIssuedAt = 123;

      await service.disconnect('u1', 'h1');

      expect(saved().cmsTokenIssuedAt).toBeUndefined();
      expect(saved().token).toBe('old-token');
    });

    describe('connect', () => {
      let updateHost: jest.Mock;

      beforeEach(() => {
        cmsConfig.getAllSystemParam.mockResolvedValue({ conflist: [] });
        updateHost = moduleRef.get(HostService).updateHost as jest.Mock;
        updateHost.mockImplementation(async (_userId, _uid, changes) => Object.assign(saved(), changes));
      });

      afterEach(() => jest.useRealTimers());

      it('logs in with the changed settings and saves them with the new session', async () => {
        await expect(service.connect('u1', 'h1', { port: 8002, alias: 'renamed' })).resolves.toEqual({
          success: true,
          isHA: false,
        });

        expect(client.postPublic).toHaveBeenCalledWith(
          'https://10.0.0.1:8002/cm_api',
          expect.objectContaining({ task: 'login', port: '8002', password: 'pw' }),
          { notAfter: expect.any(Number) }
        );
        expect(updateHost).toHaveBeenCalledWith('u1', 'h1', { port: 8002, alias: 'renamed', token: 'new-token' });
        expect(client.postPublic.mock.invocationCallOrder[0]).toBeLessThan(updateHost.mock.invocationCallOrder[0]);
        expect(saved()).toMatchObject({ port: 8002, alias: 'renamed', token: 'new-token', initialLogin: false });
      });

      it('checks the save first, so a save that would be refused sends no login', async () => {
        const checkHostUpdate = moduleRef.get(HostService).checkHostUpdate as jest.Mock;
        checkHostUpdate.mockRejectedValue(Object.assign(new Error('DUPLICATED_ALIAS'), { code: 'DUPLICATED_ALIAS' }));

        await expect(service.connect('u1', 'h1', { alias: 'taken' })).rejects.toMatchObject({ code: 'DUPLICATED_ALIAS' });

        expect(checkHostUpdate).toHaveBeenCalledWith('u1', 'h1', { alias: 'taken' });
        expect(client.postPublic).not.toHaveBeenCalled();
        expect(updateHost).not.toHaveBeenCalled();
      });

      it('starts the DB re-login right after saving the new token, before anything else awaits', async () => {
        const restore = moduleRef.get(DatabaseUserService).restoreDbLoginsAfterHostLogin as jest.Mock;
        let finishAdopt!: () => void;
        repository.atomicUpdateUser.mockImplementationOnce(
          (_id, update) => new Promise((resolve) => { finishAdopt = () => resolve(update(user)); })
        );

        const connect = service.connect('u1', 'h1', { port: 8002 });
        await new Promise((r) => setImmediate(r));
        // updateHost stored the new token; adoptToken's write has not finished.
        expect(updateHost).toHaveBeenCalled();
        expect(restore).toHaveBeenCalledTimes(1);
        expect(restore).toHaveBeenCalledWith('u1', 'h1', 'new-token');
        finishAdopt();
        await connect;
        expect(restore).toHaveBeenCalledTimes(1);
      });

      it('saves nothing when the login with the changed settings fails', async () => {
        client.postPublic.mockResolvedValue({ status: 'failure', note: 'Incorrect or missing password' });

        await expect(service.connect('u1', 'h1', { password: 'wrong' })).rejects.toMatchObject({ code: 'REQUEST_FAILED' });

        expect(updateHost).not.toHaveBeenCalled();
        expect(saved()).toMatchObject({ password: 'pw', token: 'old-token' });
      });

      it('saves nothing when the CMS has not let the login through by the deadline, even if it does later', async () => {
        jest.useFakeTimers();
        let answer!: (response: unknown) => void;
        client.postPublic.mockReturnValue(new Promise((resolve) => { answer = resolve; }));

        const connect = service.connect('u1', 'h1', { port: 8002 });
        const failed = expect(connect).rejects.toMatchObject({ code: 'NO_RESPONSE' });
        await jest.advanceTimersByTimeAsync(CONNECT_LOGIN_DEADLINE_MS);
        await failed;
        answer({ status: 'success', token: 'late-token' });
        await jest.advanceTimersByTimeAsync(0);

        expect(updateHost).not.toHaveBeenCalled();
        expect(saved()).toMatchObject({ port: 8001, token: 'old-token' });
      });

      it('still reports success once saved when the HA details cannot be read', async () => {
        jest.spyOn(service, 'getHaInfo').mockRejectedValue(new Error('heartbeatlist failed'));

        await expect(service.connect('u1', 'h1', { port: 8002 })).resolves.toEqual({
          success: true,
          isHA: false,
          haInfoUnavailable: true,
        });
        expect(saved()).toMatchObject({ port: 8002, token: 'new-token' });
      });
    });
  });
});
