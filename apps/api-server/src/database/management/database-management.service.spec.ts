import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseManagementService } from './database-management.service';
import { HostService } from '@host';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { DatabaseInfoService } from '@database/info/database-info.service';
import { DatabaseUserService } from '@database/user/database-user.service';
import { DatabaseError } from '@error/database/database-error';
import { HostError } from '@error/index';
import { CmsError } from '@error/cms/cms-error';
import {
  UnloadDatabaseRequest,
  LoadDatabaseRequest,
  CheckDatabaseRequest,
  CompactDatabaseRequest,
  RenameDatabaseRequest,
  LockDatabaseRequest,
  GetTransactionInfoRequest,
  KillTransactionRequest,
} from '@api-interfaces';
import {
  UnloadDatabaseCmsResponse,
  LoadDatabaseCmsResponse,
  CheckDatabaseCmsResponse,
  CompactDatabaseCmsResponse,
  RenameDatabaseCmsResponse,
  LockDatabaseCmsResponse,
  GetTransactionInfoCmsResponse,
  KillTransactionCmsResponse,
} from '@type/cms-response';


describe('DatabaseManagementService', () => {
  let service: DatabaseManagementService;
  let hostService: jest.Mocked<HostService>;
  let cmsClient: jest.Mocked<CmsHttpsClientService>;

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
  const mockStartInfoResponse = { activelist: { active: [] }, dblist: { dbs: [] } };

  beforeEach(async () => {
    const mockHostService = {
      findHostInternal: jest.fn(),
    };

    const mockCmsClient = {
      postAuthenticated: jest.fn(),
    };

    const mockDatabaseInfoService = {
      startInfo: jest.fn().mockResolvedValue(mockStartInfoResponse),
      effectiveHaDbForDbname: jest.fn().mockResolvedValue(false),
    };

    const mockDatabaseUserService = {
      loginDatabase: jest.fn().mockResolvedValue(true),
      ensureDbLogin: jest.fn().mockResolvedValue({ reauthenticated: false }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseManagementService,
        {
          provide: HostService,
          useValue: mockHostService,
        },
        {
          provide: CmsHttpsClientService,
          useValue: mockCmsClient,
        },
        {
          provide: DatabaseInfoService,
          useValue: mockDatabaseInfoService,
        },
        {
          provide: DatabaseUserService,
          useValue: mockDatabaseUserService,
        },
      ],
    }).compile();

    service = module.get<DatabaseManagementService>(DatabaseManagementService);
    hostService = module.get(HostService);
    cmsClient = module.get(CmsHttpsClientService);

    // Setup default mocks
    hostService.findHostInternal.mockResolvedValue(mockHost);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('unloadDatabase', () => {
    const baseRequest: UnloadDatabaseRequest = {
      targetdir: '/path/to/backup',
      isSchemaIncluded: true,
      isDataIncluded: true,
      dbuser: 'dba',
      dbpasswd: 'password',
    };

    const mockSuccessResponse: UnloadDatabaseCmsResponse = {
      __EXEC_TIME: '89 ms',
      note: 'none',
      status: 'success',
      task: 'unloaddb',
      result: [
        {
          'dba.test': '0 (100%/100%)',
          'dba.test2': '0 (100%/100%)',
        },
      ],
    };

    it('should successfully unload database with both schema and data', async () => {
      const request: UnloadDatabaseRequest = {
        ...baseRequest,
        isSchemaIncluded: true,
        isDataIncluded: true,
      };

      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      const result = await service.unloadDatabase(mockUserId, mockHostUid, mockDbname, request);

      expect(hostService.findHostInternal).toHaveBeenCalledWith(mockUserId, mockHostUid);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        `https://${mockHost.address}:${mockHost.port}/cm_api`,
        expect.objectContaining({
          task: 'unloaddb',
          token: mockHost.token,
          dbname: mockDbname,
          targetdir: request.targetdir,
          target: 'both',
          dbuser: request.dbuser,
          dbpasswd: request.dbpasswd,
        }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual(mockSuccessResponse.result);
    });

    it('should successfully unload database with schema only', async () => {
      const request: UnloadDatabaseRequest = {
        ...baseRequest,
        isSchemaIncluded: true,
        isDataIncluded: false,
      };

      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      const result = await service.unloadDatabase(mockUserId, mockHostUid, mockDbname, request);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          target: 'schema',
        }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual(mockSuccessResponse.result);
    });

    it('should successfully unload database with data only', async () => {
      const request: UnloadDatabaseRequest = {
        ...baseRequest,
        isSchemaIncluded: false,
        isDataIncluded: true,
      };

      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      const result = await service.unloadDatabase(mockUserId, mockHostUid, mockDbname, request);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          target: 'object',
        }),
          expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual(mockSuccessResponse.result);
    });

    it('should include optional fields in CMS request when provided', async () => {
      const request: UnloadDatabaseRequest = {
        ...baseRequest,
        usehash: 'yes',
        hashdir: '/path/to/hash',
        class: [{ classname: 'test' }],
        ref: 'yes',
        classonly: 'yes',
        'as-dba': 'yes',
        'skip-index-detail': 'yes',
        'split-schema-files': 'yes',
        delimit: 'yes',
        estimate: '1000',
        prefix: 'backup',
        cach: '100',
        lofile: '10',
      };

      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      await service.unloadDatabase(mockUserId, mockHostUid, mockDbname, request);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          usehash: 'yes',
          hashdir: '/path/to/hash',
          class: [{ classname: 'test' }],
          ref: 'yes',
          classonly: 'yes',
          'as-dba': 'yes',
          'skip-index-detail': 'yes',
          'split-schema-files': 'yes',
          delimit: 'yes',
          estimate: '1000',
          prefix: 'backup',
          cach: '100',
          lofile: '10',
        }),
          expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
    });

    it('should throw InvalidParameter error when both isSchemaIncluded and isDataIncluded are false', async () => {
      const request: UnloadDatabaseRequest = {
        ...baseRequest,
        isSchemaIncluded: false,
        isDataIncluded: false,
      };

      await expect(
        service.unloadDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(DatabaseError);

      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('should throw HostError when host is not found', async () => {
      hostService.findHostInternal.mockRejectedValue(
        HostError.NoSuchHost({ hostUid: mockHostUid })
      );

      await expect(
        service.unloadDatabase(mockUserId, mockHostUid, mockDbname, baseRequest)
      ).rejects.toThrow(HostError);

      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('should throw CmsError when CMS request fails', async () => {
      const cmsError = CmsError.RequestFailed({
        status: 500,
        data: { message: 'Internal server error' },
      });

      cmsClient.postAuthenticated.mockRejectedValue(cmsError);

      await expect(
        service.unloadDatabase(mockUserId, mockHostUid, mockDbname, baseRequest)
      ).rejects.toThrow(CmsError);
    });

    it('should throw DatabaseError when CMS token error is detected', async () => {
      const invalidTokenResponse: UnloadDatabaseCmsResponse = {
        __EXEC_TIME: '0 ms',
        note: 'Invalid token',
        status: 'failed',
        task: 'unloaddb',
        result: [],
      };

      cmsClient.postAuthenticated.mockResolvedValue(invalidTokenResponse);

      await expect(
        service.unloadDatabase(mockUserId, mockHostUid, mockDbname, baseRequest)
      ).rejects.toThrow(CmsError);
    });

    it('should throw DatabaseError when CMS status error is detected', async () => {
      const failedResponse: UnloadDatabaseCmsResponse = {
        __EXEC_TIME: '0 ms',
        note: 'Unload failed',
        status: 'failed',
        task: 'unloaddb',
        result: [],
      };

      cmsClient.postAuthenticated.mockResolvedValue(failedResponse);

      await expect(
        service.unloadDatabase(mockUserId, mockHostUid, mockDbname, baseRequest)
      ).rejects.toThrow(CmsError);
    });
  });

  describe('getUnloadInfo', () => {
    const mockResponse = {
      __EXEC_TIME: '0 ms',
      note: 'none',
      status: 'success',
      task: 'unloadinfo',
      database: [
        {
          dbname: 'test4',
          object: '/home/cubrid/CUBRID-11.4.4.1832-7f8f019-Linux.x86_64/databases/test4/test4_objects;2026.01.27 12:17',
          schema: '/home/cubrid/CUBRID-11.4.4.1832-7f8f019-Linux.x86_64/databases/test4/test4_schema;2026.01.27 12:17',
        },
        {
          dbname: 'demodb',
          object: '/home/cubrid/CUBRID-11.4.4.1832-7f8f019-Linux.x86_64/databases/demodb/demodb_objects;2026.01.27 12:02',
          schema: '/home/cubrid/CUBRID-11.4.4.1832-7f8f019-Linux.x86_64/databases/demodb/demodb_schema;2026.01.27 12:02',
        },
      ],
    };

    it('should successfully get unload info', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.getUnloadInfo(mockUserId, mockHostUid);

      expect(hostService.findHostInternal).toHaveBeenCalledWith(mockUserId, mockHostUid);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.stringContaining('https://localhost:8001/cm_api'),
        expect.objectContaining({
          task: 'unloadinfo',
          token: 'test-token',
        })
      );
      expect(result).toEqual({
        database: mockResponse.database,
      });
    });

    it('should return empty database array when CMS returns empty array', async () => {
      const emptyResponse = {
        __EXEC_TIME: '0 ms',
        note: 'none',
        status: 'success',
        task: 'unloadinfo',
        database: [],
      };
      cmsClient.postAuthenticated.mockResolvedValue(emptyResponse);

      const result = await service.getUnloadInfo(mockUserId, mockHostUid);

      expect(result).toEqual({
        database: [],
      });
    });

    it('should throw DatabaseError when HostError occurs', async () => {
      hostService.findHostInternal.mockRejectedValue(HostError.NoSuchHost());

      await expect(service.getUnloadInfo(mockUserId, mockHostUid)).rejects.toThrow(HostError);
    });

    it('should throw DatabaseError when CmsError occurs', async () => {
      const cmsError = CmsError.RequestFailed({
        message: 'CMS request failed',
        response: {},
      });
      cmsClient.postAuthenticated.mockRejectedValue(cmsError);

      await expect(service.getUnloadInfo(mockUserId, mockHostUid)).rejects.toThrow(CmsError);
    });

    it('should throw DatabaseError when CMS token error occurs', async () => {
      const tokenErrorResponse = {
        __EXEC_TIME: '0 ms',
        note: 'Invalid token',
        status: 'fail',
        task: 'unloadinfo',
      };
      cmsClient.postAuthenticated.mockResolvedValue(tokenErrorResponse);

      await expect(service.getUnloadInfo(mockUserId, mockHostUid)).rejects.toThrow(CmsError);
    });

    it('should throw DatabaseError when CMS status error occurs', async () => {
      const statusErrorResponse = {
        __EXEC_TIME: '0 ms',
        note: 'Request failed',
        status: 'fail',
        task: 'unloadinfo',
      };
      cmsClient.postAuthenticated.mockResolvedValue(statusErrorResponse);

      await expect(service.getUnloadInfo(mockUserId, mockHostUid)).rejects.toThrow(CmsError);
    });
  });

  describe('loadDatabase', () => {
    const baseRequest: LoadDatabaseRequest = {
      checkoption: 'both',
      period: 'none',
      _DBID: 'dba',
      _DBPASSWD: 'secret',
      estimated: 'none',
      oiduse: 'yes',
      statisticsuse: 'yes',
      nolog: 'no',
      schema: '/path/to/schema',
      object: '/path/to/object',
      index: 'none',
      errorcontrolfile: 'none',
      ignoreclassfile: 'none',
    };

    const mockSuccessResponse: LoadDatabaseCmsResponse = {
      __EXEC_TIME: '100 ms',
      note: 'none',
      status: 'success',
      task: 'loaddb',
      line: [
        '',
        'Start schema loading.',
        'Total       14 statements executed.',
        'Schema loading from /path/to/schema finished.',
        'Start object loading.',
        'Total 0 object(s) inserted, 0 object(s) failed.',
      ],
    };

    it('should successfully load database', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      const result = await service.loadDatabase(
        mockUserId,
        mockHostUid,
        mockDbname,
        baseRequest
      );

      expect(hostService.findHostInternal).toHaveBeenCalledWith(mockUserId, mockHostUid);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        `https://${mockHost.address}:${mockHost.port}/cm_api`,
        expect.objectContaining({
          task: 'loaddb',
          token: mockHost.token,
          dbname: mockDbname,
          checkoption: baseRequest.checkoption,
          period: baseRequest.period,
          _DBID: baseRequest._DBID,
          _DBPASSWD: baseRequest._DBPASSWD,
          estimated: baseRequest.estimated,
          oiduse: baseRequest.oiduse,
          statisticsuse: baseRequest.statisticsuse,
          nolog: baseRequest.nolog,
          schema: baseRequest.schema,
          object: baseRequest.object,
          index: baseRequest.index,
          errorcontrolfile: baseRequest.errorcontrolfile,
          ignoreclassfile: baseRequest.ignoreclassfile,
        }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual({ success: true });
    });

    it('should include all request fields in CMS request', async () => {
      const fullRequest: LoadDatabaseRequest = {
        checkoption: 'both',
        period: 'none',
        _DBID: 'dba',
        _DBPASSWD: 'secret',
        estimated: 'none',
        oiduse: 'yes',
        statisticsuse: 'no',
        nolog: 'yes',
        schema: '/path/to/schema',
        object: '/path/to/object',
        index: 'none',
        errorcontrolfile: '/path/to/error',
        ignoreclassfile: '/path/to/ignore',
      };

      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      await service.loadDatabase(mockUserId, mockHostUid, mockDbname, fullRequest);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          checkoption: fullRequest.checkoption,
          period: fullRequest.period,
          _DBID: fullRequest._DBID,
          _DBPASSWD: fullRequest._DBPASSWD,
          estimated: fullRequest.estimated,
          oiduse: fullRequest.oiduse,
          statisticsuse: fullRequest.statisticsuse,
          nolog: fullRequest.nolog,
          schema: fullRequest.schema,
          object: fullRequest.object,
          index: fullRequest.index,
          errorcontrolfile: fullRequest.errorcontrolfile,
          ignoreclassfile: fullRequest.ignoreclassfile,
        }),
          expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
    });

    it('should throw HostError when host is not found', async () => {
      hostService.findHostInternal.mockRejectedValue(
        HostError.NoSuchHost({ hostUid: mockHostUid })
      );

      await expect(
        service.loadDatabase(mockUserId, mockHostUid, mockDbname, baseRequest)
      ).rejects.toThrow(HostError);

      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('should throw CmsError when CMS request fails', async () => {
      const cmsError = CmsError.RequestFailed({
        status: 500,
        data: { message: 'Internal server error' },
      });

      cmsClient.postAuthenticated.mockRejectedValue(cmsError);

      await expect(
        service.loadDatabase(mockUserId, mockHostUid, mockDbname, baseRequest)
      ).rejects.toThrow(CmsError);
    });

    it('should throw DatabaseError when CMS token error is detected', async () => {
      const invalidTokenResponse: LoadDatabaseCmsResponse = {
        __EXEC_TIME: '0 ms',
        note: 'Invalid token',
        status: 'failed',
        task: 'loaddb',
        line: [],
      };

      cmsClient.postAuthenticated.mockResolvedValue(invalidTokenResponse);

      await expect(
        service.loadDatabase(mockUserId, mockHostUid, mockDbname, baseRequest)
      ).rejects.toThrow(CmsError);
    });

    it('should throw CmsError with line information when CMS status error occurs', async () => {
      const failedResponse: LoadDatabaseCmsResponse = {
        __EXEC_TIME: '0 ms',
        note: 'Load failed',
        status: 'failed',
        task: 'loaddb',
        line: [
          'Error: Syntax error in schema file',
          'Line 10: Invalid statement',
          'Failed to load database',
        ],
      };

      cmsClient.postAuthenticated.mockResolvedValue(failedResponse);

      await expect(
        service.loadDatabase(mockUserId, mockHostUid, mockDbname, baseRequest)
      ).rejects.toThrow(CmsError);

      // CMS failure surfaces note/line through CmsError
      try {
        await service.loadDatabase(mockUserId, mockHostUid, mockDbname, baseRequest);
      } catch (error) {
        if (error instanceof CmsError) {
          expect(error.additionalData?.message).toContain('Load failed');
        }
      }
    });

    it('should handle empty line array in error response', async () => {
      const failedResponse: LoadDatabaseCmsResponse = {
        __EXEC_TIME: '0 ms',
        note: 'Load failed',
        status: 'failed',
        task: 'loaddb',
        line: [],
      };

      cmsClient.postAuthenticated.mockResolvedValue(failedResponse);

      await expect(
        service.loadDatabase(mockUserId, mockHostUid, mockDbname, baseRequest)
      ).rejects.toThrow(CmsError);
    });

    it('should handle missing line property in error response', async () => {
      const failedResponse: LoadDatabaseCmsResponse = {
        __EXEC_TIME: '0 ms',
        note: 'Load failed',
        status: 'failed',
        task: 'loaddb',
        line: undefined as any,
      };

      cmsClient.postAuthenticated.mockResolvedValue(failedResponse);

      await expect(
        service.loadDatabase(mockUserId, mockHostUid, mockDbname, baseRequest)
      ).rejects.toThrow(CmsError);
    });

    it('should rethrow non-CmsError exceptions', async () => {
      const genericError = new Error('Generic error');

      cmsClient.postAuthenticated.mockRejectedValue(genericError);

      await expect(
        service.loadDatabase(mockUserId, mockHostUid, mockDbname, baseRequest)
      ).rejects.toThrow(CmsError);
    });
  });

  describe('checkDatabase', () => {
    const mockSuccessResponse: CheckDatabaseCmsResponse = {
      __EXEC_TIME: '450 ms',
      note: 'none',
      status: 'success',
      task: 'checkdb',
    };

    it('should successfully check database with repairdb "n"', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      const request: CheckDatabaseRequest = { repairdb: 'n' };

      const result = await service.checkDatabase(
        mockUserId,
        mockHostUid,
        mockDbname,
        request
      );

      expect(hostService.findHostInternal).toHaveBeenCalledWith(mockUserId, mockHostUid);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        `https://${mockHost.address}:${mockHost.port}/cm_api`,
        {
          task: 'checkdb',
          token: mockHost.token,
          dbname: mockDbname,
          repairdb: 'n',
          async: 'yes',
        },
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual({ success: true });
    });

    it('should successfully check database with repairdb "y"', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      const request: CheckDatabaseRequest = { repairdb: 'y' };

      const result = await service.checkDatabase(
        mockUserId,
        mockHostUid,
        mockDbname,
        request
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          repairdb: 'y',
        }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual({ success: true });
    });

    it('should throw HostError if host is not found', async () => {
      hostService.findHostInternal.mockRejectedValue(
        HostError.NoSuchHost({ hostUid: mockHostUid })
      );
      const request: CheckDatabaseRequest = { repairdb: 'n' };

      await expect(
        service.checkDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(HostError);
    });

    it('should throw CmsError if CMS request fails', async () => {
      cmsClient.postAuthenticated.mockRejectedValue(
        CmsError.RequestFailed({ message: 'CMS request failed' })
      );
      const request: CheckDatabaseRequest = { repairdb: 'n' };

      await expect(
        service.checkDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(CmsError);
    });

    // An invalid-token response no longer fails the job immediately — CMS
    // keeps the async task alive independent of our token, so the poll loop
    // keeps retrying with a freshly-read token instead, only giving up once
    // the overall job deadline elapses (forced very small here so a
    // persistently-invalid token surfaces as a timeout within the test).
    it('keeps retrying instead of failing fast on an invalid-token response, until the job deadline elapses', async () => {
      process.env.CMS_JOB_LONG_TIMEOUT_HOURS = '0.0001';
      try {
        cmsClient.postAuthenticated.mockResolvedValue({ __EXEC_TIME: '0 ms', note: 'Request is rejected due to invalid token. Please reconnect.', status: 'error', task: 'cms' });
        const request: CheckDatabaseRequest = { repairdb: 'n' };

        const err = await service.checkDatabase(mockUserId, mockHostUid, mockDbname, request).catch((e) => e);
          expect(err.originalError?.message).toMatch(/did not finish within/);
      } finally {
        delete process.env.CMS_JOB_LONG_TIMEOUT_HOURS;
      }
    });

    it('should throw CmsError if CMS status is fail', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ __EXEC_TIME: '0 ms', note: 'CMS request failed', status: 'fail', task: 'cms' });
      const request: CheckDatabaseRequest = { repairdb: 'n' };

      await expect(
        service.checkDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(CmsError);
    });
  });

  describe('compactDatabase', () => {
    const mockSuccessResponseWithLog: CompactDatabaseCmsResponse = {
      __EXEC_TIME: '539 ms',
      note: 'none',
      status: 'success',
      task: 'compactdb',
      log: [
        {
          line: [
            '',
            'Pass 1',
            '',
            'Class db_root',
            '1 instances.',
            '1154 objects processed.',
          ],
        },
      ],
    };

    const mockSuccessResponseWithoutLog: CompactDatabaseCmsResponse = {
      __EXEC_TIME: '539 ms',
      note: 'none',
      status: 'success',
      task: 'compactdb',
    };

    it('should successfully compact database with verbose "y" and return log', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponseWithLog);
      const request: CompactDatabaseRequest = { verbose: 'y' };

      const result = await service.compactDatabase(
        mockUserId,
        mockHostUid,
        mockDbname,
        request
      );

      expect(hostService.findHostInternal).toHaveBeenCalledWith(mockUserId, mockHostUid);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        `https://${mockHost.address}:${mockHost.port}/cm_api`,
        {
          task: 'compactdb',
          token: mockHost.token,
          dbname: mockDbname,
          verbose: 'y',
          async: 'yes',
        },
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual({
        success: true,
        log: mockSuccessResponseWithLog.log,
      });
    });

    it('should successfully compact database with verbose "n" and return empty object', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponseWithoutLog);
      const request: CompactDatabaseRequest = { verbose: 'n' };

      const result = await service.compactDatabase(
        mockUserId,
        mockHostUid,
        mockDbname,
        request
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          verbose: 'n',
        }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual({ success: true });
    });

    it('should throw HostError if host is not found', async () => {
      hostService.findHostInternal.mockRejectedValue(
        HostError.NoSuchHost({ hostUid: mockHostUid })
      );
      const request: CompactDatabaseRequest = { verbose: 'y' };

      await expect(
        service.compactDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(HostError);
    });

    it('should throw CmsError if CMS request fails', async () => {
      cmsClient.postAuthenticated.mockRejectedValue(
        CmsError.RequestFailed({ message: 'CMS request failed' })
      );
      const request: CompactDatabaseRequest = { verbose: 'y' };

      await expect(
        service.compactDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(CmsError);
    });

    it('keeps retrying instead of failing fast on an invalid-token response, until the job deadline elapses', async () => {
      process.env.CMS_JOB_LONG_TIMEOUT_HOURS = '0.0001';
      try {
        cmsClient.postAuthenticated.mockResolvedValue({
          __EXEC_TIME: '0 ms',
          note: 'Request is rejected due to invalid token. Please reconnect.',
          status: 'error',
          task: 'compactdb',
        });
        const request: CompactDatabaseRequest = { verbose: 'y' };

        const err = await service.compactDatabase(mockUserId, mockHostUid, mockDbname, request).catch((e) => e);
          expect(err.originalError?.message).toMatch(/did not finish within/);
      } finally {
        delete process.env.CMS_JOB_LONG_TIMEOUT_HOURS;
      }
    });

    it('should throw CmsError if CMS status is fail', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'CMS request failed',
        status: 'fail',
        task: 'compactdb',
      });
      const request: CompactDatabaseRequest = { verbose: 'y' };

      await expect(
        service.compactDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(CmsError);
    });
  });

  describe('renameDatabase', () => {
    const mockSuccessResponse: RenameDatabaseCmsResponse = {
      __EXEC_TIME: '482 ms',
      note: 'none',
      status: 'success',
      task: 'renamedb',
    };

    const mockClientVolumeMapping = [
      { oldPath: '/old/path1', newPath: '/new/path1' },
      { oldPath: '/old/path2', newPath: '/new/path2' },
    ];

    const expectedCmsVolumeMapping = [
      {
        '/old/path1': '/new/path1',
        '/old/path2': '/new/path2',
      },
    ];

    it('should successfully rename database with advanced "on" and volume', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      const request: RenameDatabaseRequest = {
        rename: 'renamed_db',
        exvolpath: 'none',
        advanced: 'on',
        volume: mockClientVolumeMapping,
        forcedel: 'n',
      };

      const result = await service.renameDatabase(
        mockUserId,
        mockHostUid,
        mockDbname,
        request
      );

      expect(hostService.findHostInternal).toHaveBeenCalledWith(mockUserId, mockHostUid);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        `https://${mockHost.address}:${mockHost.port}/cm_api`,
        {
          task: 'renamedb',
          token: mockHost.token,
          dbname: mockDbname,
          rename: 'renamed_db',
          exvolpath: 'none',
          advanced: 'on',
          volume: expectedCmsVolumeMapping,
          forcedel: 'n',
          async: 'yes',
        },
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual(mockStartInfoResponse);
    });

    it('should successfully rename database with advanced "off" without volume', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      const request: RenameDatabaseRequest = {
        rename: 'renamed_db',
        exvolpath: 'none',
        advanced: 'off',
        forcedel: 'n',
      };

      const result = await service.renameDatabase(
        mockUserId,
        mockHostUid,
        mockDbname,
        request
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          advanced: 'off',
          forcedel: 'n',
        }),
          expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({
          volume: expect.anything(),
        }),
          expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual(mockStartInfoResponse);
    });

    it('should not include volume in CMS request when advanced is "off" even if volume is provided', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      const request: RenameDatabaseRequest = {
        rename: 'renamed_db',
        exvolpath: 'none',
        advanced: 'off',
        volume: mockClientVolumeMapping, // volume provided but advanced is 'off'
        forcedel: 'n',
      };

      const result = await service.renameDatabase(
        mockUserId,
        mockHostUid,
        mockDbname,
        request
      );

      // Volume should not be included when advanced is 'off'
      const callArgs = cmsClient.postAuthenticated.mock.calls[0][1] as any;
      expect(callArgs.volume).toBeUndefined();
      expect(result).toEqual(mockStartInfoResponse);
    });

    it('should throw HostError if host is not found', async () => {
      hostService.findHostInternal.mockRejectedValue(
        HostError.NoSuchHost({ hostUid: mockHostUid })
      );
      const request: RenameDatabaseRequest = {
        rename: 'renamed_db',
        exvolpath: 'none',
        advanced: 'off',
        forcedel: 'n',
      };

      await expect(
        service.renameDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(HostError);
    });

    it('should throw CmsError if CMS request fails', async () => {
      cmsClient.postAuthenticated.mockRejectedValue(
        CmsError.RequestFailed({ message: 'CMS request failed' })
      );
      const request: RenameDatabaseRequest = {
        rename: 'renamed_db',
        exvolpath: 'none',
        advanced: 'off',
        forcedel: 'n',
      };

      await expect(
        service.renameDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(CmsError);
    });

    it('keeps retrying instead of failing fast on an invalid-token response, until the job deadline elapses', async () => {
      process.env.CMS_JOB_LONG_TIMEOUT_HOURS = '0.0001';
      try {
        cmsClient.postAuthenticated.mockResolvedValue({ __EXEC_TIME: '0 ms', note: 'Request is rejected due to invalid token. Please reconnect.', status: 'error', task: 'cms' });
        const request: RenameDatabaseRequest = {
          rename: 'renamed_db',
          exvolpath: 'none',
          advanced: 'off',
          forcedel: 'n',
        };

        const err = await service.renameDatabase(mockUserId, mockHostUid, mockDbname, request).catch((e) => e);
          expect(err.originalError?.message).toMatch(/did not finish within/);
      } finally {
        delete process.env.CMS_JOB_LONG_TIMEOUT_HOURS;
      }
    });

    it('should throw CmsError if CMS status is fail', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ __EXEC_TIME: '0 ms', note: 'CMS request failed', status: 'fail', task: 'cms' });
      const request: RenameDatabaseRequest = {
        rename: 'renamed_db',
        exvolpath: 'none',
        advanced: 'off',
        forcedel: 'n',
      };

      await expect(
        service.renameDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(CmsError);
    });
  });

  describe('getAddVolStatus', () => {
    const mockSuccessResponse = {
      __EXEC_TIME: '0 ms',
      freespace: '2227464',
      note: 'none',
      status: 'success',
      task: 'getaddvolstatus',
      volpath: '/home/cubrid/CUBRID-11.4.4.1832-7f8f019-Linux.x86_64/databases/test',
    };

    it('should successfully get add vol status', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      const result = await service.getAddVolStatus(mockUserId, mockHostUid, mockDbname);

      expect(hostService.findHostInternal).toHaveBeenCalledWith(mockUserId, mockHostUid);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        `https://${mockHost.address}:${mockHost.port}/cm_api`,
        {
          task: 'getaddvolstatus',
          token: mockHost.token,
          dbname: mockDbname,
        }
      );
      expect(result).toEqual({
        freespace: '2227464',
        volpath: '/home/cubrid/CUBRID-11.4.4.1832-7f8f019-Linux.x86_64/databases/test',
      });
    });

    it('should throw HostError if host is not found', async () => {
      hostService.findHostInternal.mockRejectedValue(
        HostError.NoSuchHost({ hostUid: mockHostUid })
      );

      await expect(service.getAddVolStatus(mockUserId, mockHostUid, mockDbname)).rejects.toThrow(
        HostError
      );
    });

    it('should throw CmsError if CMS request fails', async () => {
      cmsClient.postAuthenticated.mockRejectedValue(
        CmsError.RequestFailed({ message: 'CMS request failed' })
      );

      await expect(service.getAddVolStatus(mockUserId, mockHostUid, mockDbname)).rejects.toThrow(
        CmsError
      );
    });

    it('should throw CmsError if CMS token error occurs', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ __EXEC_TIME: '0 ms', note: 'Request is rejected due to invalid token. Please reconnect.', status: 'error', task: 'cms' });

      await expect(service.getAddVolStatus(mockUserId, mockHostUid, mockDbname)).rejects.toThrow(
        CmsError
      );
    });

    it('should throw CmsError if CMS status is fail', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ __EXEC_TIME: '0 ms', note: 'CMS request failed', status: 'fail', task: 'cms' });

      await expect(service.getAddVolStatus(mockUserId, mockHostUid, mockDbname)).rejects.toThrow(
        CmsError
      );
    });
  });

  describe('addVolDb', () => {
    const mockRequest = {
      volname: '',
      purpose: 'generic',
      path: '/home/cubrid/CUBRID-11.4.4.1832-7f8f019-Linux.x86_64/databases/test',
      numberofpages: '32768',
      size_need_mb: '512.000(MB)',
    };

    const mockSuccessResponse = {
      __EXEC_TIME: '3345 ms',
      dbname: 'test',
      note: 'none',
      purpose: 'generic',
      status: 'success',
      task: 'addvoldb',
    };

    it('should successfully add volume to database', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      const result = await service.addVolDb(mockUserId, mockHostUid, mockDbname, mockRequest);

      expect(hostService.findHostInternal).toHaveBeenCalledWith(mockUserId, mockHostUid);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        `https://${mockHost.address}:${mockHost.port}/cm_api`,
        {
          task: 'addvoldb',
          token: mockHost.token,
          dbname: mockDbname,
          volname: mockRequest.volname,
          purpose: mockRequest.purpose,
          path: mockRequest.path,
          numberofpages: mockRequest.numberofpages,
          size_need_mb: mockRequest.size_need_mb,
          async: 'yes',
        },
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual({
        dbname: 'test',
        purpose: 'generic',
      });
    });

    it('should throw HostError if host is not found', async () => {
      hostService.findHostInternal.mockRejectedValue(
        HostError.NoSuchHost({ hostUid: mockHostUid })
      );

      await expect(
        service.addVolDb(mockUserId, mockHostUid, mockDbname, mockRequest)
      ).rejects.toThrow(HostError);
    });

    it('should throw CmsError if CMS request fails', async () => {
      cmsClient.postAuthenticated.mockRejectedValue(
        CmsError.RequestFailed({ message: 'CMS request failed' })
      );

      await expect(
        service.addVolDb(mockUserId, mockHostUid, mockDbname, mockRequest)
      ).rejects.toThrow(CmsError);
    });

    it('keeps retrying instead of failing fast on an invalid-token response, until the job deadline elapses', async () => {
      process.env.CMS_JOB_LONG_TIMEOUT_HOURS = '0.0001';
      try {
        cmsClient.postAuthenticated.mockResolvedValue({ __EXEC_TIME: '0 ms', note: 'Request is rejected due to invalid token. Please reconnect.', status: 'error', task: 'cms' });

        const err = await service.addVolDb(mockUserId, mockHostUid, mockDbname, mockRequest).catch((e) => e);
          expect(err.originalError?.message).toMatch(/did not finish within/);
      } finally {
        delete process.env.CMS_JOB_LONG_TIMEOUT_HOURS;
      }
    });

    it('should throw CmsError if CMS status is fail', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ __EXEC_TIME: '0 ms', note: 'CMS request failed', status: 'fail', task: 'cms' });

      await expect(
        service.addVolDb(mockUserId, mockHostUid, mockDbname, mockRequest)
      ).rejects.toThrow(CmsError);
    });
  });

  describe('lockDatabase', () => {
    const mockSuccessResponse: LockDatabaseCmsResponse = {
      __EXEC_TIME: '34 ms',
      note: 'none',
      status: 'success',
      task: 'lockdb',
      lockinfo: [
        {
          dinterval: '1.00',
          esc: '100000',
          lot: [
            {
              entry: [
                {
                  lock_holders: [
                    {
                      count: '1',
                      granted_mode: 'IS_LOCK',
                      nsubgranules: '0',
                      tran_index: '1',
                    },
                  ],
                  num_b_holders: '0',
                  num_holders: '1',
                  num_waiters: '0',
                  ob_type: 'Class = code',
                  oid: '0|201|-32763',
                },
                {
                  num_b_holders: 'missing',
                  num_holders: 'inser',
                  num_waiters: '=',
                  ob_type: 'Instance of class ( 0|   193|   3) = db_user',
                  oid: '0|833|2',
                },
                {
                  lock_holders: [
                    {
                      count: '9',
                      granted_mode: 'IX_LOCK',
                      nsubgranules: '1',
                      tran_index: '1',
                    },
                  ],
                  num_b_holders: '0',
                  num_holders: '1',
                  num_waiters: '0',
                  ob_type: 'Class = code',
                  oid: '0|201|5',
                },
                {
                  lock_holders: [
                    {
                      count: '2',
                      granted_mode: 'IX_LOCK',
                      nsubgranules: '0',
                      tran_index: '1',
                    },
                  ],
                  num_b_holders: '0',
                  num_holders: '1',
                  num_waiters: '0',
                  ob_type: 'Root class',
                  oid: '0|193|1',
                },
                {
                  lock_holders: [
                    {
                      count: '3',
                      granted_mode: 'IS_LOCK',
                      nsubgranules: '1',
                      tran_index: '1',
                    },
                  ],
                  num_b_holders: '0',
                  num_holders: '1',
                  num_waiters: '0',
                  ob_type: 'Class = db_user',
                  oid: '0|193|3',
                },
                {
                  num_b_holders: '4',
                  num_holders: 'inser',
                  num_waiters: '=',
                  ob_type: 'Instance of class ( 0|   201|   5) = code',
                  oid: '0|3457|7',
                },
              ],
              maxnumlock: '10000',
              numlocked: '6',
            },
          ],
          transaction: [
            {
              '@uid': '',
              host: '',
              index: '0',
              isolevel: 'COMMITTED READ',
              pid: '0',
              pname: '',
              timeout: ':',
            },
            {
              '@uid': 'DBA',
              host: 'lgj1089-36',
              index: '1',
              isolevel: 'COMMITTED READ',
              pid: '44371',
              pname: 'csql',
              timeout: ':',
            },
            {
              '@uid': 'DBA',
              host: 'lgj1089-36',
              index: '2',
              isolevel: 'COMMITTED READ',
              pid: '44066',
              pname: 'query_editor_cub_cas_1',
              timeout: ':',
            },
            {
              '@uid': 'DBA',
              host: 'lgj1089-36',
              index: '3',
              isolevel: 'COMMITTED READ',
              pid: '44725',
              pname: 'lockdb',
              timeout: ':',
            },
          ],
        },
      ],
    };

    it('should successfully get lock information', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      const request: LockDatabaseRequest = {};

      const result = await service.lockDatabase(
        mockUserId,
        mockHostUid,
        mockDbname,
        request
      );

      expect(hostService.findHostInternal).toHaveBeenCalledWith(mockUserId, mockHostUid);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        `https://${mockHost.address}:${mockHost.port}/cm_api`,
        {
          task: 'lockdb',
          token: mockHost.token,
          dbname: mockDbname,
        }
      );
      expect(result).toEqual({
        lockinfo: mockSuccessResponse.lockinfo,
      });
    });

    it('should successfully get lock information (legacy format without lock_holders)', async () => {
      // Legacy format: no lock_holders, has numallocated and sizelock
      const legacyResponse: LockDatabaseCmsResponse = {
        __EXEC_TIME: '48 ms',
        note: 'none',
        status: 'success',
        task: 'lockdb',
        lockinfo: [
          {
            dinterval: '1.00',
            esc: '100000',
            lot: [
              {
                entry: [
                  {
                    num_b_holders: '6',
                    num_holders: 'inser',
                    num_waiters: '=',
                    ob_type: 'Instance of class ( 0|   208|   4) = public.code',
                    oid: '0|4353|7',
                  },
                ],
                maxnumlock: '-1',
                numallocated: '1000',
                numlocked: '16',
                sizelock: '242K',
              },
            ],
            transaction: [
              {
                '@uid': '',
                host: '',
                index: '0',
                isolevel: 'COMMITTED READ',
                pid: '0',
                pname: '',
                timeout: ':',
              },
            ],
          },
        ],
      };

      cmsClient.postAuthenticated.mockResolvedValue(legacyResponse);
      const request: LockDatabaseRequest = {};

      const result = await service.lockDatabase(
        mockUserId,
        mockHostUid,
        mockDbname,
        request
      );

      expect(result).toEqual({
        lockinfo: legacyResponse.lockinfo,
      });
    });

    it('should throw HostError if host is not found', async () => {
      hostService.findHostInternal.mockRejectedValue(
        HostError.NoSuchHost({ hostUid: mockHostUid })
      );
      const request: LockDatabaseRequest = {};

      await expect(
        service.lockDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(HostError);
    });

    it('should throw CmsError if CMS request fails', async () => {
      cmsClient.postAuthenticated.mockRejectedValue(
        CmsError.RequestFailed({ message: 'CMS request failed' })
      );
      const request: LockDatabaseRequest = {};

      await expect(
        service.lockDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(CmsError);
    });

    it('should throw CmsError if CMS token error occurs', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ __EXEC_TIME: '0 ms', note: 'Request is rejected due to invalid token. Please reconnect.', status: 'error', task: 'cms' });
      const request: LockDatabaseRequest = {};

      await expect(
        service.lockDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(CmsError);
    });

    it('should throw CmsError if CMS status is fail', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ __EXEC_TIME: '0 ms', note: 'CMS request failed', status: 'fail', task: 'cms' });
      const request: LockDatabaseRequest = {};

      await expect(
        service.lockDatabase(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(CmsError);
    });
  });

  describe('getTransactionInfo', () => {
    const mockSuccessResponse: GetTransactionInfoCmsResponse = {
      __EXEC_TIME: '56 ms',
      dbname: 'demodb',
      note: 'none',
      status: 'success',
      task: 'gettransactioninfo',
      transactioninfo: [
        {
          transaction: [
            {
              '@user': 'DBA',
              SQL_ID: 'empty',
              host: 'lgj1089-3-60',
              pid: '1684512',
              program: 'query_editor_cub_cas_1',
              query_time: '0.00',
              tran_time: '0.00',
              tranindex: '2(ACTIVE)',
              wait_for_lock_holder: '-1',
            },
          ],
        },
      ],
    };

    it('should successfully get transaction information', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      const request: GetTransactionInfoRequest = {
        dbuser: 'dba',
        dbpasswd: '',
      };

      const result = await service.getTransactionInfo(
        mockUserId,
        mockHostUid,
        mockDbname,
        request
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'gettransactioninfo',
          token: mockHost.token,
          dbname: mockDbname,
          dbuser: 'dba',
          dbpasswd: '',
        })
      );
      expect(result).toEqual({
        dbname: 'demodb',
        transactioninfo: [
          {
            transaction: [
              {
                '@user': 'DBA',
                SQL_ID: 'empty',
                host: 'lgj1089-3-60',
                pid: '1684512',
                program: 'query_editor_cub_cas_1',
                query_time: '0.00',
                tran_time: '0.00',
                tranindex: '2(ACTIVE)',
                wait_for_lock_holder: '-1',
              },
            ],
          },
        ],
      });
    });

    it('should throw HostError if host is not found', async () => {
      hostService.findHostInternal.mockRejectedValue(
        HostError.NoSuchHost({ hostUid: mockHostUid })
      );
      const request: GetTransactionInfoRequest = {
        dbuser: 'dba',
        dbpasswd: '',
      };

      await expect(
        service.getTransactionInfo(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(HostError);
    });

    it('should throw CmsError if CMS request fails', async () => {
      cmsClient.postAuthenticated.mockRejectedValue(
        CmsError.RequestFailed({ message: 'CMS request failed' })
      );
      const request: GetTransactionInfoRequest = {
        dbuser: 'dba',
        dbpasswd: '',
      };

      await expect(
        service.getTransactionInfo(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(CmsError);
    });

    it('should throw CmsError if CMS token error occurs', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ __EXEC_TIME: '0 ms', note: 'Request is rejected due to invalid token. Please reconnect.', status: 'error', task: 'cms' });
      const request: GetTransactionInfoRequest = {
        dbuser: 'dba',
        dbpasswd: '',
      };

      await expect(
        service.getTransactionInfo(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(CmsError);
    });

    it('should throw CmsError if CMS status is fail', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ __EXEC_TIME: '0 ms', note: 'CMS request failed', status: 'fail', task: 'cms' });
      const request: GetTransactionInfoRequest = {
        dbuser: 'dba',
        dbpasswd: '',
      };

      await expect(
        service.getTransactionInfo(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(CmsError);
    });
  });

  describe('killTransaction', () => {
    const mockSuccessResponse: KillTransactionCmsResponse = {
      __EXEC_TIME: '84 ms',
      dbname: 'demodb',
      note: 'none',
      status: 'success',
      task: 'killtransaction',
      transactioninfo: [
        {
          transaction: [
            {
              '@user': 'DBA',
              SQL_ID: 'empty',
              host: 'lgj1089-3-60',
              pid: '2782204',
              program: 'query_editor_cub_cas_1',
              query_time: '0.00',
              tran_time: '0.00',
              tranindex: '1(ACTIVE)',
              wait_for_lock_holder: '-1',
            },
          ],
        },
      ],
    };

    it('should successfully kill transaction by index', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      const request: KillTransactionRequest = {
        type: 'i',
        parameter: '1',
      };

      const result = await service.killTransaction(
        mockUserId,
        mockHostUid,
        mockDbname,
        request
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'killtransaction',
          token: mockHost.token,
          dbname: mockDbname,
          type: 'i',
          parameter: '1',
        })
      );
      expect(result).toEqual({
        dbname: 'demodb',
        transactioninfo: [
          {
            transaction: [
              {
                '@user': 'DBA',
                SQL_ID: 'empty',
                host: 'lgj1089-3-60',
                pid: '2782204',
                program: 'query_editor_cub_cas_1',
                query_time: '0.00',
                tran_time: '0.00',
                tranindex: '1(ACTIVE)',
                wait_for_lock_holder: '-1',
              },
            ],
          },
        ],
      });
    });

    it('should successfully display active transactions (type d)', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      const request: KillTransactionRequest = {
        type: 'd',
      };

      const result = await service.killTransaction(
        mockUserId,
        mockHostUid,
        mockDbname,
        request
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'killtransaction',
          token: mockHost.token,
          dbname: mockDbname,
          type: 'd',
        })
      );
      expect(result.dbname).toBe('demodb');
    });

    it('should successfully kill all transactions by process name', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      const request: KillTransactionRequest = {
        type: 'p',
        parameter: 'query_editor_cub_cas_1',
      };

      await service.killTransaction(mockUserId, mockHostUid, mockDbname, request);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'killtransaction',
          token: mockHost.token,
          dbname: mockDbname,
          type: 'p',
          parameter: 'query_editor_cub_cas_1',
        })
      );
    });

    it('should successfully kill transaction by host', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      const request: KillTransactionRequest = {
        type: 'h',
        parameter: 'lgj1089-3-60',
      };

      await service.killTransaction(mockUserId, mockHostUid, mockDbname, request);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'killtransaction',
          token: mockHost.token,
          dbname: mockDbname,
          type: 'h',
          parameter: 'lgj1089-3-60',
        })
      );
    });

    it('should throw DatabaseError if parameter is missing for type i', async () => {
      const request: KillTransactionRequest = {
        type: 'i',
      };

      await expect(
        service.killTransaction(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(DatabaseError);
    });

    it('should throw DatabaseError if parameter is missing for type p', async () => {
      const request: KillTransactionRequest = {
        type: 'p',
      };

      await expect(
        service.killTransaction(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(DatabaseError);
    });

    it('should throw DatabaseError if parameter is missing for type h', async () => {
      const request: KillTransactionRequest = {
        type: 'h',
      };

      await expect(
        service.killTransaction(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(DatabaseError);
    });

    it('should throw HostError if host is not found', async () => {
      hostService.findHostInternal.mockRejectedValue(
        HostError.NoSuchHost({ hostUid: mockHostUid })
      );
      const request: KillTransactionRequest = {
        type: 'i',
        parameter: '1',
      };

      await expect(
        service.killTransaction(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(HostError);
    });

    it('should throw CmsError if CMS request fails', async () => {
      cmsClient.postAuthenticated.mockRejectedValue(
        CmsError.RequestFailed({ message: 'CMS request failed' })
      );
      const request: KillTransactionRequest = {
        type: 'i',
        parameter: '1',
      };

      await expect(
        service.killTransaction(mockUserId, mockHostUid, mockDbname, request)
      ).rejects.toThrow(CmsError);
    });
  });
});
