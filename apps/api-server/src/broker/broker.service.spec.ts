import { Test, TestingModule } from '@nestjs/testing';
import { BrokerService } from './broker.service';
import { HostService } from '@host';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { CmsJobLockService } from '@cms-job/cms-job-lock.service';
import { CmsError } from '@error/cms/cms-error';

jest.mock('@common', () => ({
  ...jest.requireActual('@common'),
  checkCmsTokenError: jest.fn(),
  checkCmsStatusError: jest.fn(),
}));

describe('BrokerService', () => {
  let service: BrokerService;
  let hostService: jest.Mocked<HostService>;
  let cmsClient: jest.Mocked<CmsHttpsClientService>;
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

  beforeEach(async () => {
    const mockHostService = { findHostInternal: jest.fn() };
    const mockCmsClient = { postAuthenticated: jest.fn() };
    const mockCmsJobLockService = { hasActiveJobForHost: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrokerService,
        { provide: HostService, useValue: mockHostService },
        { provide: CmsHttpsClientService, useValue: mockCmsClient },
        { provide: CmsJobLockService, useValue: mockCmsJobLockService },
      ],
    }).compile();

    service = module.get(BrokerService);
    hostService = module.get(HostService);
    cmsClient = module.get(CmsHttpsClientService);
    cmsJobLockService = module.get(CmsJobLockService);

    hostService.findHostInternal.mockResolvedValue(mockHost);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startAllBrokers', () => {
    it('should send startbroker task and return { success: true }', async () => {
      const mockResponse = {
        __EXEC_TIME: '72 ms',
        note: 'none',
        status: 'success',
        task: 'startbroker',
      };
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.startAllBrokers(mockUserId, mockHostUid);

      expect(hostService.findHostInternal).toHaveBeenCalledWith(
        mockUserId,
        mockHostUid
      );
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        `https://${mockHost.address}:${mockHost.port}/cm_api`,
        expect.objectContaining({
          task: 'startbroker',
          token: mockHost.token,
        }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual({ success: true });
    });

    it('should throw CmsError when CMS status is not success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'failed',
        status: 'fail',
        task: 'startbroker',
      });

      await expect(
        service.startAllBrokers(mockUserId, mockHostUid)
      ).rejects.toThrow(CmsError);
    });

    it('should throw when a CMS job is already running on this host', async () => {
      cmsJobLockService.hasActiveJobForHost.mockResolvedValue({ jobId: 'job-1', dbname: 'demodb' });

      await expect(service.startAllBrokers(mockUserId, mockHostUid)).rejects.toThrow();
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });
  });

  describe('stopAllBrokers', () => {
    it('should send stopbroker task and return { success: true }', async () => {
      const mockResponse = {
        __EXEC_TIME: '72 ms',
        note: 'none',
        status: 'success',
        task: 'stopbroker',
      };
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.stopAllBrokers(mockUserId, mockHostUid);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'stopbroker',
          token: mockHost.token,
        }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result).toEqual({ success: true });
    });

    it('should throw CmsError when CMS status is not success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'failed',
        status: 'fail',
        task: 'stopbroker',
      });

      await expect(
        service.stopAllBrokers(mockUserId, mockHostUid)
      ).rejects.toThrow(CmsError);
    });
  });

  describe('addDbmtUser', () => {
    const mockRequest = {
      targetid: 'test_user_2',
      password: '1234',
      casauth: 'none',
      dbcreate: 'none',
      statusmonitorauth: 'none',
    };

    it('should send adddbmtuser task and return dblist and userlist', async () => {
      const mockResponse = {
        __EXEC_TIME: '1 ms',
        note: 'none',
        status: 'success',
        task: 'adddbmtuser',
        dblist: [{ dbs: [{ dbname: 'test' }] }],
        userlist: [{ user: [{ '@id': 'test_user_2' }] }],
      };
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.addDbmtUser(mockUserId, mockHostUid, mockRequest);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'adddbmtuser',
          targetid: mockRequest.targetid,
          password: mockRequest.password,
          casauth: mockRequest.casauth,
          dbcreate: mockRequest.dbcreate,
          statusmonitorauth: mockRequest.statusmonitorauth,
        })
      );
      expect(result).toEqual({
        dblist: mockResponse.dblist,
        userlist: mockResponse.userlist,
      });
    });

    it('should throw CmsError when CMS status is not success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'failed',
        status: 'fail',
        task: 'adddbmtuser',
      });

      await expect(
        service.addDbmtUser(mockUserId, mockHostUid, mockRequest)
      ).rejects.toThrow(CmsError);
    });
  });

  describe('updateDbmtUser', () => {
    const mockRequest = {
      targetid: 'test_user_2',
      dbauth: [] as unknown[],
      casauth: 'none',
      dbcreate: 'none',
      statusmonitorauth: 'none',
    };

    it('should send updatedbmtuser task and return dblist and userlist', async () => {
      const mockResponse = {
        __EXEC_TIME: '0 ms',
        note: 'none',
        status: 'success',
        task: 'updatedbmtuser',
        dblist: [{ dbs: [{ dbname: 'test' }] }],
        userlist: [{ user: [{ '@id': 'test_user_2' }] }],
      };
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.updateDbmtUser(mockUserId, mockHostUid, mockRequest);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'updatedbmtuser',
          targetid: mockRequest.targetid,
          dbauth: mockRequest.dbauth,
          casauth: mockRequest.casauth,
          dbcreate: mockRequest.dbcreate,
          statusmonitorauth: mockRequest.statusmonitorauth,
        })
      );
      expect(result).toEqual({
        dblist: mockResponse.dblist,
        userlist: mockResponse.userlist,
      });
    });

    it('should throw CmsError when CMS status is not success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'failed',
        status: 'fail',
        task: 'updatedbmtuser',
      });

      await expect(
        service.updateDbmtUser(mockUserId, mockHostUid, mockRequest)
      ).rejects.toThrow(CmsError);
    });
  });
});
