import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseUserService } from './database-user.service';
import { HostService } from '@host';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { UserRepositoryService } from '@repository';
import { DatabaseError } from '@error/database/database-error';
import { CmsError } from '@error/cms/cms-error';
import { ValidationError } from '@error/validation/validation-error';

describe('DatabaseUserService', () => {
  let service: DatabaseUserService;
  let hostService: jest.Mocked<HostService>;
  let cmsClient: jest.Mocked<CmsHttpsClientService>;
  let repository: jest.Mocked<UserRepositoryService>;

  const mockGroupId = 'group-host-uid-1';

  const makeHost = () => ({
    uid: 'host-uid-1',
    id: 'host-1',
    address: 'localhost',
    port: 8001,
    password: 'host-password',
    token: 'test-token',
    initialLogin: false,
    alias: 'host-1',
    dbProfiles: {
      demodb: { dbname: 'demodb', id: 'dba', password: 'dba-password' },
    },
  });

  let mockHost: ReturnType<typeof makeHost>;

  const mockUserId = 'user-123';
  const mockHostUid = 'host-uid-1';

  beforeEach(async () => {
    mockHost = makeHost();

    const mockHostService = { findHostInternal: jest.fn() };
    const mockCmsClient = { postAuthenticated: jest.fn() };
    const mockRepository = {
      atomicUpdateUser: jest.fn(async (_userId: string, callback: (user: any) => Promise<any>) => {
        const user = {
          host_groups: {
            [mockGroupId]: {
              name: mockHost.alias,
              hosts: { [mockHostUid]: mockHost },
            },
          },
        };
        return callback(user);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseUserService,
        { provide: HostService, useValue: mockHostService },
        { provide: CmsHttpsClientService, useValue: mockCmsClient },
        { provide: UserRepositoryService, useValue: mockRepository },
      ],
    }).compile();

    service = module.get(DatabaseUserService);
    hostService = module.get(HostService);
    cmsClient = module.get(CmsHttpsClientService);
    repository = module.get(UserRepositoryService);

    hostService.findHostInternal.mockImplementation(async () => mockHost as any);
    // Most tests act on a database the user is logged in to.
    loginCache().set(`${mockUserId}:${mockHostUid}:demodb`, { loggedInAt: Date.now(), hostToken: mockHost.token, dbUser: 'dba' });
  });

  const loginCache = () => (service as any).dbLoginCache as Map<string, { loggedInAt: number; hostToken: string; dbUser: string }>;
  const notLoggedIn = () => loginCache().clear();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDatabaseUsers', () => {
    it('should send userinfo task and return dbname and user list', async () => {
      const mockResponse = {
        __EXEC_TIME: '359 ms',
        dbname: 'demodb',
        note: 'none',
        status: 'success',
        task: 'userinfo',
        user: [{ '@id': '163810704', '@name': 'PUBLIC' }],
      };
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.getDatabaseUsers(mockUserId, mockHostUid, 'demodb');

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ task: 'userinfo', dbname: 'demodb' })
      );
      expect(result).toEqual({
        dbname: 'demodb',
        user: mockResponse.user,
      });
    });
  });

  describe('getUserInfo', () => {
    it('should send userinfo task and return dbname and user list', async () => {
      const mockResponse = {
        __EXEC_TIME: '359 ms',
        dbname: 'demodb',
        note: 'none',
        status: 'success',
        task: 'userinfo',
        user: [{ '@id': '163810704', '@name': 'PUBLIC' }],
      };
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.getUserInfo(mockUserId, mockHostUid, 'demodb');

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ task: 'userinfo', dbname: 'demodb' })
      );
      expect(result).toEqual({
        dbname: 'demodb',
        user: mockResponse.user,
      });
    });

    it('should throw CmsError when CMS status is not success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'failed',
        status: 'fail',
        task: 'userinfo',
      });

      await expect(
        service.getUserInfo(mockUserId, mockHostUid, 'demodb')
      ).rejects.toThrow(CmsError);
    });
  });

  describe('createUser', () => {
    const createParams = {
      dbname: 'demodb',
      username: 'yifan',
      userpass: '1111',
      groups: { group: ['public'] as string[] },
      authorization: [] as unknown[],
    };

    it('should send createuser task and return empty object', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '647 ms',
        note: 'none',
        status: 'success',
        task: 'createuser',
      });

      const result = await service.createUser(
        mockUserId,
        mockHostUid,
        createParams.dbname,
        createParams.username,
        createParams.userpass,
        createParams.groups,
        createParams.authorization
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'createuser',
          dbname: 'demodb',
          username: 'yifan',
          userpass: '1111',
          groups: { group: ['public'] },
          authorization: [],
        })
      );
      expect(result).toEqual({ success: true });
    });

    it('should throw CmsError when CMS status is not success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'failed',
        status: 'fail',
        task: 'createuser',
      });

      await expect(
        service.createUser(
          mockUserId,
          mockHostUid,
          createParams.dbname,
          createParams.username,
          createParams.userpass,
          createParams.groups,
          createParams.authorization
        )
      ).rejects.toThrow(CmsError);
    });
  });

  describe('deleteUser', () => {
    it('should send deleteuser task and return empty object', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '148 ms',
        note: 'none',
        status: 'success',
        task: 'deleteuser',
      });

      const result = await service.deleteUser(
        mockUserId,
        mockHostUid,
        'demodb',
        'yifan'
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'deleteuser',
          dbname: 'demodb',
          username: 'yifan',
        })
      );
      expect(result).toEqual({ success: true });
    });

    it('should throw CmsError when CMS status is not success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'failed',
        status: 'fail',
        task: 'deleteuser',
      });

      await expect(
        service.deleteUser(mockUserId, mockHostUid, 'demodb', 'yifan')
      ).rejects.toThrow(CmsError);
    });
  });

  describe('updateUser', () => {
    const updateParams = {
      userpass: '1111',
      // The Edit User UI no longer exposes group/authorization editing, so
      // the real caller (and these tests) always sends empty placeholders —
      // updateUser must ignore these in favor of the user's real, current
      // values fetched via userinfo.
      groups: { group: [] as string[] },
      authorization: [] as string[],
    };


    const updateUserSuccess = {
      __EXEC_TIME: '148 ms',
      note: 'none',
      status: 'success',
      task: 'updateuser',
    };

    it('preserves the user\'s real groups/authorization instead of the caller\'s empty placeholders', async () => {
      cmsClient.postAuthenticated
        .mockResolvedValueOnce({
          __EXEC_TIME: '20 ms',
          dbname: 'demodb',
          note: 'none',
          status: 'success',
          task: 'userinfo',
          user: [
            {
              '@id': '163810704',
              '@name': 'yifan',
              groups: [{ group: ['editors'] }],
              authorization: [{ '@name': 'db_class' }, { '@name': 'db_user' }],
            },
          ],
        }) // getUserInfo (userinfo) — target user present with real, non-empty values
        .mockResolvedValueOnce(updateUserSuccess); // the actual updateuser call

      const result = await service.updateUser(
        mockUserId,
        mockHostUid,
        'demodb',
        'yifan',
        updateParams.userpass,
        updateParams.groups,
        updateParams.authorization
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'updateuser',
          dbname: 'demodb',
          username: 'yifan',
          userpass: '1111',
          groups: [{ group: ['PUBLIC', 'EDITORS'] }],
          authorization: ['db_class', 'db_user'],
        })
      );
      expect(result).toEqual({ success: true });
    });

    const userInfoWithYifan = {
      __EXEC_TIME: '20 ms',
      dbname: 'demodb',
      note: 'none',
      status: 'success',
      task: 'userinfo',
      user: [{ '@id': '1', '@name': 'yifan', groups: [{ group: ['PUBLIC'] }], authorization: [] }],
    };
    const updateUserRequest = () => cmsClient.postAuthenticated.mock.calls
      .map(([, body]) => body)
      .find((body) => body.task === 'updateuser');
    // Answers by task, so the tests hold whether or not ensureDbLogin calls
    // dbmtuserlogin first.
    const answerByTask = () => cmsClient.postAuthenticated.mockImplementation(async (_url: string, body: { task: string }) => (
      ({ dbmtuserlogin: { note: 'none', status: 'success', task: 'dbmtuserlogin' }, userinfo: userInfoWithYifan, updateuser: updateUserSuccess } as Record<string, unknown>)[body.task]
    ));

    it('keeps the current password for an empty one: userpass is left out of updateuser', async () => {
      answerByTask();

      const result = await service.updateUser(mockUserId, mockHostUid, 'demodb', 'yifan', '', updateParams.groups, updateParams.authorization);

      expect(updateUserRequest()).toBeDefined();
      expect(updateUserRequest()).not.toHaveProperty('userpass');
      expect(result).toEqual({ success: true });
    });

    it('sends a new password to updateuser', async () => {
      answerByTask();

      await service.updateUser(mockUserId, mockHostUid, 'demodb', 'yifan', 'n3w-pass', updateParams.groups, updateParams.authorization);

      expect(updateUserRequest()).toEqual(expect.objectContaining({ username: 'yifan', userpass: 'n3w-pass' }));
    });

    it('keeps PUBLIC when the user has no other groups (CMS no longer re-adds it on updateuser)', async () => {
      cmsClient.postAuthenticated
        .mockResolvedValueOnce({
          __EXEC_TIME: '20 ms',
          dbname: 'demodb',
          note: 'none',
          status: 'success',
          task: 'userinfo',
          user: [{ '@id': '1', '@name': 'yifan', groups: [{ group: ['PUBLIC'] }], authorization: [] }],
        })
        .mockResolvedValueOnce(updateUserSuccess);

      await service.updateUser(
        mockUserId,
        mockHostUid,
        'demodb',
        'yifan',
        updateParams.userpass,
        updateParams.groups,
        updateParams.authorization
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ task: 'updateuser', groups: [{ group: ['PUBLIC'] }] })
      );
    });

    it('should throw CmsError when CMS status is not success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'failed',
        status: 'fail',
        task: 'updateuser',
      });

      await expect(
        service.updateUser(
          mockUserId,
          mockHostUid,
          'demodb',
          'yifan',
          updateParams.userpass,
          updateParams.groups,
          updateParams.authorization
        )
      ).rejects.toThrow(CmsError);
    });

    it('aborts the password change (without calling updateuser) when the userinfo lookup throws', async () => {
      cmsClient.postAuthenticated
        .mockResolvedValueOnce({
          __EXEC_TIME: '0 ms',
          note: 'failed',
          status: 'fail',
          task: 'userinfo',
        }); // userinfo lookup fails

      await expect(
        service.updateUser(
          mockUserId,
          mockHostUid,
          'demodb',
          'yifan',
          updateParams.userpass,
          updateParams.groups,
          updateParams.authorization
        )
      ).rejects.toThrow(CmsError);

      expect(cmsClient.postAuthenticated).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ task: 'updateuser' })
      );
    });

    it('aborts the password change (without calling updateuser) when the user is absent from the userinfo response', async () => {
      cmsClient.postAuthenticated
        .mockResolvedValueOnce({
          __EXEC_TIME: '20 ms',
          dbname: 'demodb',
          note: 'none',
          status: 'success',
          task: 'userinfo',
          user: [{ '@id': '1', '@name': 'someone-else' }],
        }); // userinfo succeeds, but "yifan" isn't in the list

      await expect(
        service.updateUser(
          mockUserId,
          mockHostUid,
          'demodb',
          'yifan',
          updateParams.userpass,
          updateParams.groups,
          updateParams.authorization
        )
      ).rejects.toThrow(DatabaseError);

      expect(cmsClient.postAuthenticated).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ task: 'updateuser' })
      );
    });
  });

  describe('userVerify', () => {
    it('should send userverify task and return { verified: true }', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '72 ms',
        note: 'none',
        status: 'success',
        task: 'userverify',
      });

      const result = await service.userVerify(
        mockUserId,
        mockHostUid,
        'demodb',
        'dba',
        ''
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'userverify',
          dbname: 'demodb',
          dbuser: 'dba',
          dbpasswd: '',
        })
      );
      expect(result).toEqual({ verified: true });
    });

    it('should throw CmsError when CMS status is not success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'failed',
        status: 'fail',
        task: 'userverify',
      });

      await expect(
        service.userVerify(mockUserId, mockHostUid, 'demodb', 'dba', '')
      ).rejects.toThrow(CmsError);
    });
  });

  describe('ensureDbLogin', () => {
    it('passes without calling CMS while the user is logged in', async () => {
      await service.ensureDbLogin(mockUserId, mockHostUid, 'demodb');

      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('never logs in with a saved profile: not logged in fails with reason notLoggedIn, without calling CMS', async () => {
      notLoggedIn();

      await expect(service.ensureDbLogin(mockUserId, mockHostUid, 'demodb')).rejects.toMatchObject({
        code: 'MISSING_DB_CREDENTIALS',
        additionalData: expect.objectContaining({ dbname: 'demodb', reason: 'notLoggedIn' }),
      });
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
      expect(mockHost.dbProfiles).toHaveProperty('demodb');
    });

    it('says loggedOut when the user logged out of the database', async () => {
      await service.logoutDatabase(mockUserId, mockHostUid, 'demodb');

      await expect(service.ensureDbLogin(mockUserId, mockHostUid, 'demodb')).rejects.toMatchObject({
        additionalData: expect.objectContaining({ reason: 'loggedOut' }),
      });
    });

    it('fails once the host token changed, since CMS keeps DB logins per host login', async () => {
      mockHost.token = 'a-new-token-from-relogin';

      await expect(service.ensureDbLogin(mockUserId, mockHostUid, 'demodb')).rejects.toThrow(ValidationError);
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });
  });

  describe('isDbLoginActive', () => {
    const successResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'dbmtuserlogin',
    };

    beforeEach(() => notLoggedIn());
    afterEach(() => jest.useRealTimers());

    it('is false with no cached login', () => {
      expect(service.isDbLoginActive(mockUserId, mockHostUid, 'demodb', mockHost.token)).toBe(false);
    });

    it('is true after a login under the same host token, without calling CMS', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(successResponse);
      await service.loginDatabase(mockUserId, mockHostUid, 'demodb');
      cmsClient.postAuthenticated.mockClear();

      expect(service.isDbLoginActive(mockUserId, mockHostUid, 'demodb', mockHost.token)).toBe(true);
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('is false once the host token changed (CMS conlist is per login connection)', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(successResponse);
      await service.loginDatabase(mockUserId, mockHostUid, 'demodb');

      expect(service.isDbLoginActive(mockUserId, mockHostUid, 'demodb', 'a-rotated-token')).toBe(false);
    });

    it('is false once the cached login is over 2h old', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-26T00:00:00Z') });
      cmsClient.postAuthenticated.mockResolvedValue(successResponse);
      await service.loginDatabase(mockUserId, mockHostUid, 'demodb');

      jest.setSystemTime(new Date('2026-10-26T02:00:01Z'));

      expect(service.isDbLoginActive(mockUserId, mockHostUid, 'demodb', mockHost.token)).toBe(false);
    });
  });

  describe('deleteDbProfile', () => {
    it('removes the stored profile', async () => {
      await service.deleteDbProfile(mockUserId, mockHostUid, 'demodb');

      expect(repository.atomicUpdateUser).toHaveBeenCalled();
      expect(mockHost.dbProfiles).not.toHaveProperty('demodb');
    });

    it('clears the login, so a later ensureDbLogin fails', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '10 ms',
        note: 'none',
        status: 'success',
        task: 'dbmtuserlogin',
      });
      await service.loginDatabase(mockUserId, mockHostUid, 'demodb');

      await service.deleteDbProfile(mockUserId, mockHostUid, 'demodb');

      await expect(
        service.ensureDbLogin(mockUserId, mockHostUid, 'demodb')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('logoutDatabase', () => {
    const successResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'dbmtuserlogin',
    };
    const deferred = <T,>() => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((r) => { resolve = r; });
      return { promise, resolve };
    };
    const flush = () => new Promise((r) => setImmediate(r));
    const active = () => service.isDbLoginActive(mockUserId, mockHostUid, 'demodb', mockHost.token);

    it('ends the login and marks the saved profile, keeping the profile', async () => {
      await service.logoutDatabase(mockUserId, mockHostUid, 'demodb');

      expect(active()).toBe(false);
      expect(mockHost.dbProfiles.demodb).toMatchObject({ id: 'dba', password: 'dba-password', loggedOut: true });
    });

    it('lets a login clear the mark', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(successResponse);
      await service.logoutDatabase(mockUserId, mockHostUid, 'demodb');

      await service.loginDatabase(mockUserId, mockHostUid, 'demodb');

      expect(mockHost.dbProfiles.demodb).not.toHaveProperty('loggedOut');
      expect(active()).toBe(true);
    });

    it('keeps the mark when the login fails', async () => {
      await service.logoutDatabase(mockUserId, mockHostUid, 'demodb');
      cmsClient.postAuthenticated.mockResolvedValue({ ...successResponse, status: 'failure', note: 'boom' });

      await expect(service.loginDatabase(mockUserId, mockHostUid, 'demodb')).rejects.toThrow();

      expect(mockHost.dbProfiles.demodb).toHaveProperty('loggedOut', true);
    });

    it('fails a login when the user logged out while it waited for CMS', async () => {
      notLoggedIn();
      const cms = deferred<typeof successResponse>();
      cmsClient.postAuthenticated.mockReturnValueOnce(cms.promise);

      const login = service.loginDatabase(mockUserId, mockHostUid, 'demodb', 'dba', 'dba-password');
      await flush();
      await service.logoutDatabase(mockUserId, mockHostUid, 'demodb');
      cms.resolve(successResponse);

      await expect(login).rejects.toMatchObject({ code: 'LOGIN_DATABASE_FAILED' });
      expect(active()).toBe(false);
      expect(mockHost.dbProfiles.demodb).toHaveProperty('loggedOut', true);
    });

    it('leaves no login behind when a login finishes while the logout is storing its mark', async () => {
      notLoggedIn();
      cmsClient.postAuthenticated.mockResolvedValue(successResponse);
      const storing = deferred<void>();
      const atomic = repository.atomicUpdateUser.getMockImplementation()!;
      repository.atomicUpdateUser.mockImplementationOnce(async (id: string, cb: any) => {
        await storing.promise;
        return atomic(id, cb);
      });

      const logout = service.logoutDatabase(mockUserId, mockHostUid, 'demodb');
      await flush();
      await service.loginDatabase(mockUserId, mockHostUid, 'demodb', 'dba', 'dba-password');
      storing.resolve();
      await logout;

      expect(active()).toBe(false);
      await expect(service.ensureDbLogin(mockUserId, mockHostUid, 'demodb')).rejects.toThrow(ValidationError);
    });

    it('fails a login whose logout finished between its host read and its CMS answer', async () => {
      notLoggedIn();
      const cms = deferred<typeof successResponse>();
      cmsClient.postAuthenticated.mockReturnValueOnce(cms.promise);
      const hostRead = deferred<void>();
      hostService.findHostInternal.mockImplementationOnce(async () => {
        const snapshot = JSON.parse(JSON.stringify(mockHost));
        await hostRead.promise;
        return snapshot;
      });

      const login = service.loginDatabase(mockUserId, mockHostUid, 'demodb');
      await flush();
      await service.logoutDatabase(mockUserId, mockHostUid, 'demodb');
      hostRead.resolve();
      await flush();
      cms.resolve(successResponse);

      await expect(login).rejects.toMatchObject({ code: 'LOGIN_DATABASE_FAILED' });
      expect(active()).toBe(false);
    });

    it('keeps the mark when a logout lands between a login\'s CMS answer and its clearing of the mark', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(successResponse);
      await service.logoutDatabase(mockUserId, mockHostUid, 'demodb');
      const clearing = deferred<void>();
      const atomic = repository.atomicUpdateUser.getMockImplementation()!;
      repository.atomicUpdateUser.mockImplementationOnce(async (id: string, cb: any) => {
        await clearing.promise;
        return atomic(id, cb);
      });

      const login = service.loginDatabase(mockUserId, mockHostUid, 'demodb');
      await flush();
      await service.logoutDatabase(mockUserId, mockHostUid, 'demodb');
      clearing.resolve();
      await login;

      expect(mockHost.dbProfiles.demodb).toHaveProperty('loggedOut', true);
      expect(active()).toBe(false);
      await expect(service.ensureDbLogin(mockUserId, mockHostUid, 'demodb')).rejects.toThrow(ValidationError);
    });

    it('creates no profile for a database without one', async () => {
      await service.logoutDatabase(mockUserId, mockHostUid, 'otherdb');

      expect(mockHost.dbProfiles).not.toHaveProperty('otherdb');
    });
  });

  describe('restoreDbLoginsAfterHostLogin', () => {
    const ok = { __EXEC_TIME: '10 ms', note: 'none', status: 'success', task: 'dbmtuserlogin' };
    const deferred = <T,>() => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((r) => { resolve = r; });
      return { promise, resolve };
    };
    const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
    const loginAt = Date.now() - 60 * 60 * 1000;
    const key = (db: string) => `${mockUserId}:${mockHostUid}:${db}`;
    const hostLogin = (token: string) => {
      mockHost.token = token;
      service.restoreDbLoginsAfterHostLogin(mockUserId, mockHostUid, token);
    };

    beforeEach(() => {
      notLoggedIn();
      loginCache().set(key('demodb'), { loggedInAt: loginAt, hostToken: 'test-token', dbUser: 'dba' });
    });

    it('logs back in with the saved profile, keeping the original login time, within a time limit', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(ok);

      hostLogin('new-token');
      await settle();

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ task: 'dbmtuserlogin', dbname: 'demodb', dbuser: 'dba', dbpasswd: 'dba-password', token: 'new-token' }),
        { timeoutMs: 30_000 }
      );
      expect(loginCache().get(key('demodb'))).toEqual({ loggedInAt: loginAt, hostToken: 'new-token', dbUser: 'dba' });
    });

    it("forgetDbLoginsOfHost drops the host's logins and a re-login still running sets nothing", async () => {
      const answer = deferred<typeof ok>();
      cmsClient.postAuthenticated.mockReturnValue(answer.promise);
      loginCache().set(`${mockUserId}:other-host:demodb`, { loggedInAt: loginAt, hostToken: 'x', dbUser: 'dba' });

      hostLogin('new-token');
      await settle();
      service.forgetDbLoginsOfHost(mockUserId, mockHostUid);
      answer.resolve(ok);
      await settle();

      expect(loginCache().has(key('demodb'))).toBe(false);
      expect(service.isDbLoginRestoring(mockUserId, mockHostUid, 'demodb')).toBe(false);
      expect(loginCache().has(`${mockUserId}:other-host:demodb`)).toBe(true);
    });

    it('leaves a database without a saved profile not logged in, sending nothing', async () => {
      loginCache().set(key('nosave'), { loggedInAt: loginAt, hostToken: 'test-token', dbUser: 'dba' });
      cmsClient.postAuthenticated.mockResolvedValue(ok);

      hostLogin('new-token');
      await settle();

      expect(cmsClient.postAuthenticated).not.toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ dbname: 'nosave' }), expect.anything());
      expect(loginCache().has(key('nosave'))).toBe(false);
    });

    it('does not log in as the saved profile when the user had logged in as another user', async () => {
      loginCache().set(key('demodb'), { loggedInAt: loginAt, hostToken: 'test-token', dbUser: 'someone_else' });

      hostLogin('new-token');
      await settle();

      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
      expect(loginCache().has(key('demodb'))).toBe(false);
    });

    it('never logs in to a database the user logged out of', async () => {
      (mockHost.dbProfiles.demodb as any).loggedOut = true;

      hostLogin('new-token');
      await settle();

      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
      expect(loginCache().has(key('demodb'))).toBe(false);
    });

    it('leaves the database not logged in when the re-login fails or times out', async () => {
      cmsClient.postAuthenticated.mockRejectedValue(new Error('timeout of 30000ms exceeded'));

      hostLogin('new-token');
      await settle();

      expect(loginCache().has(key('demodb'))).toBe(false);
    });

    it('drops a login that would already have expired, without logging in', async () => {
      loginCache().set(key('demodb'), { loggedInAt: Date.now() - 2 * 60 * 60 * 1000 - 1, hostToken: 'test-token', dbUser: 'dba' });

      hostLogin('new-token');
      await settle();

      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
      expect(loginCache().has(key('demodb'))).toBe(false);
    });

    it('reports the database as being restored until the re-login settles', async () => {
      const cms = deferred<typeof ok>();
      cmsClient.postAuthenticated.mockReturnValueOnce(cms.promise);
      hostLogin('new-token');
      await settle();

      expect(service.isDbLoginRestoring(mockUserId, mockHostUid, 'demodb')).toBe(true);
      cms.resolve(ok);
      await settle();
      expect(service.isDbLoginRestoring(mockUserId, mockHostUid, 'demodb')).toBe(false);
    });

    it('makes ensureDbLogin wait for the database\'s re-login', async () => {
      const cms = deferred<typeof ok>();
      cmsClient.postAuthenticated.mockReturnValueOnce(cms.promise);
      hostLogin('new-token');

      const check = service.ensureDbLogin(mockUserId, mockHostUid, 'demodb');
      await settle();
      cms.resolve(ok);

      await expect(check).resolves.toBeUndefined();
    });

    it('keeps the newest token when the host is logged in twice in a row', async () => {
      const first = deferred<typeof ok>();
      cmsClient.postAuthenticated.mockReturnValueOnce(first.promise).mockResolvedValue(ok);

      hostLogin('token-b');
      await settle();
      // The second host login's re-login would finish first if it didn't wait.
      hostLogin('token-c');
      await settle();
      first.resolve(ok);
      await settle();

      expect(loginCache().get(key('demodb'))).toEqual({ loggedInAt: loginAt, hostToken: 'token-c', dbUser: 'dba' });
      expect(service.isDbLoginActive(mockUserId, mockHostUid, 'demodb', 'token-c')).toBe(true);
    });

    it('does not replace a login the user made during the re-login', async () => {
      const cms = deferred<typeof ok>();
      cmsClient.postAuthenticated.mockReturnValueOnce(cms.promise);
      hostLogin('new-token');
      await settle();

      const fresh = { loggedInAt: Date.now(), hostToken: 'new-token', dbUser: 'other' };
      loginCache().set(key('demodb'), fresh);
      cms.resolve(ok);
      await settle();

      expect(loginCache().get(key('demodb'))).toBe(fresh);
    });

    it('does not bring back a login the user logged out of during the re-login', async () => {
      const cms = deferred<typeof ok>();
      cmsClient.postAuthenticated.mockReturnValueOnce(cms.promise);
      hostLogin('new-token');
      await settle();

      await service.logoutDatabase(mockUserId, mockHostUid, 'demodb');
      expect(service.isDbLoginRestoring(mockUserId, mockHostUid, 'demodb')).toBe(false);
      cms.resolve(ok);
      await settle();

      expect(service.isDbLoginActive(mockUserId, mockHostUid, 'demodb', 'new-token')).toBe(false);
    });
  });
});
