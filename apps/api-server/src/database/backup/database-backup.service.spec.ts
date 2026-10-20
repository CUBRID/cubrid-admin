import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseBackupService } from './database-backup.service';
import { HostService } from '@host';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import {
  AddBackupInfoClientRequest,
  SetBackupInfoClientRequest,
  BackupDbListClientRequest,
  RestoreDbClientRequest,
} from '@api-interfaces';
import { DatabaseError } from '@error/database/database-error';
import { DatabaseUserService } from '@database/user/database-user.service';
import { DatabaseInfoService } from '@database/info/database-info.service';
import { HostError } from '@error/index';
import { CmsError } from '@error/cms/cms-error';


describe('DatabaseBackupService', () => {
  let service: DatabaseBackupService;
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

  beforeEach(async () => {
    const mockHostService = {
      findHostInternal: jest.fn(),
    };

    const mockCmsClient = {
      postAuthenticated: jest.fn(),
    };

    const mockDatabaseUserService = {
      ensureDbLogin: jest.fn().mockResolvedValue({ reauthenticated: false }),
    };

    const mockDatabaseInfoService = {
      effectiveHaDbForDbname: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseBackupService,
        {
          provide: HostService,
          useValue: mockHostService,
        },
        {
          provide: CmsHttpsClientService,
          useValue: mockCmsClient,
        },
        {
          provide: DatabaseUserService,
          useValue: mockDatabaseUserService,
        },
        {
          provide: DatabaseInfoService,
          useValue: mockDatabaseInfoService,
        },
      ],
    }).compile();

    service = module.get<DatabaseBackupService>(DatabaseBackupService);
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

  describe('addBackupSchedule', () => {
    const mockRequest: AddBackupInfoClientRequest = {
      dbname: mockDbname,
      backupid: 'test_backup',
      path: '/path/to/backup',
      period_type: 'daily',
      period_date: '1',
      time: '02:00',
      level: '0',
      archivedel: 'ON',
      updatestatus: 'ON',
      storeold: 'ON',
      onoff: 'ON',
      zip: 'y',
      check: 'y',
      mt: '0',
      bknum: '0',
    };

    const mockResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'addbackupinfo',
    };

    it('should successfully add backup schedule', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.addBackupSchedule(
        mockUserId,
        mockHostUid,
        mockDbname,
        mockRequest
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'addbackupinfo',
          dbname: mockDbname,
          backupid: mockRequest.backupid,
          path: mockRequest.path,
        })
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('setBackupSchedule', () => {
    const mockRequest: SetBackupInfoClientRequest = {
      dbname: mockDbname,
      backupid: 'test_backup',
      path: '/path/to/backup',
      period_type: 'daily',
      period_date: '1',
      time: '02:00',
      level: '0',
      archivedel: 'ON',
      updatestatus: 'ON',
      storeold: 'ON',
      onoff: 'ON',
      zip: 'y',
      check: 'y',
      mt: '0',
      bknum: '0',
    };

    const mockResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'setbackupinfo',
    };

    it('should successfully set backup schedule', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.setBackupSchedule(
        mockUserId,
        mockHostUid,
        mockDbname,
        mockRequest
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'setbackupinfo',
          dbname: mockDbname,
        })
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('deleteBackupSchedule', () => {
    const mockRequest = {
      dbname: mockDbname,
      backupid: 'test_backup',
    };

    const mockResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'deletebackupinfo',
    };

    it('should successfully delete backup schedule', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.deleteBackupSchedule(
        mockUserId,
        mockHostUid,
        mockDbname,
        mockRequest
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'deletebackupinfo',
          dbname: mockDbname,
          backupid: mockRequest.backupid,
        })
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('getBackupSchedule', () => {
    const mockResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'getbackupinfo',
      dbname: 'testdb',
      backups: [],
    };

    it('should successfully get backup schedule', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.getBackupSchedule(mockUserId, mockHostUid, mockDbname);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'getbackupinfo',
          dbname: mockDbname,
        })
      );
      expect(result).toEqual({
        dbname: 'testdb',
        backups: [],
      });
    });
  });

  describe('getBackupDbInfo', () => {
    const mockRequest = { dbname: mockDbname };

    it('should return backup db info with level0, level1, level2', async () => {
      const mockResponse = {
        __EXEC_TIME: '19 ms',
        dbdir: '/home/cubrid/databases/test/backup',
        freespace: '2068768',
        level0: [
          {
            data: '2026.03.12.09.50',
            path: '/home/cubrid/databases/test/backup/test_backup_lv0_2/test_bk0v000',
            size: '11547648',
          },
        ],
        level1: [
          {
            data: '2026.03.12.09.54',
            path: '/home/cubrid/databases/test/backup/test_backup_lv1_3/test_bk1v000',
            size: '5256192',
          },
        ],
        level2: [
          {
            data: '2026.03.12.10.45',
            path: '/home/cubrid/databases/test/backup/test_backup_lv2/test_bk2v000',
            size: '5256192',
          },
        ],
        note: 'none',
        status: 'success',
        task: 'backupdbinfo',
      };

      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.getBackupDbInfo(
        mockUserId,
        mockHostUid,
        mockRequest
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'backupdbinfo',
          dbname: mockDbname,
        })
      );
      expect(result).toMatchObject({
        dbdir: mockResponse.dbdir,
        freespace: mockResponse.freespace,
        level0: mockResponse.level0,
        level1: mockResponse.level1,
        level2: mockResponse.level2,
      });
    });

    it('should return empty level arrays when no backups exist', async () => {
      const mockResponse = {
        __EXEC_TIME: '5 ms',
        dbdir: '/home/cubrid/databases/test/backup',
        freespace: '2068768',
        note: 'none',
        status: 'success',
        task: 'backupdbinfo',
      };

      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.getBackupDbInfo(
        mockUserId,
        mockHostUid,
        mockRequest
      );

      expect(result.level0).toEqual([]);
      expect(result.level1).toEqual([]);
      expect(result.level2).toEqual([]);
      expect(result.dbdir).toBe(mockResponse.dbdir);
      expect(result.freespace).toBe(mockResponse.freespace);
    });
  });

  describe('getBackupList', () => {
    const mockRequest: BackupDbListClientRequest = { dbname: mockDbname };

    it('should return backup list with level0/level1/level2 (none when empty)', async () => {
      const mockResponse = {
        __EXEC_TIME: '0 ms',
        level0: 'none',
        level1: 'none',
        level2: 'none',
        note: 'none',
        status: 'success',
        task: 'getbackuplist',
      };

      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.getBackupList(mockUserId, mockHostUid, mockRequest);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'getbackuplist',
          dbname: mockDbname,
        })
      );

      expect(result).toEqual({
        level0: 'none',
        level1: 'none',
        level2: 'none',
      });
    });
  });

  describe('backupDb', () => {
    const mockRequest = {
      level: '0' as const,
      backupdir: '/home/cubrid/databases/demodb/backup',
      removelog: 'y' as const,
      check: 'y' as const,
      mt: '2',
      zip: 'y' as const,
      safereplication: 'n' as const,
    };

    it('should successfully execute backup', async () => {
      const mockResponse = {
        __EXEC_TIME: '1412 ms',
        note: 'none',
        status: 'success',
        task: 'backupdb',
      };

      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.backupDb(
        mockUserId,
        mockHostUid,
        mockDbname,
        mockRequest
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'backupdb',
          dbname: mockDbname,
          level: '0',
          backupdir: mockRequest.backupdir,
          removelog: 'y',
          check: 'y',
          mt: '2',
          zip: 'y',
          safereplication: 'n',
          async: 'yes',
        }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual({ success: true });
    });

    it('should use default options when optional fields omitted', async () => {
      const minimalRequest = {
        level: '1' as const,
        backupdir: '/path/to/backup',
      };
      const mockResponse = {
        __EXEC_TIME: '500 ms',
        note: 'none',
        status: 'success',
        task: 'backupdb',
      };

      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      await service.backupDb(mockUserId, mockHostUid, mockDbname, minimalRequest);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'backupdb',
          removelog: 'y',
          check: 'n',
          mt: '0',
          zip: 'n',
          safereplication: 'n',
          async: 'yes',
        }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
    });
  });

  describe('restoreDb', () => {
    const mockRequest: RestoreDbClientRequest = {
      date: '19-03-2026:09:17:46',
      level: '0',
      partial: 'y',
      pathname:
        '/home/cubrid/CUBRID-11.5.0.2103-a598990-Linux.x86_64/databases/test/backup/test_backup_lv0_2/test_bk0v000',
      recoverypath:
        '/home/cubrid/CUBRID-11.5.0.2103-a598990-Linux.x86_64/databases/test',
    };

    it('should successfully restore database', async () => {
      const mockResponse = {
        __EXEC_TIME: '6661 ms',
        note: 'none',
        status: 'success',
        task: 'restoredb',
      };

      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.restoreDb(
        mockUserId,
        mockHostUid,
        mockDbname,
        mockRequest
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'restoredb',
          dbname: mockDbname,
          date: mockRequest.date,
          level: mockRequest.level,
          partial: mockRequest.partial,
          pathname: mockRequest.pathname,
          recoverypath: mockRequest.recoverypath,
          async: 'yes',
        }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );

      expect(result).toEqual({ success: true });
    });
  });

  describe('getAutoBackupDbErrLog', () => {
    const mockRequest = {};

    it('should successfully get auto backup db error log with errors', async () => {
      const mockSuccessResponse = {
        __EXEC_TIME: '0 ms',
        note: 'none',
        status: 'success',
        task: 'getautobackupdberrlog',
        error: [
          {
            backupid: 'test_backup',
            dbname: 'demodb',
            error_desc: 'backupdb(demodb): auto job start',
            error_time: '2026/01/24 15:18:00',
          },
          {
            backupid: 'test_backup',
            dbname: 'demodb',
            error_desc: 'backupdb(demodb): success',
            error_time: '2026/01/24 15:18:00',
          },
        ],
      };

      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      const result = await service.getAutoBackupDbErrLog(
        mockUserId,
        mockHostUid,
        mockRequest
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'getautobackupdberrlog',
          token: mockHost.token,
        })
      );
      expect(result).toEqual({
        error: [
          {
            backupid: 'test_backup',
            dbname: 'demodb',
            error_desc: 'backupdb(demodb): auto job start',
            error_time: '2026/01/24 15:18:00',
          },
          {
            backupid: 'test_backup',
            dbname: 'demodb',
            error_desc: 'backupdb(demodb): success',
            error_time: '2026/01/24 15:18:00',
          },
        ],
      });
    });

    it('should successfully get auto backup db error log with null error', async () => {
      const mockSuccessResponse = {
        __EXEC_TIME: '0 ms',
        note: 'none',
        status: 'success',
        task: 'getautobackupdberrlog',
        error: null,
      };

      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      const result = await service.getAutoBackupDbErrLog(
        mockUserId,
        mockHostUid,
        mockRequest
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'getautobackupdberrlog',
          token: mockHost.token,
        })
      );
      expect(result).toEqual({
        error: null,
      });
    });

    it('should throw HostError if host is not found', async () => {
      hostService.findHostInternal.mockRejectedValue(
        HostError.NoSuchHost({ hostUid: mockHostUid })
      );

      await expect(
        service.getAutoBackupDbErrLog(mockUserId, mockHostUid, mockRequest)
      ).rejects.toThrow(HostError);
    });

    it('should throw CmsError if CMS token error', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'Request is rejected due to invalid token. Please reconnect.',
        status: 'error',
        task: 'getautobackupdberrlog',
      });

      await expect(
        service.getAutoBackupDbErrLog(mockUserId, mockHostUid, mockRequest)
      ).rejects.toThrow(CmsError);
    });

    it('should throw CmsError if CMS status is fail', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'Error log retrieval failed',
        status: 'failed',
        task: 'getautobackupdberrlog',
      });

      await expect(
        service.getAutoBackupDbErrLog(mockUserId, mockHostUid, mockRequest)
      ).rejects.toThrow(CmsError);
    });
  });
});
