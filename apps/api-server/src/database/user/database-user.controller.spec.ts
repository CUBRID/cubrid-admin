import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseUserController } from './database-user.controller';
import { DatabaseUserService } from './database-user.service';
import { ValidationError } from '@error/validation/validation-error';

describe('DatabaseUserController', () => {
  let controller: DatabaseUserController;
  let service: jest.Mocked<DatabaseUserService>;

  const mockReq = { user: { sub: 'user-123' } };

  beforeEach(async () => {
    const mockDatabaseUserService = {
      getDatabaseUsers: jest.fn(),
      getUserInfo: jest.fn(),
      userVerify: jest.fn(),
      createUser: jest.fn(),
      deleteUser: jest.fn(),
      loginDatabase: jest.fn(),
      logoutDatabase: jest.fn(),
      updateUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DatabaseUserController],
      providers: [
        {
          provide: DatabaseUserService,
          useValue: mockDatabaseUserService,
        },
      ],
    }).compile();

    controller = module.get(DatabaseUserController);
    service = module.get(DatabaseUserService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getDatabaseUsers', () => {
    it('should call service.getDatabaseUsers and return result', async () => {
      const mockResponse = {
        dbname: 'demodb',
        user: [{ '@id': '163810704', '@name': 'PUBLIC' }],
      };
      service.getDatabaseUsers.mockResolvedValue(mockResponse);

      const result = await controller.getDatabaseUsers(
        mockReq,
        'host-uid-1',
        'demodb'
      );

      expect(service.getDatabaseUsers).toHaveBeenCalledWith(
        'user-123',
        'host-uid-1',
        'demodb'
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw ValidationError when dbname is missing', async () => {
      await expect(
        controller.getDatabaseUsers(mockReq, 'host-uid-1', undefined as unknown as string)
      ).rejects.toThrow(ValidationError);
      expect(service.getDatabaseUsers).not.toHaveBeenCalled();
    });
  });

  describe('getUserInfo', () => {
    it('should call service.getUserInfo and return dbname and user list', async () => {
      const mockResponse = {
        dbname: 'demodb',
        user: [{ '@id': '163810704', '@name': 'PUBLIC' }],
      };
      service.getUserInfo.mockResolvedValue(mockResponse);

      const result = await controller.getUserInfo(
        mockReq,
        'host-uid-1',
        'demodb'
      );

      expect(service.getUserInfo).toHaveBeenCalledWith(
        'user-123',
        'host-uid-1',
        'demodb'
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('userVerify', () => {
    it('should call service.userVerify and return { verified: true }', async () => {
      const body = { dbname: 'demodb', dbuser: 'dba', dbpasswd: '' };
      service.userVerify.mockResolvedValue({ verified: true });

      const result = await controller.userVerify(mockReq, 'host-uid-1', body);

      expect(service.userVerify).toHaveBeenCalledWith(
        'user-123',
        'host-uid-1',
        'demodb',
        'dba',
        ''
      );
      expect(result).toEqual({ verified: true });
    });
  });

  describe('createUser', () => {
    it('should call service.createUser and return empty object', async () => {
      const body = {
        dbname: 'demodb',
        username: 'yifan',
        userpass: '1111',
        groups: { group: ['public'] },
        authorization: [],
      };
      service.createUser.mockResolvedValue({ success: true });

      const result = await controller.createUser(mockReq, 'host-uid-1', body);

      expect(service.createUser).toHaveBeenCalledWith(
        'user-123',
        'host-uid-1',
        body.dbname,
        body.username,
        body.userpass,
        body.groups,
        body.authorization
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('deleteUser', () => {
    it('should call service.deleteUser and return empty object', async () => {
      service.deleteUser.mockResolvedValue({ success: true });

      const result = await controller.deleteUser(
        mockReq,
        'host-uid-1',
        'demodb',
        'yifan'
      );

      expect(service.deleteUser).toHaveBeenCalledWith(
        'user-123',
        'host-uid-1',
        'demodb',
        'yifan'
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('updateUser', () => {
    it('should call service.updateUser and return empty object', async () => {
      const body = {
        userpass: '1111',
        groups: { group: ['public'] },
        authorization: [],
      };
      service.updateUser.mockResolvedValue({ success: true });

      const result = await controller.updateUser(
        mockReq,
        'host-uid-1',
        'demodb',
        'yifan',
        body
      );

      expect(service.updateUser).toHaveBeenCalledWith(
        'user-123',
        'host-uid-1',
        'demodb',
        'yifan',
        body.userpass,
        body.groups,
        body.authorization
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('loginDatabase', () => {
    it('should call service.loginDatabase with id and password when body has them', async () => {
      const body = { id: 'dba', password: 'pass' };
      service.loginDatabase.mockResolvedValue(true);

      const result = await controller.loginDatabase(
        mockReq,
        'host-uid-1',
        'demodb',
        body
      );

      expect(service.loginDatabase).toHaveBeenCalledWith(
        'user-123',
        'host-uid-1',
        'demodb',
        'dba',
        'pass'
      );
      expect(result).toBe(true);
    });

    // id/password validation is enforced by the global ValidationPipe
    // against DatabaseLoginBodyDto's class-validator decorators — that only
    // runs on real HTTP requests, not on a direct controller method call
    // (see createValidationPipe()), so it isn't unit-testable here the way
    // getDatabaseUsers's inline validateRequiredFields() call is above.
  });

  describe('loginDatabaseWithProfile', () => {
    it('should call service.loginDatabase without credentials', async () => {
      service.loginDatabase.mockResolvedValue(true);

      const result = await controller.loginDatabaseWithProfile(
        mockReq,
        'host-uid-1',
        'demodb'
      );

      expect(service.loginDatabase).toHaveBeenCalledWith('user-123', 'host-uid-1', 'demodb');
      expect(result).toBe(true);
    });
  });

  describe('logoutDatabase', () => {
    it('should call service.logoutDatabase and return success', async () => {
      service.logoutDatabase.mockResolvedValue(undefined);

      const result = await controller.logoutDatabase(mockReq, 'host-uid-1', 'demodb');

      expect(service.logoutDatabase).toHaveBeenCalledWith('user-123', 'host-uid-1', 'demodb');
      expect(result).toEqual({ success: true });
    });
  });
});
