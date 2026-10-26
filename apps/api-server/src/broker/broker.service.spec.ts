import { Test, TestingModule } from '@nestjs/testing';
import { BROKER_STATUS_BULK_CHUNK_SIZE, BrokerService } from './broker.service';
import { HostService } from '@host';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { CmsJobLockService } from '@cms-job/cms-job-lock.service';
import { CmsError } from '@error/cms/cms-error';
import { GetBrokerStatusCmsRequest } from '@type';

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
  describe('getBrokerStatusBulk', () => {
    const envelope = { __EXEC_TIME: '1 ms', note: 'none', status: 'success', task: 'getbrokerstatus' };
    const as1 = { as_id: '1', as_num_query: '10', as_num_tran: '2' };

    it('sends one comma-joined getbrokerstatus call and splits the broker blocks', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        ...envelope,
        broker: [
          { bname: 'query_editor', time: 't', asinfo: [as1] },
          { bname: 'broker1', time: 't' },
        ],
      });

      const result = await service.getBrokerStatusBulk(mockUserId, mockHostUid, ['query_editor', 'broker1']);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledTimes(1);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        'https://localhost:8001/cm_api',
        expect.objectContaining({ task: 'getbrokerstatus', bname: 'query_editor,broker1', token: 'test-token' })
      );
      expect(result).toEqual({
        brokers: [
          { bname: 'query_editor', time: 't', asinfo: [as1] },
          { bname: 'broker1', time: 't' },
        ],
      });
    });

    it('normalizes the flat CMS shape returned for a single name', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ ...envelope, bname: 'query_editor', time: 't', asinfo: [as1] });

      const result = await service.getBrokerStatusBulk(mockUserId, mockHostUid, ['query_editor']);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ bname: 'query_editor' })
      );
      expect(result).toEqual({
        brokers: [{ bname: 'query_editor', time: 't', asinfo: [as1], jobinfo: undefined }],
      });
    });

    it(`chunks long lists into ${BROKER_STATUS_BULK_CHUNK_SIZE}-name calls`, async () => {
      const names = Array.from({ length: 120 }, (_, i) => `broker${i}`);
      cmsClient.postAuthenticated.mockImplementation(async (_url, req) => ({
        ...envelope,
        broker: (req as GetBrokerStatusCmsRequest).bname.split(',').map((bname: string) => ({ bname, time: 't' })),
      }));

      const result = await service.getBrokerStatusBulk(mockUserId, mockHostUid, names);

      const sent = cmsClient.postAuthenticated.mock.calls.map(([, req]) => (req as GetBrokerStatusCmsRequest).bname.split(','));
      expect(sent.map((chunk) => chunk.length)).toEqual([50, 50, 20]);
      expect(sent.flat()).toEqual(names);
      expect(result.brokers.map((b) => b.bname)).toEqual(names);
    });

    it('trims, drops empty and duplicate names, and ignores empty broker blocks', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        ...envelope,
        broker: [{ bname: 'a', time: 't' }, { bname: 'b', time: 't' }, { bname: '', time: 't' }],
      });

      const result = await service.getBrokerStatusBulk(mockUserId, mockHostUid, [' a ', '', 'b', 'a']);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ bname: 'a,b' })
      );
      expect(result.brokers.map((b) => b.bname)).toEqual(['a', 'b']);
    });

    it('makes no CMS call when no usable names are given', async () => {
      const result = await service.getBrokerStatusBulk(mockUserId, mockHostUid, ['', '  ']);

      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
      expect(result).toEqual({ brokers: [] });
    });

    it('throws CmsError when CMS status is not success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({ ...envelope, status: 'fail', note: 'failed' });

      await expect(
        service.getBrokerStatusBulk(mockUserId, mockHostUid, ['a', 'b'])
      ).rejects.toThrow(CmsError);
    });
  });
});
