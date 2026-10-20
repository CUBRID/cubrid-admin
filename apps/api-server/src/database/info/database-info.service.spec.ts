import { Test, TestingModule } from '@nestjs/testing';
import type { GetEnvClientResponse } from '@api-interfaces';
import { CMS_CONFNAME_HACONF } from '@database/database.constants';
import { DatabaseInfoService } from './database-info.service';
import { HostService } from '@host';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { CmsConfigService } from '@cms-config/cms-config.service';
import { CmsError } from '@error/cms/cms-error';

// Real GetEnv values (e.g. BROKERVER, CUBRIDVER) vary by host; tests use fixed mock data only.
const mockGetEnvForCreatedb: GetEnvClientResponse = {
  BROKERVER: '11.4',
  CUBRID: '/opt/cubrid',
  CUBRIDVER: '11.4',
  CUBRID_DATABASES: '/opt/cubrid/databases',
  CUBRID_DBMT: '',
  HOSTMONTAB0: '',
  HOSTMONTAB1: '',
  HOSTMONTAB2: '',
  HOSTMONTAB3: '',
  osinfo: 'Linux',
};

jest.mock('@common', () => ({
  ...jest.requireActual('@common'),
  checkCmsTokenError: jest.fn(),
  checkCmsStatusError: jest.fn(),
}));

describe('DatabaseInfoService', () => {
  let service: DatabaseInfoService;
  let hostService: jest.Mocked<HostService>;
  let cmsClient: jest.Mocked<CmsHttpsClientService>;
  let cmsConfigService: jest.Mocked<CmsConfigService>;

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

  beforeEach(async () => {
    const mockHostService = { findHostInternal: jest.fn() };
    const mockCmsClient = { postAuthenticated: jest.fn() };
    const mockCmsConfigService = {
      getEnv: jest.fn(),
      getAllSystemParam: jest.fn().mockResolvedValue({
        conflist: [{ confdata: ['[common]', 'ha_db_list='] }],
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseInfoService,
        { provide: HostService, useValue: mockHostService },
        { provide: CmsHttpsClientService, useValue: mockCmsClient },
        { provide: CmsConfigService, useValue: mockCmsConfigService },
      ],
    }).compile();

    service = module.get(DatabaseInfoService);
    hostService = module.get(HostService);
    cmsClient = module.get(CmsHttpsClientService);
    cmsConfigService = module.get(CmsConfigService);

    hostService.findHostInternal.mockResolvedValue(mockHost);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startInfoInternal', () => {
    it('should return raw CMS startinfo response', async () => {
      const mockResponse = {
        __EXEC_TIME: '10 ms',
        note: 'none',
        status: 'success',
        task: 'startinfo',
        dblist: [{ dbs: [{ dbname: 'testdb' }] }],
        activelist: [{ active: [] }],
      };
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.startInfoInternal(mockUserId, mockHostUid);

      expect(hostService.findHostInternal).toHaveBeenCalledWith(mockUserId, mockHostUid);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ task: 'startinfo' })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw CmsError when CMS status is not success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        status: 'fail',
        task: 'startinfo',
        note: 'failed',
      });

      await expect(
        service.startInfoInternal(mockUserId, mockHostUid)
      ).rejects.toThrow(CmsError);
    });
  });

  describe('startInfo', () => {
    it('should return client start info with isProfileExists', async () => {
      const mockCmsResponse = {
        __EXEC_TIME: '10 ms',
        note: 'none',
        status: 'success',
        task: 'startinfo',
        dblist: [{ dbs: [{ dbname: 'testdb', dbdir: '/path' }] }],
        activelist: [{ active: [{ dbname: 'testdb' }] }],
      };
      cmsClient.postAuthenticated.mockResolvedValue(mockCmsResponse);

      const result = await service.startInfo(mockUserId, mockHostUid);

      expect(cmsConfigService.getAllSystemParam).toHaveBeenCalledWith(
        mockUserId,
        mockHostUid,
        CMS_CONFNAME_HACONF
      );
      expect(result).toEqual({
        activelist: { active: [{ dbname: 'testdb' }] },
        dblist: {
          dbs: [{ dbname: 'testdb', dbdir: '/path', isProfileExists: false }],
        },
        haDbNames: [],
      });
    });
  });

  describe('effectiveHaDbForDbname', () => {
    it('returns false when dbname is not in ha_db_list', async () => {
      cmsConfigService.getAllSystemParam.mockResolvedValue({
        confname: CMS_CONFNAME_HACONF,
        conflist: [{ confdata: ['[common]', 'ha_db_list=demodb,otherdb'] }],
      });

      const result = await service.effectiveHaDbForDbname(mockUserId, mockHostUid, 'testdb');

      expect(cmsConfigService.getAllSystemParam).toHaveBeenCalledWith(
        mockUserId,
        mockHostUid,
        CMS_CONFNAME_HACONF
      );
      expect(result).toBe(false);
    });

    it('returns true when dbname is in ha_db_list', async () => {
      cmsConfigService.getAllSystemParam.mockResolvedValue({
        confname: CMS_CONFNAME_HACONF,
        conflist: [{ confdata: ['[common]', 'ha_db_list=demodb,testdb'] }],
      });

      const result = await service.effectiveHaDbForDbname(mockUserId, mockHostUid, 'testdb');

      expect(result).toBe(true);
    });

    it('returns false when ha_db_list is empty', async () => {
      cmsConfigService.getAllSystemParam.mockResolvedValue({
        confname: CMS_CONFNAME_HACONF,
        conflist: [{ confdata: ['[common]', 'ha_port_id=59901'] }],
      });

      const result = await service.effectiveHaDbForDbname(mockUserId, mockHostUid, 'testdb');

      expect(result).toBe(false);
    });
  });

  describe('getCreatedbInfo', () => {
    it('should return create info from env', async () => {
      cmsConfigService.getEnv.mockResolvedValue(mockGetEnvForCreatedb);

      const result = await service.getCreatedbInfo(mockUserId, mockHostUid);

      expect(cmsConfigService.getEnv).toHaveBeenCalledWith(mockUserId, mockHostUid);
      expect(result).toEqual({
        defaultDbDirectory: '/opt/cubrid/databases',
        cubridVersion: '11.4', // Matches mock CUBRIDVER; not tied to any real deployment version
        cubridPath: '/opt/cubrid',
      });
    });
  });
});
