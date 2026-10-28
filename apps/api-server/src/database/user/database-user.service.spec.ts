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
  });

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

    const dbmtLoginSuccess = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'dbmtuserlogin',
    };

    const updateUserSuccess = {
      __EXEC_TIME: '148 ms',
      note: 'none',
      status: 'success',
      task: 'updateuser',
    };

    it('preserves the user\'s real groups/authorization instead of the caller\'s empty placeholders', async () => {
      cmsClient.postAuthenticated
        .mockResolvedValueOnce(dbmtLoginSuccess) // ensureDbLogin (dbmtuserlogin)
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

    it('keeps PUBLIC when the user has no other groups (CMS no longer re-adds it on updateuser)', async () => {
      cmsClient.postAuthenticated
        .mockResolvedValueOnce(dbmtLoginSuccess)
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
        .mockResolvedValueOnce(dbmtLoginSuccess) // ensureDbLogin succeeds
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
        .mockResolvedValueOnce(dbmtLoginSuccess) // ensureDbLogin succeeds
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
    const successResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'dbmtuserlogin',
    };

    it('throws MissingDBCredentials without calling CMS when no profile is stored', async () => {
      (mockHost as any).dbProfiles = {};

      await expect(
        service.ensureDbLogin(mockUserId, mockHostUid, 'demodb')
      ).rejects.toThrow(ValidationError);
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('logs in via the stored profile and reports reauthenticated on a cold cache', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(successResponse);

      const result = await service.ensureDbLogin(mockUserId, mockHostUid, 'demodb');

      expect(result).toEqual({ reauthenticated: true });
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ task: 'dbmtuserlogin', dbname: 'demodb', dbuser: 'dba' })
      );
    });

    it('skips re-login on a warm cache for the same host token', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(successResponse);

      await service.ensureDbLogin(mockUserId, mockHostUid, 'demodb');
      cmsClient.postAuthenticated.mockClear();

      const result = await service.ensureDbLogin(mockUserId, mockHostUid, 'demodb');

      expect(result).toEqual({ reauthenticated: false });
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('re-logs in once the host token changes, even with a warm cache', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(successResponse);

      await service.ensureDbLogin(mockUserId, mockHostUid, 'demodb');
      mockHost.token = 'a-new-token-from-relogin';
      cmsClient.postAuthenticated.mockClear();

      const result = await service.ensureDbLogin(mockUserId, mockHostUid, 'demodb');

      expect(result).toEqual({ reauthenticated: true });
      expect(cmsClient.postAuthenticated).toHaveBeenCalledTimes(1);
    });

    it('deletes the stored profile when CMS reports a bad password', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '10 ms',
        note: 'Incorrect or missing password.',
        status: 'fail',
        task: 'dbmtuserlogin',
      });

      await expect(
        service.ensureDbLogin(mockUserId, mockHostUid, 'demodb')
      ).rejects.toThrow(CmsError);

      expect(repository.atomicUpdateUser).toHaveBeenCalled();
      expect(mockHost.dbProfiles).not.toHaveProperty('demodb');
    });

    it('keeps the stored profile when the login fails for an unrelated reason', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '10 ms',
        note: 'Cannot connect to host',
        status: 'fail',
        task: 'dbmtuserlogin',
      });

      await expect(
        service.ensureDbLogin(mockUserId, mockHostUid, 'demodb')
      ).rejects.toThrow(CmsError);

      expect(repository.atomicUpdateUser).not.toHaveBeenCalled();
      expect(mockHost.dbProfiles).toHaveProperty('demodb');
    });
  });

  describe('isDbLoginActive', () => {
    const successResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'dbmtuserlogin',
    };

    afterEach(() => jest.useRealTimers());

    it('is false with no cached login', () => {
      expect(service.isDbLoginActive(mockUserId, mockHostUid, 'demodb', mockHost.token)).toBe(false);
    });

    it('is true after a login under the same host token, without calling CMS', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(successResponse);
      await service.ensureDbLogin(mockUserId, mockHostUid, 'demodb');
      cmsClient.postAuthenticated.mockClear();

      expect(service.isDbLoginActive(mockUserId, mockHostUid, 'demodb', mockHost.token)).toBe(true);
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('is false once the host token changed (CMS conlist is per login connection)', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(successResponse);
      await service.ensureDbLogin(mockUserId, mockHostUid, 'demodb');

      expect(service.isDbLoginActive(mockUserId, mockHostUid, 'demodb', 'a-rotated-token')).toBe(false);
    });

    it('is false once the cached login is over 2h old', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-26T00:00:00Z') });
      cmsClient.postAuthenticated.mockResolvedValue(successResponse);
      await service.ensureDbLogin(mockUserId, mockHostUid, 'demodb');

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

    it('clears the ensureDbLogin cache, so a later call re-checks for a profile', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '10 ms',
        note: 'none',
        status: 'success',
        task: 'dbmtuserlogin',
      });
      await service.ensureDbLogin(mockUserId, mockHostUid, 'demodb');

      await service.deleteDbProfile(mockUserId, mockHostUid, 'demodb');

      await expect(
        service.ensureDbLogin(mockUserId, mockHostUid, 'demodb')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('logoutDatabase', () => {
    it('clears the ensureDbLogin cache without touching the stored profile', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '10 ms',
        note: 'none',
        status: 'success',
        task: 'dbmtuserlogin',
      });
      await service.ensureDbLogin(mockUserId, mockHostUid, 'demodb');
      cmsClient.postAuthenticated.mockClear();

      await service.logoutDatabase(mockUserId, mockHostUid, 'demodb');

      // Profile untouched — logout is not the same as forgetting credentials.
      expect(repository.atomicUpdateUser).not.toHaveBeenCalled();
      expect(mockHost.dbProfiles).toHaveProperty('demodb');

      // But the cache is gone, so the next ensureDbLogin re-authenticates.
      const result = await service.ensureDbLogin(mockUserId, mockHostUid, 'demodb');
      expect(result).toEqual({ reauthenticated: true });
      expect(cmsClient.postAuthenticated).toHaveBeenCalledTimes(1);
    });
  });
});
