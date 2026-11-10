import { Test, TestingModule } from '@nestjs/testing';
import { CmsUserService } from './cms-user.service';
import { HostService } from '@host';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { CmsError } from '@error/cms/cms-error';

jest.mock('@common', () => ({
  ...jest.requireActual('@common'),
  checkCmsTokenError: jest.fn(),
  checkCmsStatusError: jest.fn(),
}));

describe('CmsUserService', () => {
  let service: CmsUserService;
  let hostService: jest.Mocked<HostService>;
  let cmsClient: jest.Mocked<CmsHttpsClientService>;

  const mockHost = {
    uid: 'host-uid-1',
    // Connected as the CMS admin account: the one that may manage users.
    id: 'admin',
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CmsUserService,
        { provide: HostService, useValue: mockHostService },
        { provide: CmsHttpsClientService, useValue: mockCmsClient },
      ],
    }).compile();

    service = module.get(CmsUserService);
    hostService = module.get(HostService);
    cmsClient = module.get(CmsHttpsClientService);

    hostService.findHostInternal.mockResolvedValue(mockHost as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // CMS asks only for the DB-create authority on these tasks; CUBRID Admin
  // allows them on the `admin` account alone, and so does this server.
  describe('on a host not connected as the CMS admin account', () => {
    const operator = { ...mockHost, id: 'operator' };
    const refused = { code: 'CMS_ADMIN_REQUIRED', additionalData: { hostUid: mockHostUid, username: 'operator' } };

    beforeEach(() => {
      hostService.findHostInternal.mockResolvedValue(operator as any);
      cmsClient.postAuthenticated.mockResolvedValue({ status: 'success', userlist: [], dblist: [] });
    });

    it('refuses to add, update or delete a user without asking CMS', async () => {
      const request = { targetid: 'someone', password: 'x', casauth: 'none', dbcreate: 'none', statusmonitorauth: 'none' };
      await expect(service.addDbmtUser(mockUserId, mockHostUid, request)).rejects.toMatchObject(refused);
      await expect(service.updateDbmtUser(mockUserId, mockHostUid, { targetid: 'someone', dbauth: [], casauth: 'none', dbcreate: 'none', statusmonitorauth: 'none' })).rejects.toMatchObject(refused);
      await expect(service.deleteDbmtUser(mockUserId, mockHostUid, 'someone')).rejects.toMatchObject(refused);
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('refuses another user\'s password but lets the account change its own', async () => {
      await expect(service.setDbmtPasswd(mockUserId, mockHostUid, 'someone', 'new')).rejects.toMatchObject(refused);
      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();

      await expect(service.setDbmtPasswd(mockUserId, mockHostUid, 'operator', 'new')).resolves.toEqual({ success: true });
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ task: 'setdbmtpasswd', targetid: 'operator' })
      );
    });

    it('still reads the user list', async () => {
      await expect(service.getDbmtUserInfo(mockUserId, mockHostUid)).resolves.toEqual({ dblist: [], userlist: [] });
    });

    it('is case-sensitive about the admin account, as CUBRID Admin is', async () => {
      hostService.findHostInternal.mockResolvedValue({ ...mockHost, id: 'ADMIN' } as any);
      await expect(service.deleteDbmtUser(mockUserId, mockHostUid, 'someone')).rejects.toMatchObject({ code: 'CMS_ADMIN_REQUIRED' });
    });
  });

  describe('addDbmtUser', () => {
    const mockRequest = {
      targetid: 'create_test',
      password: '1234',
      casauth: 'none',
      dbcreate: 'none',
      statusmonitorauth: 'none',
    };

    it('should send adddbmtuser and return dblist and userlist', async () => {
      const mockResponse = {
        __EXEC_TIME: '2 ms',
        note: 'none',
        status: 'success',
        task: 'adddbmtuser',
        dblist: [
          { dbs: [{ dbname: 'test2' }, { dbname: 'test' }, { dbname: 'demodb' }] },
          { dbs: [{ dbname: 'test2' }, { dbname: 'test' }, { dbname: 'demodb' }] },
        ],
        userlist: [
          { user: [{ '@id': 'create_test', casauth: 'none', dbauth: null, dbcreate: 'none', statusmonitorauth: 'none' }] },
          { user: [{ '@id': 'create_test', casauth: 'none', dbauth: null, dbcreate: 'none', statusmonitorauth: 'none' }] },
        ],
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
      expect(result).toEqual({ dblist: mockResponse.dblist, userlist: mockResponse.userlist });
    });

    it('should throw CmsError when status is not success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'fail',
        status: 'fail',
        task: 'adddbmtuser',
      });

      await expect(
        service.addDbmtUser(mockUserId, mockHostUid, mockRequest)
      ).rejects.toThrow(CmsError);
    });
  });

  describe('getDbmtUserInfo', () => {
    it('should send getdbmtuserinfo and return dblist and userlist', async () => {
      const mockResponse = {
        __EXEC_TIME: '0 ms',
        note: 'none',
        status: 'success',
        task: 'getdbmtuserinfo',
        dblist: [{ dbs: [{ dbname: 'demodb' }] }],
        userlist: [{ user: [{ '@id': 'admin' }] }],
      };
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.getDbmtUserInfo(mockUserId, mockHostUid);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ task: 'getdbmtuserinfo' })
      );
      expect(result).toEqual({ dblist: mockResponse.dblist, userlist: mockResponse.userlist });
    });

    it('should throw CmsError when status is not success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'fail',
        status: 'fail',
        task: 'getdbmtuserinfo',
      });

      await expect(service.getDbmtUserInfo(mockUserId, mockHostUid)).rejects.toThrow(
        CmsError
      );
    });
  });

  describe('updateDbmtUser', () => {
    const request = {
      targetid: 'test_target',
      dbauth: [] as unknown[],
      casauth: 'none',
      dbcreate: 'none',
      statusmonitorauth: 'none',
    };

    it('should send updatedbmtuser and return dblist and userlist', async () => {
      const mockResponse = {
        __EXEC_TIME: '0 ms',
        note: 'none',
        status: 'success',
        task: 'updatedbmtuser',
        dblist: [{ dbs: [] }],
        userlist: [{ user: [] }],
      };
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.updateDbmtUser(mockUserId, mockHostUid, request);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'updatedbmtuser',
          targetid: 'test_target',
          dbauth: [],
          casauth: 'none',
          dbcreate: 'none',
          statusmonitorauth: 'none',
        })
      );
      expect(result).toEqual({ dblist: mockResponse.dblist, userlist: mockResponse.userlist });
    });

    it('should throw CmsError when status is not success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'fail',
        status: 'fail',
        task: 'updatedbmtuser',
      });

      await expect(
        service.updateDbmtUser(mockUserId, mockHostUid, request)
      ).rejects.toThrow(CmsError);
    });
  });

  describe('deleteDbmtUser', () => {
    it('should send deletedbmtuser and return dblist and userlist', async () => {
      const mockResponse = {
        __EXEC_TIME: '1 ms',
        note: 'none',
        status: 'success',
        task: 'deletedbmtuser',
        dblist: [{ dbs: [] }],
        userlist: [{ user: [] }],
      };
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.deleteDbmtUser(mockUserId, mockHostUid, 'test_user_2');

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ task: 'deletedbmtuser', targetid: 'test_user_2' })
      );
      expect(result).toEqual({ dblist: mockResponse.dblist, userlist: mockResponse.userlist });
    });

    it('should throw CmsError when status is not success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'fail',
        status: 'fail',
        task: 'deletedbmtuser',
      });

      await expect(
        service.deleteDbmtUser(mockUserId, mockHostUid, 'test_user_2')
      ).rejects.toThrow(CmsError);
    });
  });

  describe('setDbmtPasswd', () => {
    it('should send setdbmtpasswd and return { success: true }', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '72 ms',
        note: 'none',
        status: 'success',
        task: 'setdbmtpasswd',
      });

      const result = await service.setDbmtPasswd(
        mockUserId,
        mockHostUid,
        'yifan',
        '1111'
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'setdbmtpasswd',
          targetid: 'yifan',
          newpassword: '1111',
        })
      );
      expect(result).toEqual({ success: true });
    });

    it('should throw CmsError when status is not success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'fail',
        status: 'fail',
        task: 'setdbmtpasswd',
      });

      await expect(
        service.setDbmtPasswd(mockUserId, mockHostUid, 'yifan', '1111')
      ).rejects.toThrow(CmsError);
    });
  });
});
