import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseLifecycleService, HA_NODE_STEP } from './database-lifecycle.service';
import { busyDatabase } from './database-action-lock';
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
import { ValidationError } from '@error/validation/validation-error';
import { DatabaseErrorCode } from '@error/database/database-error-code';
import { HostError } from '@error/index';
import { CmsError } from '@error/cms/cms-error';
import { CMS_CONFNAME_HACONF } from '@database/database.constants';
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
  let cmsJobLockService: { hasActiveJobForHost: jest.Mock; activeJobDatabasesForHost: jest.Mock };

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
      ensureDbLogin: jest.fn().mockResolvedValue(undefined),
      isDbLoginActive: jest.fn().mockReturnValue(false),
      isDbLoginRestoring: jest.fn().mockReturnValue(false),
      deleteDbProfile: jest.fn().mockResolvedValue(undefined),
    };

    const mockDatabaseConfigService = {
      setAutoAddVol: jest.fn(),
      setAutoStart: jest.fn(),
      removeAutoStart: jest.fn(),
      ensureDbHaModeOff: jest.fn().mockResolvedValue(undefined),
      forgetDatabaseAfterDelete: jest.fn().mockResolvedValue(undefined),
    };

    const mockBrokerService = {
      startAllBrokers: jest.fn().mockResolvedValue({ success: true }),
      stopAllBrokers: jest.fn().mockResolvedValue({ success: true }),
    };

    const mockCmsJobLockService = {
      hasActiveJobForHost: jest.fn().mockResolvedValue(null),
      activeJobDatabasesForHost: jest.fn().mockResolvedValue(new Map()),
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
      activelist: { active: [{ dbname: 'testdb', isProfileExists: false, isLoggedIn: false, isLoggedOut: false }] },
      dblist: {
        dbs: [
          {
            dbname: 'testdb',
            dbdir: '/path/to/testdb',
            isProfileExists: false,
            isLoggedIn: false,
            isLoggedOut: false,
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
        activelist: { active: [{ dbname: 'testdb', isProfileExists: true, isLoggedIn: false, isLoggedOut: false }] },
        dblist: {
          dbs: [
            {
              dbname: 'testdb',
              dbdir: '/path/to/testdb',
              isProfileExists: true,
              isLoggedIn: false,
              isLoggedOut: false,
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

    it('starts it while a job runs on another database of the host', async () => {
      cmsJobLockService.hasActiveJobForHost.mockResolvedValue({ jobId: 'job-1', dbname: 'otherdb' });
      cmsJobLockService.activeJobDatabasesForHost.mockResolvedValue(new Map([['otherdb', 'job-1']]));

      await service.startDatabase(mockUserId, mockHostUid, mockDbname);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(expect.any(String),
        expect.objectContaining({ dbname: mockDbname }), expect.anything());
    });

    it('refuses while a job works on this database, naming it (e.g. the new database of a copy)', async () => {
      cmsJobLockService.activeJobDatabasesForHost.mockResolvedValue(new Map([[mockDbname, 'copy-1']]));

      await expect(service.startDatabase(mockUserId, mockHostUid, mockDbname)).rejects.toMatchObject({
        code: DatabaseErrorCode.OPERATION_IN_PROGRESS,
        additionalData: expect.objectContaining({ dbname: mockDbname, existingJobId: 'copy-1' }),
      });
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
    it('refuses to stop a database while a job works on it', async () => {
      cmsJobLockService.activeJobDatabasesForHost.mockResolvedValue(new Map([['testdb', 'load-1']]));

      await expect(service.stopDatabase('user-123', 'host-uid-1', 'testdb')).rejects.toMatchObject({
        code: DatabaseErrorCode.OPERATION_IN_PROGRESS,
        additionalData: expect.objectContaining({ dbname: 'testdb' }),
      });
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

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

  describe('a second start/stop of the same database', () => {
    it('is turned away while the first is still running', async () => {
      jest.spyOn(databaseInfoService as any, 'effectiveHaDbForDbname').mockResolvedValue(true);
      let finishStart!: () => void;
      cmsClient.postAuthenticated.mockImplementation((_url, body) => {
        if (body.task === 'ha_start') {
          return new Promise((r) => { finishStart = () => r({ __EXEC_TIME: '1 ms', note: 'none', status: 'success', task: 'ha_start' }); });
        }
        return Promise.resolve({ __EXEC_TIME: '1 ms', note: 'none', status: 'success', task: body.task });
      });
      jest.spyOn(databaseInfoService as any, 'startInfo').mockResolvedValue({ activelist: { active: [] } });

      const start = service.startDatabase(mockUserId, mockHostUid, 'hadb1');
      await new Promise((r) => setTimeout(r, 0));
      await expect(service.stopDatabase(mockUserId, mockHostUid, 'hadb1')).rejects.toMatchObject({
        code: 'DATABASE_ACTION_IN_PROGRESS',
      });
      expect(cmsClient.postAuthenticated.mock.calls.filter(([, body]) => body.task === 'ha_stop')).toHaveLength(0);

      finishStart();
      await start;
      await expect(service.stopDatabase(mockUserId, mockHostUid, 'hadb1')).resolves.toBeDefined();
    });
  });

  describe('startDatabase on an HA database that is already running', () => {
    it('does not send ha_start, which could stop it again', async () => {
      jest.spyOn(databaseInfoService as any, 'effectiveHaDbForDbname').mockResolvedValue(true);
      jest.spyOn(databaseInfoService as any, 'startInfo').mockResolvedValue({ activelist: { active: [{ dbname: 'hadb1' }] } });

      await service.startDatabase(mockUserId, mockHostUid, 'hadb1');

      expect(cmsClient.postAuthenticated.mock.calls.filter(([, body]) => body.task === 'ha_start')).toHaveLength(0);
    });
  });

  describe('Start/Stop All leave a database already in the wanted state alone', () => {
    it('does not stopdb a database that is not running', async () => {
      jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set());
      jest.spyOn(databaseInfoService as any, 'startInfo').mockResolvedValue({ activelist: { active: [{ dbname: 'db1' }] } });
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => ({ __EXEC_TIME: '1 ms', note: 'none', status: 'success', task: body.task }));

      const result = await service.stopAllDatabases(mockUserId, mockHostUid, ['db1', 'db2']);

      expect(cmsClient.postAuthenticated.mock.calls.filter(([, body]) => body.task === 'stopdb').map(([, body]) => (body as { dbname?: string }).dbname)).toEqual(['db1']);
      expect(result.failed).toEqual([]);
    });
  });

  describe('startAllDatabases', () => {
    const successResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
    };

    const haCalls = (task: string) =>
      cmsClient.postAuthenticated.mock.calls.filter(([, body]) => body.task === task).map(([, body]) => body);

    it('starts each stopped HA database with its own ha_start, one at a time', async () => {
            jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set(['hadb1', 'hadb2', 'hadb3']));
      jest.spyOn(databaseInfoService as any, 'startInfo').mockResolvedValue({ activelist: { active: [{ dbname: 'hadb2' }] } });
      let inFlight = 0;
      let maxInFlight = 0;
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
        return { ...successResponse, task: body.task };
      });

      const result = await service.startAllDatabases(mockUserId, mockHostUid, []);

      expect(haCalls('ha_start')).toEqual([
        expect.objectContaining({ dbname: 'hadb1' }),
        expect.objectContaining({ dbname: 'hadb3' }),
      ]);
      expect(maxInFlight).toBe(1);
      expect(result.succeeded).toEqual(['hadb1', 'hadb3']);
      expect(result.skipped).toEqual([]);
    });

    it('sends no ha_start and fails the HA databases when the running list cannot be read', async () => {
            jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set(['hadb1']));
      jest.spyOn(databaseInfoService as any, 'startInfo').mockRejectedValue(new Error('startinfo timed out'));
      cmsClient.postAuthenticated.mockResolvedValue({ ...successResponse, task: 'startdb' });

      const result = await service.startAllDatabases(mockUserId, mockHostUid, ['nonhadb']);

      expect(haCalls('ha_start')).toHaveLength(0);
      expect(result.failed).toEqual([{ dbname: 'hadb1', error: 'startinfo timed out' }]);
      expect(result.succeeded).toEqual(['nonhadb']);
    });

    it('fails an HA database that is not logged in, without sending its ha_start', async () => {
      jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set(['hadb1', 'hadb2']));
      jest.spyOn(databaseInfoService as any, 'startInfo').mockResolvedValue({ activelist: { active: [] } });
      databaseUserService.ensureDbLogin.mockImplementation(async (_u, _h, dbname) => {
        if (dbname === 'hadb1') throw new Error('no login');
        return;
      });
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => ({ ...successResponse, task: body.task }));

      const result = await service.startAllDatabases(mockUserId, mockHostUid, ['nonhadb']);

      const haStartCalls = cmsClient.postAuthenticated.mock.calls
        .filter(([, body]) => body.task === 'ha_start')
        .map(([, body]) => (body as { dbname?: string }).dbname);
      expect(haStartCalls).toEqual(['hadb2']);
      expect(result.failed).toEqual([{ dbname: 'hadb1', error: 'no login' }]);
      expect(result.succeeded).toEqual(['hadb2', 'nonhadb']);
      expect(result.skipped).toEqual([]);
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

    it('reports only the HA database whose ha_start fails, isolated from non-HA results', async () => {
            jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set(['hadb1']));
      jest.spyOn(databaseInfoService as any, 'startInfo').mockResolvedValue({ activelist: { active: [] } });
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

    it('stops each running HA database with its own ha_stop, never a dbname-less one', async () => {
            jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set(['hadb1', 'hadb2']));
      jest.spyOn(databaseInfoService as any, 'startInfo').mockResolvedValue({
        activelist: { active: [{ dbname: 'hadb1' }, { dbname: 'nonhadb' }] },
      });
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => ({ ...successResponse, task: body.task }));

      const result = await service.stopAllDatabases(mockUserId, mockHostUid, ['nonhadb']);

      const haStopCalls = cmsClient.postAuthenticated.mock.calls
        .filter(([, body]) => body.task === 'ha_stop')
        .map(([, body]) => body);
      expect(haStopCalls).toEqual([expect.objectContaining({ dbname: 'hadb1' })]);
      expect(result.succeeded).toEqual(['hadb1', 'nonhadb']);
      expect(databaseUserService.ensureDbLogin).toHaveBeenCalledWith(mockUserId, mockHostUid, 'hadb1');
    });

    it('leaves out the databases a job works on (HA ones too), reporting them as skipped', async () => {
      jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set(['hadb1', 'hadb2']));
      jest.spyOn(databaseInfoService as any, 'startInfo').mockResolvedValue({
        activelist: { active: [{ dbname: 'hadb1' }, { dbname: 'hadb2' }, { dbname: 'db1' }, { dbname: 'db2' }] },
      });
      cmsJobLockService.activeJobDatabasesForHost.mockResolvedValue(new Map([['hadb1', 'backup-1'], ['db1', 'load-1']]));
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => ({ ...successResponse, task: body.task }));

      const result = await service.stopAllDatabases(mockUserId, mockHostUid, ['db1', 'db2']);

      const sent = cmsClient.postAuthenticated.mock.calls.map(([, body]) => `${body.task}:${(body as { dbname?: string }).dbname}`);
      expect(sent.sort()).toEqual(['ha_stop:hadb2', 'stopdb:db2']);
      expect(result.succeeded.sort()).toEqual(['db2', 'hadb2']);
      expect(result.skipped).toEqual(expect.arrayContaining([
        { dbname: 'hadb1', reason: 'A job is running on it' },
        { dbname: 'db1', reason: 'A job is running on it' },
      ]));
    });

    it('skips the databases the user is not logged in to, sending them nothing', async () => {
      jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set(['hadb1']));
      jest.spyOn(databaseInfoService as any, 'startInfo').mockResolvedValue({
        activelist: { active: [{ dbname: 'hadb1' }, { dbname: 'db1' }, { dbname: 'db2' }] },
      });
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => ({ ...successResponse, task: body.task }));
      databaseUserService.ensureDbLogin.mockImplementation(async (_u: string, _h: string, dbname: string) => {
        if (dbname !== 'db1') {
          throw ValidationError.MissingDBCredentials(dbname, ['id', 'password'], { reason: dbname === 'hadb1' ? 'loggedOut' : 'notLoggedIn' });
        }
      });

      const result = await service.stopAllDatabases(mockUserId, mockHostUid, ['db1', 'db2']);

      expect(cmsClient.postAuthenticated.mock.calls.map(([, body]) => [body.task, (body as { dbname?: string }).dbname])).toEqual([['stopdb', 'db1']]);
      expect(result).toEqual({
        succeeded: ['db1'],
        failed: [],
        skipped: [
          { dbname: 'hadb1', reason: 'Logged out' },
          { dbname: 'db2', reason: 'Not logged in' },
        ],
      });
    });

    it('sends no ha_stop when the host has no HA databases', async () => {
      jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set());
      cmsClient.postAuthenticated.mockResolvedValue({ ...successResponse, task: 'stopdb' });

      await service.stopAllDatabases(mockUserId, mockHostUid, ['db1']);

      const haStopCalls = cmsClient.postAuthenticated.mock.calls.filter(
        ([, body]) => body.task === 'ha_stop'
      );
      expect(haStopCalls).toHaveLength(0);
    });
  });

  describe('runSelectedDatabasesAction', () => {
    const ok = { __EXEC_TIME: '10 ms', note: 'none', status: 'success' };
    const tasks = () => cmsClient.postAuthenticated.mock.calls.map(([, body]) => [body.task, (body as { dbname?: string }).dbname]);
    // start-info follows what the CMS calls did, like a real host.
    let running: Set<string>;
    const hostState = (active: string[]) => {
      running = new Set(active);
      jest.spyOn(databaseInfoService as any, 'startInfo').mockImplementation(async () => ({
        dblist: { dbs: ['hadb1', 'hadb2', 'db1', 'db2'].map((dbname) => ({ dbname })) },
        activelist: { active: [...running].map((dbname) => ({ dbname })) },
      }));
      jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set(['hadb1', 'hadb2']));
    };
    const cmsApplies = (body: { task: string; dbname?: string }) => {
      if (body.task === 'startdb' || body.task === 'ha_start') running.add(body.dbname as string);
      if (body.task === 'stopdb' || body.task === 'ha_stop') running.delete(body.dbname as string);
      return { ...ok, task: body.task };
    };

    it('starts only the selected databases and skips the ones that do not apply', async () => {
      hostState(['db2']);
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => ({ ...ok, task: body.task }));

      const result = await service.runSelectedDatabasesAction(mockUserId, mockHostUid, 'start', ['hadb1', 'db1', 'db2', 'nodb']);

      expect(tasks()).toEqual([['ha_start', 'hadb1'], ['startdb', 'db1']]);
      expect(result.succeeded).toEqual(['hadb1', 'db1']);
      expect(result.skipped).toEqual([
        { dbname: 'db2', reason: 'Already running' },
        { dbname: 'nodb', reason: 'Not a database on this host' },
      ]);
      expect(result.failed).toEqual([]);
    });

    it('skips a database a job works on, with the reason, and acts on the others', async () => {
      hostState(['db1', 'db2']);
      cmsJobLockService.activeJobDatabasesForHost.mockResolvedValue(new Map([['db1', 'load-1']]));
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => cmsApplies(body));

      const result = await service.runSelectedDatabasesAction(mockUserId, mockHostUid, 'stop', ['db1', 'db2']);

      expect(tasks()).toEqual([['stopdb', 'db2']]);
      expect(result.succeeded).toEqual(['db2']);
      expect(result.skipped).toEqual([{ dbname: 'db1', reason: 'A job is running on it' }]);
    });

    const noLogin = (reasons: Record<string, 'loggedOut' | 'notLoggedIn'>) =>
      databaseUserService.ensureDbLogin.mockImplementation(async (_u: string, _h: string, dbname: string) => {
        if (reasons[dbname]) throw ValidationError.MissingDBCredentials(dbname, ['id', 'password'], { reason: reasons[dbname] });
      });

    it('skips the selected databases the user is not logged in to, sending them nothing', async () => {
      hostState(['hadb1', 'db1', 'db2']);
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => cmsApplies(body));
      noLogin({ hadb1: 'loggedOut', db2: 'notLoggedIn' });

      const result = await service.runSelectedDatabasesAction(mockUserId, mockHostUid, 'stop', ['hadb1', 'db1', 'db2']);

      expect(tasks()).toEqual([['stopdb', 'db1']]);
      expect(result.succeeded).toEqual(['db1']);
      expect(result.skipped).toEqual([
        { dbname: 'hadb1', reason: 'Logged out' },
        { dbname: 'db2', reason: 'Not logged in' },
      ]);
      expect(result.failed).toEqual([]);
    });

    it('restarts nothing of a database it skipped at the stop for no login', async () => {
      hostState(['db1', 'db2']);
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => cmsApplies(body));
      noLogin({ db2: 'notLoggedIn' });

      const result = await service.runSelectedDatabasesAction(mockUserId, mockHostUid, 'restart', ['db1', 'db2']);

      expect(tasks()).toEqual([['stopdb', 'db1'], ['startdb', 'db1']]);
      expect(result.skipped).toEqual([{ dbname: 'db2', reason: 'Not logged in' }]);
      expect([...running].sort()).toEqual(['db1', 'db2']);
    });

    it('acts on a running database that dblist leaves out', async () => {
      hostState(['db1', 'unlisted']);
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => cmsApplies(body));

      const result = await service.runSelectedDatabasesAction(mockUserId, mockHostUid, 'stop', ['unlisted']);

      expect(tasks()).toEqual([['stopdb', 'unlisted']]);
      expect(result.skipped).toEqual([]);
    });

    it('stops only running selected databases, never an unselected HA database', async () => {
      hostState(['hadb1', 'hadb2', 'db1']);
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => ({ ...ok, task: body.task }));

      const result = await service.runSelectedDatabasesAction(mockUserId, mockHostUid, 'stop', ['hadb1', 'db2']);

      expect(tasks()).toEqual([['ha_stop', 'hadb1']]);
      expect(result.succeeded).toEqual(['hadb1']);
      expect(result.skipped).toEqual([{ dbname: 'db2', reason: 'Not running' }]);
    });

    it('decides which databases apply only while holding them', async () => {
      hostState(['db1']);
      const heldWhenRead: Array<{ dbname: string; action: string } | null> = [];
      (databaseInfoService.startInfo as jest.Mock).mockImplementation(async () => {
        heldWhenRead.push(busyDatabase(`${mockHost.address}:${mockHost.port}`, ['db1', 'db2']));
        return {
          dblist: { dbs: ['db1', 'db2'].map((dbname) => ({ dbname })) },
          activelist: { active: [...running].map((dbname) => ({ dbname })) },
        };
      });
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => cmsApplies(body));

      const result = await service.runSelectedDatabasesAction(mockUserId, mockHostUid, 'stop', ['db1', 'db2']);

      expect(heldWhenRead[0]).toEqual({ dbname: 'db1', action: 'stopSelectedDatabases' });
      expect(result.succeeded).toEqual(['db1']);
      expect(result.skipped).toEqual([{ dbname: 'db2', reason: 'Not running' }]);
    });

    it('restarts by stopping then starting, and does not start one whose stop failed', async () => {
      hostState(['hadb1', 'db1', 'db2']);
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => {
        if (body.task === 'stopdb' && (body as { dbname?: string }).dbname === 'db2') throw new Error('stop failed');
        return cmsApplies(body as { task: string; dbname?: string });
      });

      const result = await service.runSelectedDatabasesAction(mockUserId, mockHostUid, 'restart', ['hadb1', 'db1', 'db2']);

      expect(tasks().map(([task, db]) => `${task}:${db}`)).toEqual(
        expect.arrayContaining(['ha_stop:hadb1', 'stopdb:db1', 'stopdb:db2', 'ha_start:hadb1', 'startdb:db1'])
      );
      expect(tasks()).not.toContainEqual(['startdb', 'db2']);
      expect(result.succeeded).toEqual(['hadb1', 'db1']);
      expect(result.failed).toEqual([{ dbname: 'db2', error: expect.any(String), phase: 'stop' }]);
    });

    it('is turned away while a single action on one of the selected databases is still running', async () => {
      hostState(['hadb1']);
      jest.spyOn(databaseInfoService as any, 'effectiveHaDbForDbname').mockResolvedValue(true);
      let finishStop!: () => void;
      cmsClient.postAuthenticated.mockImplementation((_url, body) => {
        if (body.task === 'ha_stop') return new Promise((r) => { finishStop = () => r(cmsApplies(body as { task: string; dbname?: string })); });
        return Promise.resolve(cmsApplies(body as { task: string; dbname?: string }));
      });

      const single = service.stopDatabase(mockUserId, mockHostUid, 'hadb1');
      await new Promise((r) => setTimeout(r, 0));
      await expect(service.runSelectedDatabasesAction(mockUserId, mockHostUid, 'stop', ['hadb1'])).rejects.toMatchObject({
        code: 'DATABASE_ACTION_IN_PROGRESS',
      });

      finishStop();
      await single;
    });

    it('fails a database that is not logged in, without touching it', async () => {
      hostState([]);
      databaseUserService.ensureDbLogin.mockImplementation(async (_u, _h, dbname) => {
        if (dbname === 'hadb2') throw new Error('no login');
        return;
      });
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => ({ ...ok, task: body.task }));

      const result = await service.runSelectedDatabasesAction(mockUserId, mockHostUid, 'start', ['hadb1', 'hadb2']);

      expect(tasks()).toEqual([['ha_start', 'hadb1']]);
      expect(result.failed).toEqual([{ dbname: 'hadb2', error: 'no login' }]);
    });
  });

  describe('stopWholeService', () => {
    it('is refused while a job runs on any database of the host, before anything is stopped', async () => {
      cmsJobLockService.hasActiveJobForHost.mockResolvedValue({ jobId: 'load-1', dbname: 'db1' });
      const mockBrokerService = (service as any).brokerService;

      await expect(service.stopWholeService(mockUserId, mockHostUid)).rejects.toMatchObject({
        code: DatabaseErrorCode.OPERATION_IN_PROGRESS,
      });
      expect(mockBrokerService.stopAllBrokers).not.toHaveBeenCalled();
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('still stops databases and reports the broker failure when stopping brokers fails', async () => {
      const mockBrokerService = (service as any).brokerService;
      mockBrokerService.stopAllBrokers.mockRejectedValue(new Error('broker stop: fail'));
      jest.spyOn(databaseInfoService, 'startInfo').mockResolvedValue({
        dblist: { dbs: [{ dbname: 'db1' }] },
      } as any);
      jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set());
      cmsClient.postAuthenticated.mockResolvedValue({ status: 'success', task: 'stopdb' } as any);

      const result = await service.stopWholeService(mockUserId, mockHostUid);

      expect(result.failed).toEqual(expect.arrayContaining([
        { name: 'brokers', error: 'broker stop: fail' },
      ]));
      const stopdbCalls = cmsClient.postAuthenticated.mock.calls.filter(
        ([, body]) => body.task === 'stopdb'
      );
      expect(stopdbCalls).toHaveLength(1);
    });

    it('also stops a running database that dblist leaves out', async () => {
      const mockBrokerService = (service as any).brokerService;
      mockBrokerService.stopAllBrokers.mockResolvedValue({ success: true });
      jest.spyOn(databaseInfoService, 'startInfo').mockResolvedValue({
        dblist: { dbs: [{ dbname: 'db1' }] },
        activelist: { active: [{ dbname: 'db1' }, { dbname: 'unlisted' }] },
      } as any);
      jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set());
      cmsClient.postAuthenticated.mockResolvedValue({ status: 'success', task: 'stopdb' } as any);

      const result = await service.stopWholeService(mockUserId, mockHostUid);

      const stopped = cmsClient.postAuthenticated.mock.calls
        .filter(([, body]) => body.task === 'stopdb')
        .map(([, body]) => (body as { dbname?: string }).dbname);
      expect(stopped.sort()).toEqual(['db1', 'unlisted']);
      expect(result).toEqual({ failed: [], skipped: [] });
    });

    it('reports a startInfo failure as its own entry and skips database stop, instead of throwing', async () => {
      const mockBrokerService = (service as any).brokerService;
      mockBrokerService.stopAllBrokers.mockResolvedValue({ success: true });
      jest.spyOn(databaseInfoService, 'startInfo').mockRejectedValue(new Error('status unavailable'));

      const result = await service.stopWholeService(mockUserId, mockHostUid);

      expect(result).toEqual({ failed: [{ name: 'databases', error: 'status unavailable' }], skipped: [] });
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ task: 'stopdb' }),
        expect.anything()
      );
    });

    it('reports a database step failure as its own entry instead of throwing, keeping any broker failure', async () => {
      const mockBrokerService = (service as any).brokerService;
      mockBrokerService.stopAllBrokers.mockRejectedValue(new Error('broker stop: fail'));
      jest.spyOn(databaseInfoService, 'startInfo').mockResolvedValue({
        dblist: { dbs: [{ dbname: 'db1' }] },
      } as any);
      jest.spyOn(databaseInfoService, 'getHaNodeState').mockRejectedValue(new Error('ha db list unavailable'));

      const result = await service.stopWholeService(mockUserId, mockHostUid);

      expect(result.failed).toEqual(expect.arrayContaining([
        { name: 'brokers', error: 'broker stop: fail' },
        { name: 'databases', error: 'ha db list unavailable' },
      ]));
    });
  });

  describe('whole-service start, stop and restart on an HA node', () => {
    let running: Set<string>;
    let conf: string[];
    // cubrid_ha.conf's ha_db_list, or the error reading it.
    let haDbList: string | Error;
    // What the node-wide ha_start brings up (the engine decides).
    let haStartBringsUp: string[];
    const calls = () => cmsClient.postAuthenticated.mock.calls.map(([, body]) => body as { task: string; dbname?: string });
    const haTasks = () => calls().filter((c) => c.task.startsWith('ha_'));
    beforeEach(() => {
      running = new Set(['db1']);
      conf = ['[common]', 'ha_mode=on', '[service]', 'service=server,broker', 'server=db1'];
      haDbList = 'hadb1,hadb2';
      haStartBringsUp = ['hadb1', 'hadb2'];
      jest.spyOn(databaseInfoService, 'startInfo').mockImplementation(async () => ({
        dblist: { dbs: ['hadb1', 'hadb2', 'db1'].map((dbname) => ({ dbname })) },
        activelist: { active: [...running].map((dbname) => ({ dbname })) },
      }) as any);
      cmsConfigService.getAllSystemParam.mockImplementation(async (_u: string, _h: string, confname: string) => {
        if (confname !== CMS_CONFNAME_HACONF) return { conflist: [{ confdata: conf }] } as any;
        if (haDbList instanceof Error) throw haDbList;
        return { conflist: [{ confdata: ['[common]', `ha_db_list=${haDbList}`] }] } as any;
      });
      databaseUserService.ensureDbLogin.mockImplementation(async (_u: string, _h: string, dbname: string) => {
        if (dbname.startsWith('hadb')) throw new Error('no login');
      });
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => {
        const { task, dbname } = body as { task: string; dbname?: string };
        if (task === 'ha_stop') ['hadb1', 'hadb2'].forEach((d) => running.delete(d));
        if (task === 'ha_start') haStartBringsUp.forEach((d) => running.add(d));
        if (task === 'stopdb') running.delete(dbname as string);
        if (task === 'startdb') running.add(dbname as string);
        return { status: 'success', task } as any;
      });
    });

    it('starts the HA databases with one ha_start without a dbname, logged in or not', async () => {
      const result = await service.startWholeService(mockUserId, mockHostUid);

      expect(haTasks()).toHaveLength(1);
      expect(haTasks()[0]).toEqual(expect.objectContaining({ task: 'ha_start' }));
      expect(haTasks()[0]).not.toHaveProperty('dbname');
      expect([...running].sort()).toEqual(['db1', 'hadb1', 'hadb2']);
      expect(result).toEqual({ failed: [], skipped: [] });
    });

    it('stops the HA databases with one ha_stop without a dbname, logged in or not', async () => {
      running = new Set(['db1', 'hadb1', 'hadb2']);
      databaseUserService.ensureDbLogin.mockResolvedValue(undefined as any);

      const result = await service.stopWholeService(mockUserId, mockHostUid);

      expect(haTasks().map((c) => c.task)).toEqual(['ha_stop']);
      expect(haTasks()[0]).not.toHaveProperty('dbname');
      expect(calls().filter((c) => c.task === 'stopdb').map((c) => c.dbname)).toEqual(['db1']);
      expect(result).toEqual({ failed: [], skipped: [] });
    });

    it('sends the node-wide ha_start even when service= has no server, but starts no non-HA database', async () => {
      conf = ['[common]', 'ha_mode=on', '[service]', 'service=broker', 'server=db1'];
      running = new Set();

      const result = await service.startWholeService(mockUserId, mockHostUid);

      expect(haTasks().map((c) => c.task)).toEqual(['ha_start']);
      expect(calls().filter((c) => c.task === 'startdb')).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('restarts with one ha_stop and one ha_start when service= has no server, leaving the non-HA database stopped', async () => {
      conf = ['[common]', 'ha_mode=on', '[service]', 'service=broker', 'server=db1'];
      running = new Set(['db1', 'hadb1', 'hadb2']);
      databaseUserService.ensureDbLogin.mockResolvedValue(undefined as any);

      const result = await service.restartWholeService(mockUserId, mockHostUid);

      expect(haTasks().map((c) => c.task)).toEqual(['ha_stop', 'ha_start']);
      haTasks().forEach((c) => expect(c).not.toHaveProperty('dbname'));
      expect(result.startFailed).toEqual([]);
      expect(result.leftStopped).toEqual(['db1']);
    });

    it('sends no node-wide ha_* when ha_mode is off, and treats the listed databases as plain ones', async () => {
      conf = ['[common]', 'ha_mode=off', '[service]', 'service=server,broker', 'server=db1,hadb1'];
      databaseUserService.ensureDbLogin.mockResolvedValue(undefined as any);

      await service.startWholeService(mockUserId, mockHostUid);

      expect(haTasks()).toEqual([]);
      expect(calls().filter((c) => c.task === 'startdb').map((c) => c.dbname)).toEqual(['hadb1']);
    });

    const notChecked = (action: 'start' | 'stop', reason: string, why: string) => ({
      name: HA_NODE_STEP,
      code: `HA_${action.toUpperCase()}_NOT_CHECKED`,
      type: `/errors/database/ha_${action}_not_checked`,
      reason,
      error: `Could not check the HA ${action}, since ${why}`,
    });

    it('sends the node-wide ha_stop and ha_start even when ha_db_list is empty, and says the outcome was not checked', async () => {
      haDbList = '';
      running = new Set(['db1', 'hadb1']);
      databaseUserService.ensureDbLogin.mockResolvedValue(undefined as any);

      const stopped = await service.stopWholeService(mockUserId, mockHostUid);
      const started = await service.startWholeService(mockUserId, mockHostUid);

      expect(haTasks().map((c) => c.task)).toEqual(['ha_stop', 'ha_start']);
      haTasks().forEach((c) => expect(c).not.toHaveProperty('dbname'));
      expect(stopped.failed).toEqual([notChecked('stop', 'HA_DB_LIST_EMPTY', 'ha_db_list in cubrid_ha.conf is empty')]);
      expect(started.failed).toEqual([notChecked('start', 'HA_DB_LIST_EMPTY', 'ha_db_list in cubrid_ha.conf is empty')]);
    });

    it('sends the node-wide ha_start when cubrid_ha.conf cannot be read, still starts the autostart list, and says why it was not checked', async () => {
      haDbList = CmsError.RequestFailed({ message: 'cannot open cubrid_ha.conf' });
      running = new Set();

      const result = await service.startWholeService(mockUserId, mockHostUid);

      expect(haTasks().map((c) => c.task)).toEqual(['ha_start']);
      expect(haTasks()[0]).not.toHaveProperty('dbname');
      expect(calls().filter((c) => c.task === 'startdb').map((c) => c.dbname)).toEqual(['db1']);
      expect(result.failed).toEqual([{
        ...notChecked('start', 'HA_DB_LIST_UNREADABLE', 'cubrid_ha.conf could not be read: cannot open cubrid_ha.conf'),
        haConfFailure: { code: 'REQUEST_FAILED', type: '/errors/cms/request_failed', error: 'cannot open cubrid_ha.conf' },
      }]);
    });

    it('carries the failed request with the not-checked code when an empty ha_db_list makes heartbeat fail', async () => {
      haDbList = '';
      running = new Set();
      const base = cmsClient.postAuthenticated.getMockImplementation()!;
      cmsClient.postAuthenticated.mockImplementation(async (url, body) =>
        (body as { task: string }).task === 'ha_start'
          ? ({ status: 'failure', task: 'ha_start', note: 'heartbeat start: fail' } as any)
          : base(url, body)
      );

      const result = await service.startWholeService(mockUserId, mockHostUid);

      expect(haTasks().map((c) => c.task)).toEqual(['ha_start']);
      expect(result.failed).toEqual([{
        ...notChecked('start', 'HA_DB_LIST_EMPTY', 'ha_db_list in cubrid_ha.conf is empty'),
        error: expect.stringMatching(/^Could not check the HA start, since ha_db_list in cubrid_ha\.conf is empty \(.+\)$/),
        sendFailure: expect.objectContaining({ cmsTask: 'ha_start', cmsNote: 'heartbeat start: fail' }),
      }]);
    });

    it('reports a stop without the ha_db_list names as done only when nothing is running afterwards', async () => {
      haDbList = '';
      running = new Set(['hadb1']);
      databaseUserService.ensureDbLogin.mockResolvedValue(undefined as any);

      const result = await service.stopWholeService(mockUserId, mockHostUid);

      expect(haTasks().map((c) => c.task)).toEqual(['ha_stop']);
      expect(result.failed).toEqual([]);
    });

    it('splits ha_db_list and server= on spaces, commas and colons, as the engine does', async () => {
      haDbList = 'hadb1 hadb2';
      conf = ['[common]', 'ha_mode=on', '[service]', 'service=server broker', 'server=db1:db2'];
      running = new Set();
      databaseUserService.ensureDbLogin.mockResolvedValue(undefined as any);

      const result = await service.startWholeService(mockUserId, mockHostUid);

      expect(haTasks().map((c) => c.task)).toEqual(['ha_start']);
      expect(calls().filter((c) => c.task === 'startdb').map((c) => c.dbname).sort()).toEqual(['db1', 'db2']);
      expect(result.failed).toEqual([]);
    });

    it('treats an ha_db_list database as a plain one when ha_mode is off: one database, Start All and the selected ones', async () => {
      conf = ['[common]', 'ha_mode=off', '[service]', 'service=server,broker', 'server=db1'];
      running = new Set();
      databaseUserService.ensureDbLogin.mockResolvedValue(undefined as any);

      await service.startDatabase(mockUserId, mockHostUid, 'hadb1');
      await service.stopAllDatabases(mockUserId, mockHostUid, ['hadb1']);
      await service.runSelectedDatabasesAction(mockUserId, mockHostUid, 'start', ['hadb2']);

      expect(haTasks()).toEqual([]);
      expect(calls().filter((c) => c.task === 'startdb' || c.task === 'stopdb').map((c) => `${c.task} ${c.dbname}`)).toEqual([
        'startdb hadb1',
        'stopdb hadb1',
        'startdb hadb2',
      ]);
    });

    it('reports a start as failed, naming the HA databases still off, even when CMS answered success', async () => {
      haStartBringsUp = ['hadb1'];

      const result = await service.startWholeService(mockUserId, mockHostUid);

      expect(result.failed).toEqual([{
        name: HA_NODE_STEP,
        error: 'Not running after the HA start: hadb2',
        code: 'HA_NOT_RUNNING_AFTER_START',
        type: '/errors/database/ha_not_running_after_start',
        dbnames: ['hadb2'],
      }]);
    });

    it('reports a stop as done when no HA database is running afterwards, even if CMS failed (no cub_master left)', async () => {
      running = new Set(['db1']);
      databaseUserService.ensureDbLogin.mockResolvedValue(undefined as any);
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => {
        const { task, dbname } = body as { task: string; dbname?: string };
        if (task === 'ha_stop') throw new Error('master not running');
        if (task === 'stopdb') running.delete(dbname as string);
        return { status: 'success', task } as any;
      });

      const result = await service.stopWholeService(mockUserId, mockHostUid);

      expect(result.failed).toEqual([]);
    });

    it('reports a stop as failed when an HA database is still running afterwards', async () => {
      running = new Set(['hadb1', 'hadb2']);
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => {
        if ((body as { task: string }).task === 'ha_stop') running.delete('hadb1');
        return { status: 'success', task: (body as { task: string }).task } as any;
      });

      const result = await service.stopWholeService(mockUserId, mockHostUid);

      expect(result.failed).toEqual([{
        name: HA_NODE_STEP,
        error: 'Still running after the HA stop: hadb2',
        code: 'HA_STILL_RUNNING_AFTER_STOP',
        type: '/errors/database/ha_still_running_after_stop',
        dbnames: ['hadb2'],
      }]);
    });

    it('reports a start as not confirmed when the running list cannot be read afterwards', async () => {
      const base = (databaseInfoService.startInfo as jest.Mock).getMockImplementation()!;
      (databaseInfoService.startInfo as jest.Mock).mockImplementation(async (...args: unknown[]) => {
        if (haTasks().length > 0) throw new Error('status unavailable');
        return base(...args);
      });

      const result = await service.startWholeService(mockUserId, mockHostUid);

      expect(result.failed).toEqual([{
        name: HA_NODE_STEP,
        error: 'Could not check whether the HA databases started: status unavailable',
        code: 'HA_START_NOT_CHECKED',
        type: '/errors/database/ha_start_not_checked',
        readFailure: { error: 'status unavailable' },
      }]);
    });

    it('does not fail a stop that CMS accepted when the running list cannot be read afterwards', async () => {
      running = new Set(['hadb1', 'hadb2']);
      const base = (databaseInfoService.startInfo as jest.Mock).getMockImplementation()!;
      (databaseInfoService.startInfo as jest.Mock).mockImplementation(async (...args: unknown[]) => {
        if (haTasks().length > 0) throw new Error('status unavailable');
        return base(...args);
      });

      const result = await service.stopWholeService(mockUserId, mockHostUid);

      expect(result.failed).toEqual([]);
    });

    it('holds the HA databases during the restart, so a single HA start in between is refused', async () => {
      const mockBrokerService = (service as any).brokerService;
      let midway: unknown;
      mockBrokerService.startAllBrokers.mockImplementation(async () => {
        midway = await service.startDatabase(mockUserId, mockHostUid, 'hadb2').catch((e) => e);
        return { success: true };
      });

      await service.restartWholeService(mockUserId, mockHostUid);

      expect((midway as DatabaseError).code).toBe(DatabaseErrorCode.DATABASE_ACTION_IN_PROGRESS);
    });

    it('still sends ha_start and ha_stop with a dbname from Start All and Stop All', async () => {
      databaseUserService.ensureDbLogin.mockResolvedValue(undefined as any);
      running = new Set(['hadb1']);

      await service.stopAllDatabases(mockUserId, mockHostUid, []);
      await service.startAllDatabases(mockUserId, mockHostUid, []);

      expect(haTasks()).toEqual([
        expect.objectContaining({ task: 'ha_stop', dbname: 'hadb1' }),
        expect.objectContaining({ task: 'ha_start', dbname: 'hadb1' }),
        expect.objectContaining({ task: 'ha_start', dbname: 'hadb2' }),
      ]);
    });
  });

  describe('restartWholeService', () => {
    // 'auto' is in the autostart list, 'manual' was started by hand, 'off' is stopped.
    let running: Set<string>;
    const tasksOf = (task: string) =>
      cmsClient.postAuthenticated.mock.calls.filter(([, body]) => body.task === task).map(([, body]) => (body as { dbname?: string }).dbname);
    beforeEach(() => {
      running = new Set(['auto', 'manual']);
      jest.spyOn(databaseInfoService, 'startInfo').mockImplementation(async () => ({
        dblist: { dbs: ['auto', 'manual', 'off'].map((dbname) => ({ dbname })) },
        activelist: { active: [...running].map((dbname) => ({ dbname })) },
      }) as any);
      jest.spyOn(databaseInfoService as any, 'getHaDbNames').mockResolvedValue(new Set());
      cmsConfigService.getAllSystemParam.mockResolvedValue({
        conflist: [{ confdata: ['[service]', 'service=server,broker', 'server=auto'] }],
      } as any);
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => {
        const dbname = (body as { dbname?: string }).dbname as string;
        if (body.task === 'stopdb') running.delete(dbname);
        if (body.task === 'startdb') running.add(dbname);
        return { status: 'success', task: body.task } as any;
      });
    });

    it('stops, then starts only the autostart list; a database started by hand stays stopped and is reported', async () => {
      const result = await service.restartWholeService(mockUserId, mockHostUid);

      expect(tasksOf('stopdb').sort()).toEqual(['auto', 'manual']);
      expect(tasksOf('startdb')).toEqual(['auto']);
      expect([...running].sort()).toEqual(['auto']);
      expect(result).toEqual({ stopFailed: [], startFailed: [], skipped: [], leftStopped: ['manual'] });
    });

    it('leaves a running database the user is not logged in to running, and reports it skipped, not as left stopped', async () => {
      databaseUserService.ensureDbLogin.mockImplementation(async (_u: string, _h: string, dbname: string) => {
        if (dbname === 'manual') throw ValidationError.MissingDBCredentials(dbname, ['id', 'password'], { reason: 'notLoggedIn' });
      });

      const result = await service.restartWholeService(mockUserId, mockHostUid);

      expect(tasksOf('stopdb')).toEqual(['auto']);
      expect(tasksOf('startdb')).toEqual(['auto']);
      expect([...running].sort()).toEqual(['auto', 'manual']);
      expect(result).toEqual({
        stopFailed: [],
        startFailed: [],
        skipped: [{ name: 'manual', reason: 'Not logged in', phase: 'stop' }],
        leftStopped: [],
      });
    });

    it('stops a running database that dblist leaves out, and reports it left stopped when not in the autostart list', async () => {
      running.add('unlisted');

      const result = await service.restartWholeService(mockUserId, mockHostUid);

      expect(tasksOf('stopdb').sort()).toEqual(['auto', 'manual', 'unlisted']);
      expect(tasksOf('startdb')).toEqual(['auto']);
      expect(result.leftStopped.sort()).toEqual(['manual', 'unlisted']);
    });

    it('does not report as left stopped a database whose start failed', async () => {
      cmsConfigService.getAllSystemParam.mockResolvedValue({
        conflist: [{ confdata: ['[service]', 'service=server,broker', 'server=auto,manual'] }],
      } as any);
      cmsClient.postAuthenticated.mockImplementation(async (_url, body) => {
        const dbname = (body as { dbname?: string }).dbname as string;
        if (body.task === 'stopdb') running.delete(dbname);
        if (body.task === 'startdb' && dbname === 'manual') throw new Error('start: fail');
        if (body.task === 'startdb') running.add(dbname);
        return { status: 'success', task: body.task } as any;
      });

      const result = await service.restartWholeService(mockUserId, mockHostUid);

      expect(result.startFailed).toEqual([expect.objectContaining({ name: 'manual' })]);
      expect(result.leftStopped).toEqual([]);
    });

    it('reports nothing left stopped when the status cannot be read after the start', async () => {
      // Every read after the service start fails.
      const base = (databaseInfoService.startInfo as jest.Mock).getMockImplementation()!;
      (databaseInfoService.startInfo as jest.Mock).mockImplementation(async (...args: unknown[]) => {
        if (tasksOf('startdb').length > 0) throw new Error('status unavailable');
        return base(...args);
      });

      const result = await service.restartWholeService(mockUserId, mockHostUid);

      expect(result.leftStopped).toEqual([]);
      expect(tasksOf('startdb')).toEqual(['auto']);
    });

    it('holds the databases for the whole sequence, so a single start in between is refused', async () => {
      const mockBrokerService = (service as any).brokerService;
      let midway: unknown;
      mockBrokerService.startAllBrokers.mockImplementation(async () => {
        midway = await service.startDatabase(mockUserId, mockHostUid, 'off').catch((e) => e);
        return { success: true };
      });

      await service.restartWholeService(mockUserId, mockHostUid);

      expect(midway).toBeInstanceOf(DatabaseError);
      expect((midway as DatabaseError).code).toBe(DatabaseErrorCode.DATABASE_ACTION_IN_PROGRESS);
      expect(tasksOf('startdb')).not.toContain('off');
    });

    it('stops nothing when it cannot read which databases are running', async () => {
      let reads = 0;
      (databaseInfoService.startInfo as jest.Mock).mockImplementation(async () => {
        if (++reads > 1) throw new Error('status unavailable');
        return { dblist: { dbs: [{ dbname: 'auto' }] }, activelist: { active: [{ dbname: 'auto' }] } };
      });
      const mockBrokerService = (service as any).brokerService;

      await expect(service.restartWholeService(mockUserId, mockHostUid)).rejects.toThrow();
      expect(mockBrokerService.stopAllBrokers).not.toHaveBeenCalled();
      expect(tasksOf('stopdb')).toEqual([]);
    });

    it('still starts the service when the stop reported failures, and reports both', async () => {
      const mockBrokerService = (service as any).brokerService;
      mockBrokerService.stopAllBrokers.mockRejectedValueOnce(new Error('broker stop: fail'));

      const result = await service.restartWholeService(mockUserId, mockHostUid);

      expect(result.stopFailed).toEqual([{ name: 'brokers', error: 'broker stop: fail' }]);
      expect(mockBrokerService.startAllBrokers).toHaveBeenCalled();
      expect(result.startFailed).toEqual([]);
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

    // CMS lists in dblist only the databases.txt entries whose host field
    // matches; a running database missing from it still has volumes to read.
    it('reads a running database that is missing from dblist', async () => {
      cmsClient.postAuthenticated
        .mockResolvedValueOnce({
          __EXEC_TIME: '10 ms',
          note: 'none',
          status: 'success',
          task: 'startinfo',
          dblist: [{ dbs: [{ dbname: 'otherdb' }] }],
          activelist: [{ active: [{ dbname: mockDbname }] }],
        })
        .mockResolvedValueOnce(mockDbSpaceInfoResponse);

      const result = await service.getDBSpaceInfo(mockUserId, mockHostUid, mockDbname);

      expect(cmsClient.postAuthenticated).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ task: 'dbspaceinfo', dbname: mockDbname })
      );
      expect(result).toEqual(expect.objectContaining({ dbname: 'testdb', freespace: '1048576' }));
    });

    it('still rejects a database that is neither listed nor running', async () => {
      cmsClient.postAuthenticated.mockResolvedValueOnce({
        __EXEC_TIME: '10 ms',
        note: 'none',
        status: 'success',
        task: 'startinfo',
        dblist: [{ dbs: [{ dbname: 'otherdb' }] }],
        activelist: [{ active: [{ dbname: 'otherdb' }] }],
      });

      await expect(service.getDBSpaceInfo(mockUserId, mockHostUid, mockDbname)).rejects.toMatchObject({ code: 'NO_SUCH_DATABASE' });
      expect(cmsClient.postAuthenticated).toHaveBeenCalledTimes(1);
    });

    // The host volume table reads every logged-in database at once; their
    // existence checks share one startinfo instead of sending one each.
    it('shares the startinfo check between volume reads sent together', async () => {
      cmsClient.postAuthenticated
        .mockResolvedValueOnce({
          __EXEC_TIME: '10 ms',
          note: 'none',
          status: 'success',
          task: 'startinfo',
          dblist: [{ dbs: [{ dbname: mockDbname }, { dbname: 'otherdb' }] }],
          activelist: [{ active: [] }],
        })
        .mockResolvedValue(mockDbSpaceInfoResponse);

      await Promise.all([
        service.getDBSpaceInfo(mockUserId, mockHostUid, mockDbname),
        service.getDBSpaceInfo(mockUserId, mockHostUid, 'otherdb'),
      ]);

      const tasks = cmsClient.postAuthenticated.mock.calls.map(([, body]) => (body as { task: string }).task);
      expect(tasks).toEqual(['startinfo', 'dbspaceinfo', 'dbspaceinfo']);
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

    it('starts the database without OPERATION_IN_PROGRESS even while this same job still holds the host lock', async () => {
      // createDatabase() runs entirely inside its own CmsJobService job, which
      // registers this host as "active" before the job body runs and only
      // releases it once the job finishes. If the internal start-after-create
      // step called the public startDatabase() (which itself calls
      // assertNoActiveJob()), it would see that same still-running job and
      // always fail with OPERATION_IN_PROGRESS. Simulate that by having the
      // lock service report an active job for this host throughout.
      cmsJobLockService.hasActiveJobForHost.mockResolvedValue({
        jobId: 'self-job',
        dbname: 'testdb',
      });
      cmsJobLockService.activeJobDatabasesForHost.mockResolvedValue(new Map([['testdb', 'self-job']]));

      const request = {
        ...mockCreateDbRequest,
        setAutoStart: true,
      };

      const result = await service.createDatabase(mockUserId, mockHostUid, request);

      expect(result.startDatabase).toEqual({
        success: true,
        data: mockStartInfoForCreate,
      });
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'startdb',
          dbname: request.dbname,
          async: 'yes',
        }),
        expect.anything()
      );
    });

    it('starts the database via a direct startdb call, without needing a stored login profile', async () => {
      // A database this job just created can never have a stored db-login
      // profile yet (nothing has logged into it before), so going through
      // startNonHaDatabase()'s ensureDbLogin() gate would always throw
      // MissingDBCredentials. startdb itself needs no db user credentials
      // (see ensureDbLogin's own comment), so createDatabase() must send it
      // directly rather than satisfying that gate indirectly. Prove it by
      // making ensureDbLogin fail exactly as it would for a brand-new
      // database, and confirming the start step never calls it at all.
      databaseUserService.ensureDbLogin.mockRejectedValue(
        ValidationError.MissingDBCredentials('testdb', ['id', 'password'])
      );

      const request = {
        ...mockCreateDbRequest,
        setAutoStart: true,
      };

      const result = await service.createDatabase(mockUserId, mockHostUid, request);

      expect(databaseUserService.ensureDbLogin).not.toHaveBeenCalled();
      expect(result.startDatabase).toEqual({
        success: true,
        data: mockStartInfoForCreate,
      });
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'startdb',
          dbname: request.dbname,
          async: 'yes',
        }),
        expect.anything()
      );
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
          // The API's message for the error, not its bare code.
          message: 'A database operation failed.',
          code: DatabaseErrorCode.UNKNOWN,
          type: '/errors/database/unknown',
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
          // The API's message for the error, not its bare code.
          message: 'A database operation failed.',
          code: DatabaseErrorCode.UNKNOWN,
          type: '/errors/database/unknown',
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
          // The API's message for the error, not its bare code.
          message: 'A database operation failed.',
          code: DatabaseErrorCode.UNKNOWN,
          type: '/errors/database/unknown',
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
    it('rejects an oversized general volume before contacting CMS', async () => {
      const request = {
        dbname: 'testdb',
        numpage: '1310721',
        pagesize: '16384',
        logsize: '512',
        logpagesize: '16384',
        genvolpath: '/path/to/testdb',
        logvolpath: '/path/to/testdb',
        charset: 'en_US.utf8',
        overwrite_config_file: 'YES' as const,
      };

      await expect(
        service.createDatabaseInternal(mockUserId, mockHostUid, request)
      ).rejects.toMatchObject({ code: DatabaseErrorCode.INVALID_VOLUME_SIZE });

      expect(hostService.findHostInternal).not.toHaveBeenCalled();
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

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

  describe('createDatabaseInternal extra volume validation message', () => {
    it('surfaces the specific volume cause instead of the generic volume message', async () => {
      (fileService as any).checkfileInternal = jest.fn().mockResolvedValue({
        existfile: undefined,
      });

      const request = {
        dbname: 'testdb',
        numpage: '32768',
        pagesize: '16384',
        logsize: '512',
        logpagesize: '16384',
        genvolpath: '/path/to/testdb',
        logvolpath: '/path/to/testdb',
        charset: 'en_US.utf8',
        overwrite_config_file: 'YES' as const,
        exvol: [
          {
            testdb_data_x001: {
              type: 'data',
              size: 0,
              pagesize: 16384,
              volpath: '/path/to/testdb',
            },
          },
        ],
      };

      const error = await service
        .createDatabaseInternal(mockUserId, mockHostUid, request as any)
        .catch((e) => e);

      expect(error).toMatchObject({ code: DatabaseErrorCode.CONVERT_VOLUME_FAILED });
      expect(error.toProblemDetails().detail).toBe(
        'Volume "testdb_data_x001": Volume size and pagesize must be positive numbers'
      );
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });
  });

  describe('createDatabaseInternal no longer owns HA mode config', () => {
    const mockRequest = {
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

    beforeEach(() => {
      (fileService as any).checkfileInternal = jest.fn().mockResolvedValue({
        existfile: undefined,
      });
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'none',
        status: 'success',
        task: 'createdb',
      });
    });

    it('never calls ensureDbHaModeOff itself, even on an HA-configured host (moved to createDatabase orchestration)', async () => {
      cmsConfigService.getAllSystemParam.mockResolvedValue({
        conflist: [{ confdata: ['[common]', 'ha_mode=on'] }],
      } as never);

      await expect(
        service.createDatabaseInternal(mockUserId, mockHostUid, mockRequest as any)
      ).resolves.toEqual({ success: true });

      expect(databaseConfigService.ensureDbHaModeOff).not.toHaveBeenCalled();
    });
  });

  describe('createDatabase HA mode config (ensureDbHaModeOff)', () => {
    const mockRequest = {
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

    beforeEach(() => {
      jest.spyOn(service, 'createDatabaseInternal').mockResolvedValue({ success: true });
    });

    it('auto-configures ha_mode=off for the new db after createdb succeeds', async () => {
      cmsConfigService.getAllSystemParam.mockResolvedValue({
        conflist: [{ confdata: ['[common]', 'ha_mode=on'] }],
      } as never);

      const result = await service.createDatabase(mockUserId, mockHostUid, mockRequest as any);

      expect(databaseConfigService.ensureDbHaModeOff).toHaveBeenCalledWith(
        mockUserId,
        mockHostUid,
        'testdb'
      );
      expect(result.createDatabase).toEqual({ success: true, data: { success: true } });
      expect(result.haModeConfig).toEqual({ success: true });
    });

    it('does not call ensureDbHaModeOff when the host is not HA-configured', async () => {
      cmsConfigService.getAllSystemParam.mockResolvedValue({
        conflist: [{ confdata: ['[common]', 'ha_mode=off'] }],
      } as never);

      const result = await service.createDatabase(mockUserId, mockHostUid, mockRequest as any);

      expect(databaseConfigService.ensureDbHaModeOff).not.toHaveBeenCalled();
      expect(result.haModeConfig).toBeUndefined();
    });

    it('calls ensureDbHaModeOff only after createDatabaseInternal (createdb) resolves, not before', async () => {
      cmsConfigService.getAllSystemParam.mockResolvedValue({
        conflist: [{ confdata: ['[common]', 'ha_mode=on'] }],
      } as never);

      const callOrder: string[] = [];
      (service.createDatabaseInternal as jest.Mock).mockImplementation(async () => {
        callOrder.push('createdb');
        return { success: true };
      });
      databaseConfigService.ensureDbHaModeOff.mockImplementation(async () => {
        callOrder.push('ensureDbHaModeOff');
      });

      await service.createDatabase(mockUserId, mockHostUid, mockRequest as any);

      expect(callOrder).toEqual(['createdb', 'ensureDbHaModeOff']);
    });

    it('does not call ensureDbHaModeOff when createdb fails for a name that already exists (createDatabase rejects before reaching the HA step)', async () => {
      cmsConfigService.getAllSystemParam.mockResolvedValue({
        conflist: [{ confdata: ['[common]', 'ha_mode=on'] }],
      } as never);

      // CMS rejects createdb (e.g. dbname already exists) instead of succeeding.
      const createError = DatabaseError.Unknown();
      jest.spyOn(service, 'createDatabaseInternal').mockRejectedValue(createError);

      await expect(
        service.createDatabase(mockUserId, mockHostUid, mockRequest as any)
      ).rejects.toThrow(createError);

      // The create failed, so the per-database HA override must never have
      // been written — no stray ha_mode=off left on an untouched database.
      expect(databaseConfigService.ensureDbHaModeOff).not.toHaveBeenCalled();
    });

    // Regression test for RND-2855 follow-up P1: a failure in ensureDbHaModeOff
    // happens strictly AFTER createdb has already succeeded (createDatabaseInternal
    // already returned). It must not be mistaken for a createdb failure — the
    // database genuinely exists, so createDatabase.success must stay true, and
    // the HA-step failure is recorded on its own independent response field.
    it('records haModeConfig failure but still reports createDatabase success when ensureDbHaModeOff fails after createdb succeeds', async () => {
      cmsConfigService.getAllSystemParam.mockResolvedValue({
        conflist: [{ confdata: ['[common]', 'ha_mode=on'] }],
      } as never);
      const haError = new Error('cms config write failed');
      databaseConfigService.ensureDbHaModeOff.mockRejectedValue(haError);

      const result = await service.createDatabase(mockUserId, mockHostUid, mockRequest as any);

      expect(result.createDatabase).toEqual({ success: true, data: { success: true } });
      expect(result.haModeConfig).toEqual({
        success: false,
        error: expect.objectContaining({ message: 'cms config write failed' }),
      });
    });
  });

  describe('deleteDatabaseCmsResponse', () => {
    const mockSuccessResponse: DeleteDatabaseCmsResponse = {
      __EXEC_TIME: '848 ms',
      note: 'none',
      status: 'success',
      task: 'deletedb',
    };

    it('sends deletedb with delbackup "y" as an async CMS task and returns its response', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      const onUuid = jest.fn();

      const result = await service.deleteDatabaseCmsResponse(mockUserId, mockHostUid, mockDbname, { delbackup: 'y' }, onUuid);

      expect(databaseUserService.ensureDbLogin).toHaveBeenCalledWith(mockUserId, mockHostUid, mockDbname);
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
      expect(result).toEqual(mockSuccessResponse);
    });

    it('sends delbackup "n"', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      await service.deleteDatabaseCmsResponse(mockUserId, mockHostUid, mockDbname, { delbackup: 'n' });

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ task: 'deletedb', delbackup: 'n' }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
    });

    it('does not clean up anything itself (the job does that after success)', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      await service.deleteDatabaseCmsResponse(mockUserId, mockHostUid, mockDbname, { delbackup: 'y' });

      expect(databaseUserService.deleteDbProfile).not.toHaveBeenCalled();
      expect(databaseConfigService.forgetDatabaseAfterDelete).not.toHaveBeenCalled();
    });

    it('returns a CMS "fail" response as is, for the job to report', async () => {
      const failed = { __EXEC_TIME: '0 ms', note: 'operation failed', status: 'fail', task: 'deletedb' } as any;
      cmsClient.postAuthenticated.mockResolvedValue(failed);

      await expect(
        service.deleteDatabaseCmsResponse(mockUserId, mockHostUid, mockDbname, { delbackup: 'y' })
      ).resolves.toEqual(failed);
    });

    it('throws HostError if host is not found', async () => {
      cmsConfigService.getAllSystemParam.mockRejectedValue(HostError.NoSuchHost({ hostUid: mockHostUid }));

      await expect(
        service.deleteDatabaseCmsResponse(mockUserId, mockHostUid, mockDbname, { delbackup: 'y' })
      ).rejects.toThrow(HostError);
    });

    it('throws DatabaseError when host is HA (deletedb blocked)', async () => {
      cmsConfigService.getAllSystemParam.mockResolvedValue({
        conflist: [{ confdata: ['[common]', 'ha_mode=ON'] }],
      } as any);

      await expect(
        service.deleteDatabaseCmsResponse(mockUserId, mockHostUid, mockDbname, { delbackup: 'y' })
      ).rejects.toThrow(DatabaseError);

      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('allows deletion on an HA host when this database has its own [@dbname] ha_mode=off override', async () => {
      // This is exactly the state createDatabaseInternal's ensureDbHaModeOff
      // leaves behind for a one-off, non-replicated database created on an
      // HA host — it must remain deletable even though the host is HA.
      cmsConfigService.getAllSystemParam.mockResolvedValue({
        conflist: [{ confdata: ['[common]', 'ha_mode=on', `[@${mockDbname}]`, 'ha_mode=off'] }],
      } as any);
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      await service.deleteDatabaseCmsResponse(mockUserId, mockHostUid, mockDbname, { delbackup: 'y' });

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ task: 'deletedb', dbname: mockDbname }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
    });

    it('still blocks deletion on an HA host for a different database without the per-db override', async () => {
      cmsConfigService.getAllSystemParam.mockResolvedValue({
        conflist: [{ confdata: ['[common]', 'ha_mode=on', '[@some_other_db]', 'ha_mode=off'] }],
      } as any);

      await expect(
        service.deleteDatabaseCmsResponse(mockUserId, mockHostUid, mockDbname, { delbackup: 'y' })
      ).rejects.toThrow(DatabaseError);

      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('throws CmsError if the CMS request fails', async () => {
      cmsClient.postAuthenticated.mockRejectedValue(CmsError.RequestFailed({ message: 'CMS request failed' }));

      await expect(
        service.deleteDatabaseCmsResponse(mockUserId, mockHostUid, mockDbname, { delbackup: 'y' })
      ).rejects.toThrow(CmsError);
    });
  });

  describe('forgetDeletedDatabase', () => {
    it('clears the stored login profile + dbmt-login cache and removes the database from cubrid.conf', async () => {
      await expect(service.forgetDeletedDatabase(mockUserId, mockHostUid, mockDbname)).resolves.toEqual([]);

      expect(databaseUserService.deleteDbProfile).toHaveBeenCalledWith(mockUserId, mockHostUid, mockDbname);
      expect(databaseConfigService.forgetDatabaseAfterDelete).toHaveBeenCalledWith(mockUserId, mockHostUid, mockDbname);
    });

    it('does not throw when either cleanup fails, and still tries the other', async () => {
      databaseUserService.deleteDbProfile.mockRejectedValueOnce(new Error('disk write failed'));
      databaseConfigService.forgetDatabaseAfterDelete.mockRejectedValueOnce(new Error('setsysparam failed'));

      await expect(service.forgetDeletedDatabase(mockUserId, mockHostUid, mockDbname)).resolves.toHaveLength(2);
      expect(databaseConfigService.forgetDatabaseAfterDelete).toHaveBeenCalled();
    });
  });
});
