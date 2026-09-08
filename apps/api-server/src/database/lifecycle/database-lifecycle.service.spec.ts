import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseLifecycleService } from './database-lifecycle.service';
import { HostService } from '@host';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { UserRepositoryService } from '@repository';
import { CmsConfigService } from '@cms-config/cms-config.service';
import { FileService } from '@file/file.service';
import { DatabaseInfoService } from '../info/database-info.service';
import { HaService } from '@ha';
import { DatabaseUserService } from '../user/database-user.service';
import { DatabaseConfigService } from '../config/database-config.service';
import { BrokerService } from '@broker';
import { CmsJobLockService } from '@cms-job/cms-job-lock.service';
import { DatabaseError } from '@error/database/database-error';
import { DatabaseErrorCode } from '@error/database/database-error-code';
import { HostError } from '@error/index';
import { CmsError } from '@error/cms/cms-error';
import { CreateDatabaseClientResponse, DeleteDatabaseRequest } from '@api-interfaces';
import { DeleteDatabaseCmsResponse } from '@type/cms-response';


describe('DatabaseLifecycleService', () => {
  let service: DatabaseLifecycleService;
  let hostService: jest.Mocked<HostService>;
  let cmsClient: jest.Mocked<CmsHttpsClientService>;
  let repository: jest.Mocked<UserRepositoryService>;
  let cmsConfigService: jest.Mocked<CmsConfigService>;
  let fileService: jest.Mocked<FileService>;
  let databaseUserService: jest.Mocked<DatabaseUserService>;
  let databaseConfigService: jest.Mocked<DatabaseConfigService>;
  let databaseInfoService: DatabaseInfoService;
  let cmsJobLockService: { hasActiveJobForHost: jest.Mock };

  const mockHost = {
    uid: 'host-uid-1',
    id: 'host-1',
    address: 'localhost',
    port: 8001,
    password: 'host-password',
    token: 'test-token',
    initialLogin: false,
    alias: 'host-1',
    dbProfiles: {},
  };

  const mockUserId = 'user-123';
  const mockHostUid = 'host-uid-1';
  const mockDbname = 'testdb';

  const mockGroupId = 'group-host-uid-1';
  const hostInGroups = (host: typeof mockHost, groupId = mockGroupId) => ({
    host_groups: {
      [groupId]: {
        name: host.alias || host.id,
        hosts: { [host.uid]: host },
      },
    },
  });
  const getMockHostFromUser = (user: { host_groups?: Record<string, { hosts: Record<string, typeof mockHost> }> }) =>
    user.host_groups?.[mockGroupId]?.hosts[mockHostUid];

  beforeEach(async () => {
    const mockHostService = {
      findHostInternal: jest.fn(),
    };

    const mockCmsClient = {
      postAuthenticated: jest.fn(),
    };

    const mockRepository = {
      atomicUpdateUser: jest.fn(),
    };

    const mockCmsConfigService = {
      getAllSystemParam: jest.fn().mockResolvedValue({
        conflist: [{ confdata: ['[common]', 'ha_mode=off'] }],
      }),
    };

    const mockFileService = {};

    const mockDatabaseUserService = {
      updateUser: jest.fn(),
      loginDatabase: jest.fn().mockResolvedValue({}),
      getUserInfo: jest.fn().mockResolvedValue({ user: [] }),
      ensureDbLogin: jest.fn().mockResolvedValue({ reauthenticated: false }),
      deleteDbProfile: jest.fn().mockResolvedValue(undefined),
    };

    const mockDatabaseConfigService = {
      setAutoAddVol: jest.fn(),
      setAutoStart: jest.fn(),
      removeAutoStart: jest.fn(),
    };

    const mockBrokerService = {
      startAllBrokers: jest.fn().mockResolvedValue({ success: true }),
      stopAllBrokers: jest.fn().mockResolvedValue({ success: true }),
    };

    const mockCmsJobLockService = {
      hasActiveJobForHost: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseLifecycleService,
        DatabaseInfoService,
        {
          provide: HostService,
          useValue: mockHostService,
        },
        {
          provide: CmsHttpsClientService,
          useValue: mockCmsClient,
        },
        {
          provide: UserRepositoryService,
          useValue: mockRepository,
        },
        {
          provide: CmsConfigService,
          useValue: mockCmsConfigService,
        },
        {
          provide: FileService,
          useValue: mockFileService,
        },
        {
          provide: DatabaseUserService,
          useValue: mockDatabaseUserService,
        },
        {
          provide: DatabaseConfigService,
          useValue: mockDatabaseConfigService,
        },
        HaService,
        {
          provide: BrokerService,
          useValue: mockBrokerService,
        },
        {
          provide: CmsJobLockService,
          useValue: mockCmsJobLockService,
        },
      ],
    }).compile();

    service = module.get<DatabaseLifecycleService>(DatabaseLifecycleService);
    hostService = module.get(HostService);
    cmsClient = module.get(CmsHttpsClientService);
    repository = module.get(UserRepositoryService);
    cmsConfigService = module.get(CmsConfigService);
    fileService = module.get(FileService);
    databaseUserService = module.get(DatabaseUserService);
    databaseConfigService = module.get(DatabaseConfigService);
    databaseInfoService = module.get(DatabaseInfoService);
    cmsJobLockService = module.get(CmsJobLockService);

    // Setup default mocks
    hostService.findHostInternal.mockResolvedValue(mockHost);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startInfo', () => {
    const mockStartInfoCmsResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'startinfo',
      dblist: [
        {
          dbs: [
            {
              dbname: 'testdb',
              dbdir: '/path/to/testdb',
            },
          ],
        },
      ],
      activelist: [
        {
          active: [{ dbname: 'testdb' }],
        },
      ],
    };

    const mockStartInfoClientResponse = {
      activelist: { active: [{ dbname: 'testdb' }] },
      dblist: {
        dbs: [
          {
            dbname: 'testdb',
            dbdir: '/path/to/testdb',
            isProfileExists: false,
          },
        ],
      },
      haDbNames: [],
    };

    it('should return start info with profile existence', async () => {
      const hostWithProfile = {
        ...mockHost,
        dbProfiles: { testdb: { dbname: 'testdb', id: 'dba', password: 'pass' } },
      };
      hostService.findHostInternal.mockResolvedValue(hostWithProfile);
      cmsClient.postAuthenticated.mockResolvedValue(mockStartInfoCmsResponse);

      const result = await service.startInfo(mockUserId, mockHostUid);

      expect(result).toEqual({
        activelist: { active: [{ dbname: 'testdb' }] },
        dblist: {
          dbs: [
            {
              dbname: 'testdb',
              dbdir: '/path/to/testdb',
              isProfileExists: true,
            },
          ],
        },
        haDbNames: [],
      });
    });

    it('should return start info without profile', async () => {
      hostService.findHostInternal.mockResolvedValue(mockHost);
      cmsClient.postAuthenticated.mockResolvedValue(mockStartInfoCmsResponse);

      const result = await service.startInfo(mockUserId, mockHostUid);

      expect(result).toEqual(mockStartInfoClientResponse);
    });

    it('should throw CmsError when CMS status is fail', async () => {
      const failedResponse = {
        __EXEC_TIME: '0 ms',
        note: 'Failed',
        status: 'fail',
        task: 'startinfo',
      };
      cmsClient.postAuthenticated.mockResolvedValue(failedResponse);

      await expect(service.startInfo(mockUserId, mockHostUid)).rejects.toThrow(CmsError);
    });
  });

  describe('startDatabase', () => {
    const mockBaseResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'startdb',
    };

    const mockStartInfoResponse = {
      activelist: { active: [] },
      dblist: { dbs: [] },
    };

    beforeEach(() => {
      jest.spyOn(databaseInfoService, 'startInfo').mockResolvedValue(mockStartInfoResponse as any);
      jest.spyOn(databaseInfoService as any, 'effectiveHaDbForDbname').mockResolvedValue(false);
    });

    it('should successfully start database', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockBaseResponse);

      const result = await service.startDatabase(mockUserId, mockHostUid, mockDbname);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        `https://${mockHost.address}:${mockHost.port}/cm_api`,
        expect.objectContaining({
          task: 'startdb',
          token: mockHost.token,
          dbname: mockDbname,
        }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual(mockStartInfoResponse);
    });

    it('should use ha_start when effectiveHaDbForDbname is true', async () => {
      jest.spyOn(databaseInfoService as any, 'effectiveHaDbForDbname').mockResolvedValue(true);
      const haResp = { ...mockBaseResponse, task: 'ha_start' };
      cmsClient.postAuthenticated.mockResolvedValue(haResp);

      await service.startDatabase(mockUserId, mockHostUid, mockDbname);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        `https://${mockHost.address}:${mockHost.port}/cm_api`,
        expect.objectContaining({
          task: 'ha_start',
          token: mockHost.token,
          dbname: mockDbname,
        }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
    });

    it('should throw when a CMS job is already running on this host', async () => {
      cmsJobLockService.hasActiveJobForHost.mockResolvedValue({ jobId: 'job-1', dbname: 'otherdb' });

      await expect(service.startDatabase(mockUserId, mockHostUid, mockDbname)).rejects.toThrow(
        DatabaseError
      );
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('should throw CmsError when CMS status is fail', async () => {
      const failedResponse = {
        ...mockBaseResponse,
        status: 'fail',
        note: 'Database start failed',
      };
      cmsClient.postAuthenticated.mockResolvedValue(failedResponse);

      await expect(service.startDatabase(mockUserId, mockHostUid, mockDbname)).rejects.toThrow(CmsError);
    });
  });

  describe('stopDatabase', () => {
    const mockBaseResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'stopdb',
    };

    const mockStartInfoResponse = {
      activelist: { active: [] },
      dblist: { dbs: [] },
    };

    beforeEach(() => {
      jest.useFakeTimers();
      jest.spyOn(databaseInfoService, 'startInfo').mockResolvedValue(mockStartInfoResponse as any);
      jest.spyOn(databaseInfoService as any, 'effectiveHaDbForDbname').mockResolvedValue(false);
    });

    afterEach(() => jest.useRealTimers());

    it('should successfully stop database', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockBaseResponse);

      const result = await service.stopDatabase(mockUserId, mockHostUid, mockDbname);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        `https://${mockHost.address}:${mockHost.port}/cm_api`,
        expect.objectContaining({
          task: 'stopdb',
          token: mockHost.token,
          dbname: mockDbname,
        }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual(mockStartInfoResponse);
    });

    it('should use ha_stop when effectiveHaDbForDbname is true', async () => {
      jest.spyOn(databaseInfoService as any, 'effectiveHaDbForDbname').mockResolvedValue(true);
      const haResp = { ...mockBaseResponse, task: 'ha_stop' };
      cmsClient.postAuthenticated.mockResolvedValue(haResp);

      await service.stopDatabase(mockUserId, mockHostUid, mockDbname);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        `https://${mockHost.address}:${mockHost.port}/cm_api`,
        expect.objectContaining({
          task: 'ha_stop',
          token: mockHost.token,
          dbname: mockDbname,
        }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
    });

    it('immediately throws deterministic errors without polling', async () => {
      const failedResponse = {
        ...mockBaseResponse,
        status: 'fail',
        note: 'Database stop failed',
      };
      cmsClient.postAuthenticated.mockResolvedValue(failedResponse);

      await expect(service.stopDatabase(mockUserId, mockHostUid, mockDbname)).rejects.toThrow(
        CmsError
      );
      expect(databaseInfoService.startInfo).not.toHaveBeenCalled();
      expect(cmsClient.postAuthenticated).toHaveBeenCalledTimes(1);
    });

    it('immediately throws InvalidToken error without polling', async () => {
      cmsClient.postAuthenticated.mockRejectedValue(CmsError.InvalidToken());

      await expect(service.stopDatabase(mockUserId, mockHostUid, mockDbname)).rejects.toThrow(
        CmsError
      );
      expect(databaseInfoService.startInfo).not.toHaveBeenCalled();
      expect(cmsClient.postAuthenticated).toHaveBeenCalledTimes(1);
    });

    it('should throw CmsError when stop times out and the database remains active', async () => {
      const failedResponse = {
        ...mockBaseResponse,
        status: 'fail',
        note: 'timeout',
      };
      cmsClient.postAuthenticated.mockResolvedValue(failedResponse);
      jest.mocked(databaseInfoService.startInfo).mockResolvedValue({
        ...mockStartInfoResponse, activelist: { active: [{ dbname: mockDbname }] },
      } as any);

      const assertion = expect(service.stopDatabase(mockUserId, mockHostUid, mockDbname)).rejects.toThrow(
        CmsError
      );
      await jest.runAllTimersAsync();
      await assertion;
      expect(databaseInfoService.startInfo).toHaveBeenCalledTimes(6);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledTimes(1);
    });

    it('accepts recovery only after a valid read confirms the database stopped', async () => {
      cmsClient.postAuthenticated.mockRejectedValue(CmsError.RequestFailed({ message: 'timeout' }));
      jest.mocked(databaseInfoService.startInfo)
        .mockRejectedValueOnce(new Error('status unavailable'))
        .mockResolvedValueOnce({ ...mockStartInfoResponse, activelist: { active: [mockDbname] } } as any)
        .mockResolvedValueOnce(mockStartInfoResponse as any);
      const result = service.stopDatabase(mockUserId, mockHostUid, mockDbname);
      await jest.runAllTimersAsync();
      await expect(result).resolves.toEqual(mockStartInfoResponse);
      expect(databaseInfoService.startInfo).toHaveBeenCalledTimes(3);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledTimes(1);
    });

    it.each([undefined, {}, { activelist: {} }, { activelist: { active: [null] } },
      { activelist: { active: [{}] } }, { activelist: { active: 'invalid' } },
    ])('does not treat malformed status %j as stopped', async status => {
      const original = CmsError.RequestFailed({ message: 'timeout' });
      cmsClient.postAuthenticated.mockRejectedValue(original);
      jest.mocked(databaseInfoService.startInfo).mockResolvedValue(status as any);
      const assertion = expect(service.stopDatabase(mockUserId, mockHostUid, mockDbname)).rejects.toBe(original);
      await jest.runAllTimersAsync();
      await assertion;
      expect(databaseInfoService.startInfo).toHaveBeenCalledTimes(6);
    });

    it('preserves the stop error when every recovery status read fails', async () => {
      const original = CmsError.RequestFailed({ message: 'timeout' });
      cmsClient.postAuthenticated.mockRejectedValue(original);
      jest.mocked(databaseInfoService.startInfo).mockRejectedValue(new Error('status unavailable'));
      const assertion = expect(service.stopDatabase(mockUserId, mockHostUid, mockDbname)).rejects.toBe(original);
      await jest.runAllTimersAsync();
      await assertion;
      expect(databaseInfoService.startInfo).toHaveBeenCalledTimes(6);
    });
  });

  describe('startAllDatabases', () => {
    const successResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
    };

    it('starts every HA database with a single bulk ha_start, regardless of the passed dbnames', async () => {
      jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set(['hadb1', 'hadb2']));
      cmsClient.postAuthenticated.mockResolvedValue({ ...successResponse, task: 'ha_start' });

      const result = await service.startAllDatabases(mockUserId, mockHostUid, ['nonhadb']);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        `https://${mockHost.address}:${mockHost.port}/cm_api`,
        expect.objectContaining({ task: 'ha_start' }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      // Only one ha_start call for both HA databases, not one per database.
      const haStartCalls = cmsClient.postAuthenticated.mock.calls.filter(
        ([, body]) => body.task === 'ha_start'
      );
      expect(haStartCalls).toHaveLength(1);
      expect(haStartCalls[0][1]).not.toHaveProperty('dbname');
      expect(result.succeeded).toEqual(expect.arrayContaining(['hadb1', 'hadb2']));
    });

    it('starts non-HA databases individually with startdb', async () => {
      jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set());
      cmsClient.postAuthenticated.mockResolvedValue({ ...successResponse, task: 'startdb' });

      const result = await service.startAllDatabases(mockUserId, mockHostUid, ['db1', 'db2']);

      const startdbCalls = cmsClient.postAuthenticated.mock.calls.filter(
        ([, body]) => body.task === 'startdb'
      );
      expect(startdbCalls).toHaveLength(2);
      expect(result.succeeded).toEqual(expect.arrayContaining(['db1', 'db2']));
      expect(result.failed).toEqual([]);
    });

    it('isolates a failed bulk ha_start from non-HA database results', async () => {
      jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set(['hadb1']));
      cmsClient.postAuthenticated.mockImplementation((_url, body) => {
        if (body.task === 'ha_start') {
          return Promise.reject(new Error('heartbeat start: fail'));
        }
        return Promise.resolve({ ...successResponse, task: 'startdb' });
      });

      const result = await service.startAllDatabases(mockUserId, mockHostUid, ['nonhadb']);

      expect(result.succeeded).toEqual(['nonhadb']);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].dbname).toBe('hadb1');
    });
  });

  describe('stopAllDatabases', () => {
    const successResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
    };

    it('stops every HA database with a single bulk ha_stop, regardless of the passed dbnames', async () => {
      jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set(['hadb1', 'hadb2']));
      cmsClient.postAuthenticated.mockResolvedValue({ ...successResponse, task: 'ha_stop' });

      const result = await service.stopAllDatabases(mockUserId, mockHostUid, ['nonhadb']);

      const haStopCalls = cmsClient.postAuthenticated.mock.calls.filter(
        ([, body]) => body.task === 'ha_stop'
      );
      expect(haStopCalls).toHaveLength(1);
      expect(haStopCalls[0][1]).not.toHaveProperty('dbname');
      expect(result.succeeded).toEqual(expect.arrayContaining(['hadb1', 'hadb2']));
    });

    it('skips the bulk ha_stop call entirely when the host has no HA databases', async () => {
      jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set());
      cmsClient.postAuthenticated.mockResolvedValue({ ...successResponse, task: 'stopdb' });

      await service.stopAllDatabases(mockUserId, mockHostUid, ['db1']);

      const haStopCalls = cmsClient.postAuthenticated.mock.calls.filter(
        ([, body]) => body.task === 'ha_stop'
      );
      expect(haStopCalls).toHaveLength(0);
    });
  });

  describe('restartDatabase', () => {
    const mockBaseResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'stopdb',
    };

    const mockStartResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'startdb',
    };

    const mockStartInfoResponse = {
      activelist: { active: [] },
      dblist: { dbs: [] },
    };

    beforeEach(() => {
      jest.spyOn(databaseInfoService, 'startInfo').mockResolvedValue(mockStartInfoResponse as any);
      jest.spyOn(databaseInfoService as any, 'effectiveHaDbForDbname').mockResolvedValue(false);
    });

    it('should successfully restart database', async () => {
      cmsClient.postAuthenticated
        .mockResolvedValueOnce(mockBaseResponse) // stop
        .mockResolvedValueOnce(mockStartResponse); // start

      const result = await service.restartDatabase(mockUserId, mockHostUid, mockDbname);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockStartInfoResponse);
    });

    it('should use ha_stop and ha_start when effectiveHaDbForDbname is true', async () => {
      jest.spyOn(databaseInfoService as any, 'effectiveHaDbForDbname').mockResolvedValue(true);
      const haStop = { ...mockBaseResponse, task: 'ha_stop' };
      const haStart = { ...mockStartResponse, task: 'ha_start' };
      cmsClient.postAuthenticated.mockResolvedValueOnce(haStop).mockResolvedValueOnce(haStart);

      await service.restartDatabase(mockUserId, mockHostUid, mockDbname);

      expect(cmsClient.postAuthenticated).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        expect.objectContaining({ task: 'ha_stop', dbname: mockDbname }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(cmsClient.postAuthenticated).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.objectContaining({ task: 'ha_start', dbname: mockDbname }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
    });

    it('should throw CmsError when stop fails', async () => {
      const failedResponse = {
        ...mockBaseResponse,
        status: 'fail',
        note: 'Stop failed',
      };
      cmsClient.postAuthenticated.mockResolvedValueOnce(failedResponse);

      await expect(service.restartDatabase(mockUserId, mockHostUid, mockDbname)).rejects.toThrow(
        CmsError
      );
    });

    it('should throw CmsError when start fails', async () => {
      const failedResponse = {
        ...mockStartResponse,
        status: 'fail',
        note: 'Start failed',
      };
      cmsClient.postAuthenticated
        .mockResolvedValueOnce(mockBaseResponse) // stop succeeds
        .mockResolvedValueOnce(failedResponse); // start fails

      await expect(service.restartDatabase(mockUserId, mockHostUid, mockDbname)).rejects.toThrow(
        CmsError
      );
    });
  });

  describe('saveDatabaseProfile', () => {
    const mockStartInfoResponse = {
      activelist: { active: [] },
      dblist: { dbs: [] },
    };

    beforeEach(() => {
      jest.spyOn(databaseInfoService, 'startInfo').mockResolvedValue(mockStartInfoResponse as any);
    });

    it('should successfully save database profile', async () => {
      const mockUser = {
        id: mockUserId,
        ...hostInGroups(mockHost),
      };

      repository.atomicUpdateUser.mockImplementation(async (userId, callback) => {
        return await callback(mockUser as any);
      });

      const result = await service.saveDatabaseProfile(
        mockUserId,
        mockHostUid,
        mockDbname,
        'dba',
        'password'
      );

      expect(repository.atomicUpdateUser).toHaveBeenCalled();
      expect(result).toEqual(mockStartInfoResponse);
    });

    it('should throw ValidationError when dbname or id is missing', async () => {
      await expect(
        service.saveDatabaseProfile(mockUserId, mockHostUid, '', 'dba', 'password')
      ).rejects.toThrow();

      await expect(
        service.saveDatabaseProfile(mockUserId, mockHostUid, mockDbname, '', 'password')
      ).rejects.toThrow();
    });

    it('should save empty password when password is omitted or null', async () => {
      const mockUser = {
        id: mockUserId,
        ...hostInGroups({ ...mockHost, dbProfiles: {} }),
      };

      repository.atomicUpdateUser.mockImplementation(async (userId, callback) => {
        return await callback(mockUser as any);
      });

      await service.saveDatabaseProfile(mockUserId, mockHostUid, mockDbname, 'dba', '');
      expect(getMockHostFromUser(mockUser)!.dbProfiles[mockDbname].password).toBe('');

      await service.saveDatabaseProfile(mockUserId, mockHostUid, mockDbname, 'dba', null as any);
      expect(getMockHostFromUser(mockUser)!.dbProfiles[mockDbname].password).toBe('');
    });

    it('should overwrite existing database profile', async () => {
      const hostWithProfile = {
        ...mockHost,
        dbProfiles: { [mockDbname]: { dbname: mockDbname, id: 'dba', password: 'old' } },
      };
      const mockUser = {
        id: mockUserId,
        ...hostInGroups(hostWithProfile),
      };

      repository.atomicUpdateUser.mockImplementation(async (userId, callback) => {
        return await callback(mockUser as any);
      });

      await service.saveDatabaseProfile(mockUserId, mockHostUid, mockDbname, 'dba', 'newpass');

      expect(getMockHostFromUser(mockUser)!.dbProfiles[mockDbname]).toEqual({
        dbname: mockDbname,
        id: 'dba',
        password: 'newpass',
      });
      expect(repository.atomicUpdateUser).toHaveBeenCalled();
    });

    it('should throw HostError when host is not found', async () => {
      const mockUser = {
        id: mockUserId,
        host_groups: {},
      };

      repository.atomicUpdateUser.mockImplementation(async (userId, callback) => {
        return await callback(mockUser as any);
      });

      await expect(
        service.saveDatabaseProfile(mockUserId, mockHostUid, mockDbname, 'dba', 'password')
      ).rejects.toThrow(HostError);
    });
  });

  describe('deleteDatabaseProfile', () => {
    it('delegates to databaseUserService and returns latest start info', async () => {
      const mockStartInfoResponse = {
        activelist: { active: [] },
        dblist: { dbs: [] },
      };
      jest.spyOn(databaseInfoService, 'startInfo').mockResolvedValue(mockStartInfoResponse as any);

      const result = await service.deleteDatabaseProfile(mockUserId, mockHostUid, mockDbname);

      expect(databaseUserService.deleteDbProfile).toHaveBeenCalledWith(
        mockUserId,
        mockHostUid,
        mockDbname
      );
      expect(result).toEqual(mockStartInfoResponse);
    });
  });

  describe('getDBSpaceInfo', () => {
    const mockDbSpaceInfoResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'dbspaceinfo',
      dbname: 'testdb',
      pagesize: '16384',
      logpagesize: '16384',
      freespace: '1048576',
    };

    it('should successfully get database space info', async () => {
      const mockStartInfoResponse = {
        __EXEC_TIME: '10 ms',
        note: 'none',
        status: 'success',
        task: 'startinfo',
        dblist: [
          {
            dbs: [{ dbname: mockDbname }],
          },
        ],
        activelist: [{ active: [] }],
      };

      cmsClient.postAuthenticated
        .mockResolvedValueOnce(mockStartInfoResponse) // startinfo check
        .mockResolvedValueOnce(mockDbSpaceInfoResponse); // dbspaceinfo

      const result = await service.getDBSpaceInfo(mockUserId, mockHostUid, mockDbname);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        dbname: 'testdb',
        pagesize: '16384',
        logpagesize: '16384',
        freespace: '1048576',
      });
    });
  });

  describe('createDatabase', () => {
    const mockCreateDbRequest = {
      dbname: 'testdb',
      numpage: '1000',
      pagesize: '16384',
      logsize: '100',
      logpagesize: '16384',
      genvolpath: '/path/to/testdb',
      logvolpath: '/path/to/testdb',
      charset: 'ko_KR.utf8',
      overwrite_config_file: 'YES' as const,
    };

    const mockCreateDatabaseResponse: CreateDatabaseClientResponse = {
      success: true,
    };

    const mockStartInfoForCreate = { activelist: { active: [] }, dblist: { dbs: [] } };

    beforeEach(() => {
      jest.spyOn(service, 'createDatabaseInternal').mockResolvedValue(mockCreateDatabaseResponse);
      jest.spyOn(databaseInfoService, 'startInfo').mockResolvedValue(mockStartInfoForCreate as any);
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'none',
        status: 'success',
        task: 'startdb',
      });
      databaseUserService.updateUser.mockResolvedValue({ success: true });
      databaseConfigService.setAutoAddVol.mockResolvedValue({ success: true });
      databaseConfigService.setAutoStart.mockResolvedValue({ success: true });
    });

    it('should successfully create database without optional configuration', async () => {
      const startDatabaseSpy = jest.spyOn(service, 'startDatabase');
      const request = {
        ...mockCreateDbRequest,
      };

      const result = await service.createDatabase(mockUserId, mockHostUid, request);

      expect(service.createDatabaseInternal).toHaveBeenCalledWith(
        mockUserId,
        mockHostUid,
        mockCreateDbRequest,
        undefined
      );
      expect(result).toEqual({
        createDatabase: {
          success: true,
          data: mockCreateDatabaseResponse,
        },
      });
      expect(startDatabaseSpy).not.toHaveBeenCalled();
      expect(databaseUserService.updateUser).not.toHaveBeenCalled();
      expect(databaseConfigService.setAutoAddVol).not.toHaveBeenCalled();
      expect(databaseConfigService.setAutoStart).not.toHaveBeenCalled();
    });

    it('should successfully create database with all optional configurations', async () => {
      const request = {
        ...mockCreateDbRequest,
        username: 'dba',
        updateUser: {
          userpass: 'newpassword',
        },
        setAutoAddVol: {
          data: 'ON',
          data_warn_outofspace: '0.15',
          data_ext_page: '32768',
          index: 'ON',
          index_warn_outofspace: '0.15',
          index_ext_page: '32768',
        },
        setAutoStart: true,
      };

      const result = await service.createDatabase(mockUserId, mockHostUid, request);

      expect(service.createDatabaseInternal).toHaveBeenCalledWith(
        mockUserId,
        mockHostUid,
        mockCreateDbRequest,
        undefined
      );
      expect(databaseUserService.updateUser).toHaveBeenCalledWith(
        mockUserId,
        mockHostUid,
        'testdb',
        'dba',
        'newpassword',
        { group: [] },
        []
      );
      expect(databaseConfigService.setAutoAddVol).toHaveBeenCalledWith(
        mockUserId,
        mockHostUid,
        'testdb',
        request.setAutoAddVol
      );
      expect(databaseConfigService.setAutoStart).toHaveBeenCalledWith(mockUserId, mockHostUid, {
        confname: 'cubridconf',
        dbname: 'testdb',
      });
      expect(result).toEqual({
        createDatabase: {
          success: true,
          data: mockCreateDatabaseResponse,
        },
        startDatabase: {
          success: true,
          data: mockStartInfoForCreate,
        },
        updateUser: {
          success: true,
          data: { success: true },
        },
        setAutoAddVol: {
          success: true,
          data: { success: true },
        },
        setAutoStart: {
          success: true,
          data: { success: true },
        },
      });
    });

    it('should use default username "dba" when username is not provided', async () => {
      const request = {
        ...mockCreateDbRequest,
        updateUser: {
          userpass: 'newpassword',
        },
      };

      await service.createDatabase(mockUserId, mockHostUid, request);

      expect(databaseUserService.updateUser).toHaveBeenCalledWith(
        mockUserId,
        mockHostUid,
        'testdb',
        'dba',
        'newpassword',
        { group: [] },
        []
      );
    });

    it('does not start the database or call updateUser when userpass is empty and auto-start is off', async () => {
      const startDatabaseSpy = jest.spyOn(service, 'startDatabase');
      const request = {
        ...mockCreateDbRequest,
        setAutoStart: false,
        username: 'dba',
        updateUser: {
          userpass: '',
        },
      };

      const result = await service.createDatabase(mockUserId, mockHostUid, request);

      // A newly created database's dba user already has a blank password,
      // so an empty userpass is a no-op — it shouldn't force the database
      // to start just because the updateUser object was present.
      expect(startDatabaseSpy).not.toHaveBeenCalled();
      expect(databaseUserService.updateUser).not.toHaveBeenCalled();
      expect(result.startDatabase).toBeUndefined();
      expect(result.updateUser).toBeUndefined();
    });

    it('should handle createDatabase failure and continue with other operations', async () => {
      const createError = DatabaseError.Unknown();
      jest.spyOn(service, 'createDatabaseInternal').mockRejectedValue(createError);

      const request = {
        ...mockCreateDbRequest,
        updateUser: {
          userpass: 'newpassword',
        },
        setAutoStart: true,
      };

      await expect(service.createDatabase(mockUserId, mockHostUid, request)).rejects.toThrow(createError);

      // createdb가 실패하면 나머지 단계는 중단되어야 함
      expect(databaseUserService.updateUser).not.toHaveBeenCalled();
      expect(databaseConfigService.setAutoStart).not.toHaveBeenCalled();
    });

    it('should handle updateUser failure but continue with other operations', async () => {
      const updateError = DatabaseError.Unknown();
      databaseUserService.updateUser.mockRejectedValue(updateError);

      const request = {
        ...mockCreateDbRequest,
        username: 'dba',
        updateUser: {
          userpass: 'newpassword',
        },
        setAutoAddVol: {
          data: 'ON',
          data_warn_outofspace: '0.15',
          data_ext_page: '32768',
          index: 'ON',
          index_warn_outofspace: '0.15',
          index_ext_page: '32768',
        },
        setAutoStart: true,
      };

      const result = await service.createDatabase(mockUserId, mockHostUid, request);

      expect(result.createDatabase.success).toBe(true);
      expect(result.updateUser).toEqual({
        success: false,
        error: {
          message: DatabaseErrorCode.UNKNOWN,
          code: DatabaseErrorCode.UNKNOWN,
          details: undefined,
        },
      });
      // Other operations should still succeed
      expect(result.setAutoAddVol?.success).toBe(true);
      expect(result.setAutoStart?.success).toBe(true);
    });

    it('should handle setAutoAddVol failure but continue with other operations', async () => {
      const autoAddVolError = DatabaseError.Unknown();
      databaseConfigService.setAutoAddVol.mockRejectedValue(autoAddVolError);

      const request = {
        ...mockCreateDbRequest,
        updateUser: {
          userpass: 'newpassword',
        },
        setAutoAddVol: {
          data: 'ON',
          data_warn_outofspace: '0.15',
          data_ext_page: '32768',
          index: 'ON',
          index_warn_outofspace: '0.15',
          index_ext_page: '32768',
        },
        setAutoStart: true,
      };

      const result = await service.createDatabase(mockUserId, mockHostUid, request);

      expect(result.createDatabase.success).toBe(true);
      expect(result.updateUser?.success).toBe(true);
      expect(result.setAutoAddVol).toEqual({
        success: false,
        error: {
          message: DatabaseErrorCode.UNKNOWN,
          code: DatabaseErrorCode.UNKNOWN,
          details: undefined,
        },
      });
      expect(result.setAutoStart?.success).toBe(true);
    });

    it('should handle setAutoStart failure but other operations succeed', async () => {
      const autoStartError = DatabaseError.Unknown();
      databaseConfigService.setAutoStart.mockRejectedValue(autoStartError);

      const request = {
        ...mockCreateDbRequest,
        updateUser: {
          userpass: 'newpassword',
        },
        setAutoStart: true,
      };

      const result = await service.createDatabase(mockUserId, mockHostUid, request);

      expect(result.createDatabase.success).toBe(true);
      expect(result.updateUser?.success).toBe(true);
      expect(result.setAutoStart).toEqual({
        success: false,
        error: {
          message: DatabaseErrorCode.UNKNOWN,
          code: DatabaseErrorCode.UNKNOWN,
          details: undefined,
        },
      });
    });

    it('should fail fast: createdb failure should reject and stop further operations', async () => {
      const createError = DatabaseError.Unknown();

      jest.spyOn(service, 'createDatabaseInternal').mockRejectedValue(createError);

      const request = {
        ...mockCreateDbRequest,
        updateUser: {
          userpass: 'newpassword',
        },
        setAutoStart: true,
      };

      await expect(service.createDatabase(mockUserId, mockHostUid, request)).rejects.toThrow(createError);
      expect(databaseUserService.updateUser).not.toHaveBeenCalled();
      expect(databaseConfigService.setAutoStart).not.toHaveBeenCalled();
    });
  });

  describe('createDatabaseInternal logsize conversion', () => {
    it('should convert logsize from MB to CMS pages using logpagesize', async () => {
      // Arrange: prevent file existence check from blocking the flow
      (fileService as any).checkfileInternal = jest.fn().mockResolvedValue({
        existfile: undefined,
      });

      const request = {
        dbname: 'testdb',
        numpage: '32768',
        pagesize: '16384',
        logsize: '512', // MB (client contract)
        logpagesize: '16384', // bytes
        genvolpath: '/path/to/testdb',
        logvolpath: '/path/to/testdb',
        charset: 'en_US.utf8',
        overwrite_config_file: 'YES' as const,
        exvol: [
          {
            testdb_data_x001: {
              type: 'data',
              size: 512,
              pagesize: 16384,
              volpath: '/path/to/testdb',
            },
          },
        ],
      };

      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'none',
        status: 'success',
        task: 'createdb',
      });

      // Act
      await service.createDatabaseInternal(mockUserId, mockHostUid, request as any);

      // Assert: logsize should become pages = floor(MB*1024*1024 / bytesPerPage)
      // 512 * 1024 * 1024 / 16384 = 32768 pages
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'createdb',
          logsize: '32768',
          logpagesize: '16384',
          async: 'yes',
        }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
    });
  });

  describe('deleteDatabase', () => {
    const mockSuccessResponse: DeleteDatabaseCmsResponse = {
      __EXEC_TIME: '848 ms',
      note: 'none',
      status: 'success',
      task: 'deletedb',
    };

    const mockStartInfoAfterDelete = {
      activelist: { active: [] },
      dblist: { dbs: [] },
    };

    it('should successfully delete database with delbackup "y" and return start-info', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      jest.spyOn(databaseInfoService, 'startInfo').mockResolvedValue(mockStartInfoAfterDelete as any);
      const request: DeleteDatabaseRequest = {
        delbackup: 'y',
      };

      const result = await service.deleteDatabase(
        mockUserId,
        mockHostUid,
        mockDbname,
        request
      );

      expect(hostService.findHostInternal).toHaveBeenCalledWith(mockUserId, mockHostUid);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        `https://${mockHost.address}:${mockHost.port}/cm_api`,
        {
          task: 'deletedb',
          token: mockHost.token,
          dbname: mockDbname,
          delbackup: 'y',
          async: 'yes',
        },
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual(mockStartInfoAfterDelete);
    });

    it('should successfully delete database with delbackup "n" and return start-info', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      jest.spyOn(databaseInfoService, 'startInfo').mockResolvedValue(mockStartInfoAfterDelete as any);
      const request: DeleteDatabaseRequest = {
        delbackup: 'n',
      };

      const result = await service.deleteDatabase(
        mockUserId,
        mockHostUid,
        mockDbname,
        request
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'deletedb',
          delbackup: 'n',
        }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual(mockStartInfoAfterDelete);
    });

    it('should throw HostError if host is not found', async () => {
      cmsConfigService.getAllSystemParam.mockRejectedValue(
        HostError.NoSuchHost({ hostUid: mockHostUid })
      );
      const request: DeleteDatabaseRequest = {
        delbackup: 'y',
      };

      await expect(
        service.deleteDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(HostError);
    });

    it('should throw DatabaseError when host is HA (deletedb blocked)', async () => {
      cmsConfigService.getAllSystemParam.mockResolvedValue({
        conflist: [{ confdata: ['[common]', 'ha_mode=ON'] }],
      } as any);
      const request: DeleteDatabaseRequest = {
        delbackup: 'y',
      };

      await expect(
        service.deleteDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(DatabaseError);

      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('should throw CmsError if CMS request fails', async () => {
      cmsClient.postAuthenticated.mockRejectedValue(
        CmsError.RequestFailed({ message: 'CMS request failed' })
      );
      const request: DeleteDatabaseRequest = {
        delbackup: 'y',
      };

      await expect(
        service.deleteDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(CmsError);
    });

    it('should throw CmsError when executeCmsRequest reports invalid token', async () => {
      const execSpy = jest
        .spyOn(service as any, 'executeCmsRequest')
        .mockRejectedValueOnce(CmsError.InvalidToken({ response: { note: 'invalid token' } }));
      const request: DeleteDatabaseRequest = {
        delbackup: 'y',
      };

      await expect(
        service.deleteDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(CmsError);

      execSpy.mockRestore();
    });

    it('should throw CmsError if CMS status is fail', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'operation failed',
        status: 'fail',
        task: 'deletedb',
      } as any);
      const request: DeleteDatabaseRequest = {
        delbackup: 'y',
      };

      await expect(
        service.deleteDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(CmsError);
    });
  });
});
