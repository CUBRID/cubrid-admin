import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseManagementService } from './database-management.service';
import { HostService } from '@host';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { DatabaseInfoService } from '@database/info/database-info.service';
import { DatabaseUserService } from '@database/user/database-user.service';
import { CmsConfigService } from '@cms-config/cms-config.service';
import { DatabaseConfigService } from '@database/config/database-config.service';
import { DatabaseError } from '@error/database/database-error';
import { HostError } from '@error/index';
import { CmsError } from '@error/cms/cms-error';
import {
  CopyDbRequest,
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
  let configService: { renameAutoStart: jest.Mock };
  let cmsClient: jest.Mocked<CmsHttpsClientService>;
  let databaseUserService: { loginDatabase: jest.Mock; ensureDbLogin: jest.Mock; deleteDbProfile: jest.Mock };

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
  let cmsConfigService: { getAllSystemParam: jest.Mock; setSystemParam: jest.Mock };
  let databaseConfigService: { ensureDbHaModeOff: jest.Mock; renameAutoStart: jest.Mock };
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
      ensureDbLogin: jest.fn().mockResolvedValue(undefined),
      deleteDbProfile: jest.fn().mockResolvedValue(undefined),
    };

    databaseConfigService = { ensureDbHaModeOff: jest.fn().mockResolvedValue(undefined), renameAutoStart: jest.fn().mockResolvedValue([]) };
    cmsConfigService = {
      getAllSystemParam: jest.fn().mockResolvedValue({ conflist: [{ confdata: ['[service]', 'server=demodb'] }] }),
      setSystemParam: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseManagementService,
        {
          provide: CmsConfigService,
          useValue: cmsConfigService,
        },
        {
          provide: DatabaseConfigService,
          useValue: databaseConfigService,
        },
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
    databaseUserService = mockDatabaseUserService;

    configService = module.get(DatabaseConfigService);

    // Setup default mocks
    hostService.findHostInternal.mockResolvedValue(mockHost);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('copyDb', () => {
    const request: CopyDbRequest = {
      srcdbname: 'source', destdbname: 'clone', destdbpath: '/copy',
      exvolpath: '/copy', logpath: '/copy', overwrite: 'n', move: 'n', advanced: 'on',
      volume: [{ '/z/source': '/copy/clone' }, { '/a/extra': '/copy/clone_x001' }],
    };

    it('preserves physical mapping order and sends one key per CMS volume object', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ task: 'copydb', status: 'success', note: 'none' });
      await service.copyDb(mockUserId, mockHostUid, {
        ...request, volume: [{ '/z/source': '/copy/clone', '/a/extra': '/copy/clone_x001' }],
      });
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String), expect.objectContaining({ advanced: 'on', volume: request.volume }), expect.any(Object)
      );
    });

    it('normalizes the supported advanced=y alias to CMS advanced=on', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ task: 'copydb', status: 'success', note: 'none' });
      await service.copyDb(mockUserId, mockHostUid, { ...request, advanced: 'y' });
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String), expect.objectContaining({ advanced: 'on', volume: request.volume }), expect.any(Object)
      );
    });

    it.each([
      undefined, [], [{}], [null], [{ '/db/source': '' }], [{ '/db/source': 123 }],
      [{ '/db/source': '/copy/clone' }, { '/db/source': '/copy/other' }],
      [{ '/db/source': '/copy/clone' }, { '/db/extra': '/copy/clone' }],
    ].map(volume => [volume]))('rejects invalid advanced mappings before CMS is called: %j', async volume => {
      await expect(service.copyDbCmsResponse(mockUserId, mockHostUid, {
        ...request, volume: volume as CopyDbRequest['volume'],
      })).rejects.toThrow(DatabaseError);
      expect(databaseUserService.ensureDbLogin).not.toHaveBeenCalled();
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it.each([
      ['/copy/clone', '/copy/./clone'],
      ['/copy/clone', '/copy/sub/../clone'],
      ['/copy/clone', '/copy//clone'],
      ['C:\\copy\\clone', 'c:/copy/./clone'],
      ['C:\\copy\\clone', 'C:\\COPY\\sub\\..\\clone'],
      ['\\\\server\\share\\copy\\clone', '\\\\SERVER\\share\\copy\\.\\clone'],
    ])('rejects aliased destinations before CMS: %s and %s', async (first, second) => {
      await expect(service.copyDbCmsResponse(mockUserId, mockHostUid, {
        ...request, volume: [{ '/db/source': first }, { '/db/extra': second }],
      })).rejects.toThrow(DatabaseError);
      expect(databaseUserService.ensureDbLogin).not.toHaveBeenCalled();
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('rejects aliased source paths before CMS', async () => {
      await expect(service.copyDbCmsResponse(mockUserId, mockHostUid, {
        ...request, volume: [{ '/db/source': '/copy/clone' }, { '/db/./source': '/copy/extra' }],
      })).rejects.toThrow(DatabaseError);
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('preserves valid POSIX paths, including case-distinct filenames, in the CMS request', async () => {
      const volume = [{ '/db/source': '/copy/./Clone' }, { '/db/extra': '/copy/sub/../clone' }];
      cmsClient.postAuthenticated.mockResolvedValue({ task: 'copydb', status: 'success', note: 'none' });
      await service.copyDb(mockUserId, mockHostUid, { ...request, volume });
      expect(cmsClient.postAuthenticated.mock.calls[0][1]).toEqual(expect.objectContaining({ volume }));
    });

    it.each(['on', 'off'])('rejects copying onto the source before CMS is called (advanced=%s)', async advanced => {
      await expect(service.copyDbCmsResponse(mockUserId, mockHostUid, {
        ...request, destdbname: ' source ', advanced, overwrite: 'y',
      })).rejects.toThrow(DatabaseError);
      expect(databaseUserService.ensureDbLogin).not.toHaveBeenCalled();
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('omits mappings for normal copy', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ task: 'copydb', status: 'success', note: 'none' });
      await service.copyDb(mockUserId, mockHostUid, { ...request, advanced: 'off' });
      expect(cmsClient.postAuthenticated.mock.calls[0][1]).not.toHaveProperty('volume');
    });
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
          expect(err.additionalData?.message).toMatch(/did not finish within/);
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
          expect(err.additionalData?.message).toMatch(/did not finish within/);
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

  describe('copyDb guards and bookkeeping', () => {
    const copyReq = {
      srcdbname: 'srcdb', destdbname: 'newdb', destdbpath: '/db/newdb', exvolpath: '/db/newdb', logpath: '/db/newdb',
      overwrite: 'n', move: 'n', advanced: 'off',
    };

    it.each([
      ['its own source', [{ '/db/srcdb/srcdb': '/db/srcdb/srcdb' }]],
      ['another volume\'s source', [{ '/db/srcdb/srcdb': '/db/srcdb/srcdb_x001' }, { '/db/srcdb/srcdb_x001': '/copy/newdb_x001' }]],
      ['a source written another way', [{ '/db/srcdb/srcdb': '/copy/newdb' }, { '/db/srcdb/srcdb_x001': '/db/srcdb/./srcdb' }]],
    ])('refuses a target that is %s, before calling CMS', async (_label, volume) => {
      await expect(service.copyDbCmsResponse(mockUserId, mockHostUid, { ...copyReq, advanced: 'on', volume }))
        .rejects.toMatchObject({ code: 'INVALID_PARAMETER', additionalData: { reason: 'COPY_VOLUME_ONTO_SOURCE' } });
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('refuses "delete source" for an HA database', async () => {
      const info = (service as any).databaseInfoService;
      info.effectiveHaDbForDbname.mockResolvedValueOnce(true);
      await expect(service.copyDbCmsResponse(mockUserId, mockHostUid, { ...copyReq, move: 'y' }))
        .rejects.toMatchObject({ code: 'RENAME_NOT_SUPPORTED_FOR_HA_DATABASE' });
    });

    it('marks the copy ha_mode=off on an HA-configured host, and nothing else for a plain copy', async () => {
      cmsConfigService.getAllSystemParam.mockResolvedValue({ conflist: [{ confdata: ['[common]', 'ha_mode=on'] }] });

      await service.finishCopy(mockUserId, mockHostUid, copyReq as any);

      expect(databaseConfigService.ensureDbHaModeOff).toHaveBeenCalledWith(mockUserId, mockHostUid, 'newdb');
      expect(cmsConfigService.setSystemParam).not.toHaveBeenCalled();
    });

    it('treats "delete source" as a rename of the source in cubrid.conf', async () => {
      cmsConfigService.getAllSystemParam.mockResolvedValue({ conflist: [{ confdata: ['[service]', 'server=srcdb'] }] });

      const warnings = await service.finishCopy(mockUserId, mockHostUid, { ...copyReq, move: 'y' } as any);

      expect(databaseConfigService.renameAutoStart).toHaveBeenCalledWith(mockUserId, mockHostUid, 'srcdb', 'newdb');
      expect(databaseConfigService.ensureDbHaModeOff).not.toHaveBeenCalled();
      expect(warnings).toEqual([]);
    });

    it('reports a cubrid.conf failure after "delete source" as a warning, not a failure', async () => {
      databaseConfigService.renameAutoStart.mockRejectedValueOnce(new Error('write failed'));

      const warnings = await service.finishCopy(mockUserId, mockHostUid, { ...copyReq, move: 'y' } as any);

      expect(warnings).toEqual([expect.objectContaining({
        code: 'RENAME_AUTOSTART_NOT_UPDATED',
        oldName: 'srcdb',
        newName: 'newdb',
        message: expect.stringContaining('could not be updated'),
      })]);
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

    it('updates autostart only after a successful physical rename', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      await service.renameDatabase(mockUserId, mockHostUid, mockDbname, {
        rename: 'newdb', exvolpath: 'none', advanced: 'off', forcedel: 'n',
      });
      expect(configService.renameAutoStart).toHaveBeenCalledWith(mockUserId, mockHostUid, mockDbname, 'newdb');
      expect(cmsClient.postAuthenticated.mock.invocationCallOrder[0]).toBeLessThan(configService.renameAutoStart.mock.invocationCallOrder[0]);
    });

    it('returns a warning without failing or resubmitting an already committed rename', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      configService.renameAutoStart.mockRejectedValue(new Error('config write failed'));
      const result = await service.renameDatabase(mockUserId, mockHostUid, mockDbname, {
        rename: 'newdb', exvolpath: 'none', advanced: 'off', forcedel: 'n',
      });
      expect(result.warnings?.[0]).toContain('Do not repeat the rename');
      expect(cmsClient.postAuthenticated).toHaveBeenCalledTimes(1);
    });

    it('does not change autostart after a failed CMS rename', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ status: 'failure', task: 'renamedb', note: 'rename failed' });
      await expect(service.renameDatabase(mockUserId, mockHostUid, mockDbname, {
        rename: 'newdb', exvolpath: 'none', advanced: 'off', forcedel: 'n',
      })).rejects.toThrow();
      expect(configService.renameAutoStart).not.toHaveBeenCalled();
    });

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

    it('passes on the warnings of the cubrid.conf rename (e.g. a [@new] section already there)', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      databaseConfigService.renameAutoStart.mockResolvedValueOnce([{ code: 'RENAME_SECTION_KEPT', oldName: 'old', newName: 'new', message: 'kept [@old]' }]);

      const result = await service.renameDatabase(mockUserId, mockHostUid, mockDbname, {
        rename: 'renamed_db', exvolpath: 'none', advanced: 'off', forcedel: 'n',
      });

      expect(databaseConfigService.renameAutoStart).toHaveBeenCalledWith(mockUserId, mockHostUid, mockDbname, 'renamed_db');
      expect(result.warnings).toEqual(['kept [@old]']);
      expect(result.warningDetails).toEqual([{ code: 'RENAME_SECTION_KEPT', oldName: 'old', newName: 'new' }]);
    });

    it('leaves cubrid.conf alone when nothing in it names the database', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      await service.renameDatabase(mockUserId, mockHostUid, mockDbname, {
        rename: 'renamed_db', exvolpath: 'none', advanced: 'off', forcedel: 'n',
      });

      expect(cmsConfigService.setSystemParam).not.toHaveBeenCalled();
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

    it('clears the stored login profile + dbmt-login cache for both the old and new name, so neither can inherit a stale previous database', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);
      const request: RenameDatabaseRequest = {
        rename: 'renamed_db',
        exvolpath: 'none',
        advanced: 'off',
        forcedel: 'n',
      };

      await service.renameDatabase(mockUserId, mockHostUid, mockDbname, request);

      expect(databaseUserService.deleteDbProfile).toHaveBeenCalledWith(mockUserId, mockHostUid, mockDbname);
      expect(databaseUserService.deleteDbProfile).toHaveBeenCalledWith(mockUserId, mockHostUid, 'renamed_db');
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
          expect(err.additionalData?.message).toMatch(/did not finish within/);
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
          expect(err.additionalData?.message).toMatch(/did not finish within/);
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

    it('returns only the grouped locks when asked for a summary', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      const result = await service.lockDatabase(mockUserId, mockHostUid, mockDbname, { summary: true });

      expect(result).not.toHaveProperty('lockinfo');
      expect(result.overview).toMatchObject({ esc: '100000', dinterval: '1.00' });
      expect(result.summary?.totalLocks).toBeGreaterThan(0);
      expect(result.summary?.rows).toEqual(
        expect.arrayContaining([expect.objectContaining({ index: '1', obj: 'Class = code', mode: 'IS_LOCK', count: 1 })])
      );
    });

    it('returns one row per locked object when asked for objects', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      const result = await service.lockDatabase(mockUserId, mockHostUid, mockDbname, { objects: true });

      expect(result).not.toHaveProperty('lockinfo');
      expect(result.objects?.[0]).toEqual({
        oid: '0|201|-32763',
        obj: 'Class = code',
        holders: [{ index: '1', mode: 'IS_LOCK', count: '1' }],
        numHolders: '1',
        numBlockedHolders: '0',
        numWaiters: '0',
      });
      expect(result.objects?.[1]).toMatchObject({ oid: '0|833|2', holders: [], numHolders: '-' });
    });

    it('returns the summary and the per-object rows from a single lockdb', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      const result = await service.lockDatabase(mockUserId, mockHostUid, mockDbname, { summary: true, objects: true });

      expect(cmsClient.postAuthenticated).toHaveBeenCalledTimes(1);
      expect(result).not.toHaveProperty('lockinfo');
      expect(result.summary?.totalLocks).toBeGreaterThan(0);
      expect(result.overview).toMatchObject({ esc: '100000' });
      expect(result.objects?.[0]).toMatchObject({ oid: '0|201|-32763' });
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
