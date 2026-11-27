import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { UserRepositoryService } from '@repository';
import { PasswordService } from '@security';
import { AccountAccessService } from '@account/account-access.service';
import { UserError } from '@error/user/user-error';
import {
  ChangePasswordRequest,
  DeleteUserRequest,
  UpdateUserInfoRequest,
} from '@api-interfaces';
import { User, UpdateUserDto, UserPreferenceDto } from '@type/index';
import * as util from '@util';

// The session a request came with: version 0, from before account ids were in tokens.
const SESSION = { sessionVersion: 0 };

describe('UserService', () => {
  let service: UserService;
  let repository: jest.Mocked<UserRepositoryService>;
  let passwordService: jest.Mocked<PasswordService>;

  const createMockUser = (): User => ({
    uuid: 'user-123',
    id: 'testuser',
    password: 'hashed-password',
    department: 'IT',
    host_groups: {},
    ha_mon_list: {},
    resource_mon_list: {},
    user_preference: {
      dashboardInterval: 10,
      brokerStatusInterval: 20,
    },
  });

  let mockUser: User;

  beforeEach(async () => {
    mockUser = createMockUser();
    const mockRepository = {
      loadUserById: jest.fn(),
      atomicUpdateUser: jest.fn(),
      deleteUser: jest.fn(),
      listUsers: jest.fn().mockResolvedValue([]),
    };

    const mockPasswordService = {
      comparePlainAndHash: jest.fn(),
      getHashedValue: jest.fn(),
    };

    const isAdmin = (u: User) => u.role === 'admin';
    const mockAccountAccess = {
      isAdmin: jest.fn(isAdmin),
      isActiveAdmin: jest.fn((u: User) => isAdmin(u) && u.status !== 'disabled'),
      invalidate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: UserRepositoryService,
          useValue: mockRepository,
        },
        {
          provide: PasswordService,
          useValue: mockPasswordService,
        },
        { provide: AccountAccessService, useValue: mockAccountAccess },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    repository = module.get(UserRepositoryService);
    passwordService = module.get(PasswordService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('changePassword', () => {
    const mockUserId = 'user-123';
    const mockRequest: ChangePasswordRequest = {
      oldPassword: 'old-password',
      newPassword: 'new-password',
    };

    it('should successfully change password when old password is correct', async () => {
      const passwordValidityCheckerSpy = jest
        .spyOn(util, 'passwordValidityChecker')
        .mockReturnValue(true);

      const updatedUser = { ...mockUser, password: 'new-hashed-password' };
      repository.atomicUpdateUser.mockImplementation(async (userId, callback) => {
        const result = await callback(mockUser);
        return result;
      });
      passwordService.comparePlainAndHash.mockResolvedValue(true);
      passwordService.getHashedValue.mockResolvedValue('new-hashed-password');

      await service.changePassword(mockUserId, mockRequest, SESSION);

      expect(repository.atomicUpdateUser).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Function)
      );
      expect(passwordService.comparePlainAndHash).toHaveBeenCalledWith(
        'old-password',
        'hashed-password'
      );
      expect(passwordService.getHashedValue).toHaveBeenCalledWith('new-password');
      passwordValidityCheckerSpy.mockRestore();
    });

    it('should throw UserError when old password is incorrect', async () => {
      repository.atomicUpdateUser.mockImplementation(async (_userId, callback) => {
        passwordService.comparePlainAndHash.mockResolvedValue(false);
        return callback({ ...mockUser });
      });
      passwordService.comparePlainAndHash.mockResolvedValue(false);

      await expect(service.changePassword(mockUserId, mockRequest, SESSION)).rejects.toThrow(UserError);

      expect(repository.atomicUpdateUser).toHaveBeenCalled();
      expect(passwordService.comparePlainAndHash).toHaveBeenCalledWith(
        'old-password',
        'hashed-password'
      );
      expect(passwordService.getHashedValue).not.toHaveBeenCalled();
    });

    it('should throw UserError when new password is invalid', async () => {
      // Mock passwordValidityChecker to return false
      const passwordValidityCheckerSpy = jest
        .spyOn(util, 'passwordValidityChecker')
        .mockReturnValue(false);

      repository.atomicUpdateUser.mockImplementation(async (_userId, callback) => {
        passwordService.comparePlainAndHash.mockResolvedValue(true);
        return callback(mockUser);
      });
      passwordService.comparePlainAndHash.mockResolvedValue(true);

      await expect(service.changePassword(mockUserId, mockRequest, SESSION)).rejects.toThrow(UserError);

      expect(repository.atomicUpdateUser).toHaveBeenCalled();
      expect(passwordService.comparePlainAndHash).toHaveBeenCalled();
      expect(passwordService.getHashedValue).not.toHaveBeenCalled();
      expect(passwordValidityCheckerSpy).toHaveBeenCalledWith('new-password');

      passwordValidityCheckerSpy.mockRestore();
    });

    it('should throw UserError when user is not found', async () => {
      repository.atomicUpdateUser.mockRejectedValue(
        UserError.UserNotFound({ userId: mockUserId })
      );

      await expect(service.changePassword(mockUserId, mockRequest, SESSION)).rejects.toThrow(UserError);

      expect(repository.atomicUpdateUser).toHaveBeenCalled();
    });
  });

  describe('getUserData', () => {
    const mockUserId = 'user-123';

    it('should return user data without password', async () => {
      repository.loadUserById.mockResolvedValue(mockUser);

      const result = await service.getUserData(mockUserId);

      expect(repository.loadUserById).toHaveBeenCalledWith(mockUserId);
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('uuid');
      expect(result.id).toBe(mockUser.id);
      expect(result.department).toBe(mockUser.department);
    });

    it('should throw UserError when user is not found', async () => {
      repository.loadUserById.mockRejectedValue(
        UserError.UserNotFound({ userId: mockUserId })
      );

      await expect(service.getUserData(mockUserId)).rejects.toThrow(UserError);

      expect(repository.loadUserById).toHaveBeenCalledWith(mockUserId);
    });
  });

  describe('getUserPreferences', () => {
    const mockUserId = 'user-123';

    it('should return user preferences', async () => {
      repository.loadUserById.mockResolvedValue(mockUser);

      const result = await service.getUserPreferences(mockUserId);

      expect(repository.loadUserById).toHaveBeenCalledWith(mockUserId);
      expect(result).toEqual(mockUser.user_preference);
      expect(result.dashboardInterval).toBe(10);
      expect(result.brokerStatusInterval).toBe(20);
    });

    it('should throw UserError when user is not found', async () => {
      repository.loadUserById.mockRejectedValue(
        UserError.UserNotFound({ userId: mockUserId })
      );

      await expect(service.getUserPreferences(mockUserId)      ).rejects.toThrow(UserError);

      expect(repository.loadUserById).toHaveBeenCalledWith(mockUserId);
    });
  });

  describe('updateProfile', () => {
    const mockUserId = 'user-123';
    const mockUpdate: UpdateUserDto = {
      department: 'Engineering',
      user_preference: {
        dashboardInterval: 30,
      },
    };

    it('should successfully update user profile with department', async () => {
      const updatedUser = { ...mockUser, department: 'Engineering' };
      repository.atomicUpdateUser.mockImplementation(async (userId, callback) => {
        const result = await callback(mockUser);
        return result;
      });

      const result = await service.updateProfile(mockUserId, { department: 'Engineering' });

      expect(repository.atomicUpdateUser).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Function)
      );
      expect(result.department).toBe('Engineering');
    });

    it('should successfully update user profile with user_preference', async () => {
      const updatedUser = {
        ...mockUser,
        user_preference: {
          ...mockUser.user_preference,
          dashboardInterval: 30,
        },
      };
      repository.atomicUpdateUser.mockImplementation(async (userId, callback) => {
        const result = await callback(mockUser);
        return result;
      });

      const result = await service.updateProfile(mockUserId, {
        user_preference: { dashboardInterval: 30 },
      });

      expect(repository.atomicUpdateUser).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Function)
      );
      expect(result.user_preference.dashboardInterval).toBe(30);
      expect(result.user_preference.brokerStatusInterval).toBe(20); // Should preserve existing
    });

    it('should successfully update user profile with both department and user_preference', async () => {
      repository.atomicUpdateUser.mockImplementation(async (userId, callback) => {
        const result = await callback(mockUser);
        return result;
      });

      const result = await service.updateProfile(mockUserId, mockUpdate);

      expect(repository.atomicUpdateUser).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Function)
      );
      expect(result.department).toBe('Engineering');
      expect(result.user_preference.dashboardInterval).toBe(30);
    });

    it('should throw UserError when user is not found', async () => {
      repository.atomicUpdateUser.mockRejectedValue(
        UserError.UserNotFound({ userId: mockUserId })
      );

      await expect(service.updateProfile(mockUserId, mockUpdate)      ).rejects.toThrow(UserError);

      expect(repository.atomicUpdateUser).toHaveBeenCalled();
    });
  });

  describe('updateUserPreferences', () => {
    const mockUserId = 'user-123';
    const mockUpdate: UserPreferenceDto = {
      dashboardInterval: 30,
    };

    it('should successfully update user preferences', async () => {
      repository.atomicUpdateUser.mockImplementation(async (userId, callback) => {
        const result = await callback(mockUser);
        return result;
      });

      const result = await service.updateUserPreferences(mockUserId, mockUpdate);

      expect(repository.atomicUpdateUser).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Function)
      );
      expect(result.user_preference.dashboardInterval).toBe(30);
      expect(result.user_preference.brokerStatusInterval).toBe(20); // Should preserve existing
    });

    it('should successfully update multiple preference fields', async () => {
      const multiUpdate: UserPreferenceDto = {
        dashboardInterval: 30,
        brokerStatusInterval: 40,
      };
      repository.atomicUpdateUser.mockImplementation(async (userId, callback) => {
        const result = await callback(mockUser);
        return result;
      });

      const result = await service.updateUserPreferences(mockUserId, multiUpdate);

      expect(repository.atomicUpdateUser).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Function)
      );
      expect(result.user_preference.dashboardInterval).toBe(30);
      expect(result.user_preference.brokerStatusInterval).toBe(40);
    });

    it('should throw UserError when user is not found', async () => {
      repository.atomicUpdateUser.mockRejectedValue(
        UserError.UserNotFound({ userId: mockUserId })
      );

      await expect(service.updateUserPreferences(mockUserId, mockUpdate)      ).rejects.toThrow(UserError);

      expect(repository.atomicUpdateUser).toHaveBeenCalled();
    });
  });

  describe('updateUser', () => {
    const mockUserId = 'user-123';
    const mockUpdate: UpdateUserInfoRequest = {
      department: 'Engineering',
    };

    it('should successfully update user information', async () => {
      repository.atomicUpdateUser.mockImplementation(async (userId, callback) => {
        const result = await callback(mockUser);
        return result;
      });

      const result = await service.updateUser(mockUserId, mockUpdate);

      expect(repository.atomicUpdateUser).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Function)
      );
      expect(result.department).toBe('Engineering');
    });

    it('should throw UserError when user is not found', async () => {
      repository.atomicUpdateUser.mockRejectedValue(
        UserError.UserNotFound({ userId: mockUserId })
      );

      await expect(service.updateUser(mockUserId, mockUpdate)      ).rejects.toThrow(UserError);

      expect(repository.atomicUpdateUser).toHaveBeenCalled();
    });
  });

  describe('deleteUser', () => {
    const mockUserId = 'user-123';

    it('should successfully delete user when password is correct', async () => {
      repository.loadUserById.mockResolvedValue(mockUser);
      passwordService.comparePlainAndHash.mockResolvedValue(true);
      repository.deleteUser.mockResolvedValue(undefined);

      const request: DeleteUserRequest = { password: 'correct-password' };

      await service.deleteUser(mockUserId, request);

      expect(repository.loadUserById).toHaveBeenCalledWith(mockUserId);
      expect(passwordService.comparePlainAndHash).toHaveBeenCalledWith(
        'correct-password',
        'hashed-password'
      );
      expect(repository.deleteUser).toHaveBeenCalledWith(mockUserId);
    });

    it('should throw UserError when password is incorrect', async () => {
      repository.loadUserById.mockResolvedValue(mockUser);
      passwordService.comparePlainAndHash.mockResolvedValue(false);

      const request: DeleteUserRequest = { password: 'wrong-password' };

      await expect(service.deleteUser(mockUserId, request)).rejects.toThrow(UserError);

      expect(repository.loadUserById).toHaveBeenCalledWith(mockUserId);
      expect(passwordService.comparePlainAndHash).toHaveBeenCalledWith(
        'wrong-password',
        'hashed-password'
      );
      expect(repository.deleteUser).not.toHaveBeenCalled();
    });

    it('should throw UserError when user is not found', async () => {
      repository.loadUserById.mockRejectedValue(
        UserError.UserNotFound({ userId: mockUserId })
      );

      const request: DeleteUserRequest = { password: 'any-password' };

      await expect(service.deleteUser(mockUserId, request)).rejects.toThrow(UserError);

      expect(repository.loadUserById).toHaveBeenCalledWith(mockUserId);
      expect(passwordService.comparePlainAndHash).not.toHaveBeenCalled();
      expect(repository.deleteUser).not.toHaveBeenCalled();
    });
  });

  describe('account control', () => {
    const runModifier = async (user: User) => {
      // The latest save's callback, run on the account as it is under the lock.
      const calls = repository.atomicUpdateUser.mock.calls;
      const modifier = calls[calls.length - 1][1];
      return modifier(user);
    };

    it('returns admin rights and defaults, never the session version', async () => {
      repository.loadUserById.mockResolvedValue({ ...mockUser, role: 'admin', sessionVersion: 4 });
      const result = await service.getUserData('testuser');
      expect(result).toMatchObject({ role: 'admin', status: 'active', isAdmin: true });
      expect(result).not.toHaveProperty('sessionVersion');
    });

    it('reads an account from before roles as an active non-admin', async () => {
      repository.loadUserById.mockResolvedValue(mockUser);
      await expect(service.getUserData('testuser')).resolves.toMatchObject({
        role: 'user',
        status: 'active',
        isAdmin: false,
      });
    });

    it('updateUser changes only the department, not role, status or password', async () => {
      repository.atomicUpdateUser.mockResolvedValue(mockUser);
      await service.updateUser('testuser', {
        department: 'Ops',
        role: 'admin',
        status: 'active',
        password: 'x',
        sessionVersion: 0,
      } as any);
      const updated = await runModifier({ ...mockUser, role: 'user' });
      expect(updated).toMatchObject({ department: 'Ops', role: 'user', password: 'hashed-password' });
      expect(updated).not.toHaveProperty('sessionVersion');
    });

    it('changing the password clears an admin-required change', async () => {
      // The old password matches; the new one differs from it.
      passwordService.comparePlainAndHash.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      passwordService.getHashedValue.mockResolvedValue('new-hash');
      repository.atomicUpdateUser.mockResolvedValue(mockUser);
      await service.changePassword('testuser', { oldPassword: 'old', newPassword: 'NewPassw0rd' }, SESSION);
      const updated = await runModifier({ ...mockUser, mustChangePassword: true });
      expect(updated.mustChangePassword).toBeUndefined();
    });

    it('refuses to set the temporary password again', async () => {
      passwordService.comparePlainAndHash.mockResolvedValue(true);
      repository.atomicUpdateUser.mockResolvedValue(mockUser);
      await service.changePassword('testuser', { oldPassword: 'Temp1234', newPassword: 'Temp1234' }, SESSION);
      await expect(runModifier({ ...mockUser, mustChangePassword: true })).rejects.toMatchObject({
        code: 'PASSWORD_UNCHANGED',
      });
    });

    it('sets a first password without the old one while a change is pending', async () => {
      passwordService.comparePlainAndHash.mockResolvedValue(false);
      passwordService.getHashedValue.mockResolvedValue('new-hash');
      repository.atomicUpdateUser.mockResolvedValue(mockUser);
      await service.setInitialPassword('testuser', 'Mine5678', SESSION);
      const updated = await runModifier({ ...mockUser, mustChangePassword: true });
      expect(updated.password).toBe('new-hash');
      expect(updated.mustChangePassword).toBeUndefined();
    });

    it('refuses a first password when no change is pending', async () => {
      passwordService.getHashedValue.mockResolvedValue('new-hash');
      repository.atomicUpdateUser.mockResolvedValue(mockUser);
      await service.setInitialPassword('testuser', 'Mine5678', SESSION);
      await expect(runModifier({ ...mockUser })).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        additionalData: expect.objectContaining({ reason: 'NO_PENDING_PASSWORD_CHANGE' }),
      });
    });

    it('refuses the temporary password, and one that breaks the policy, as the first password', async () => {
      passwordService.comparePlainAndHash.mockResolvedValue(true);
      passwordService.getHashedValue.mockResolvedValue('same-hash');
      repository.atomicUpdateUser.mockResolvedValue(mockUser);
      await service.setInitialPassword('testuser', 'Temp1234', SESSION);
      await expect(runModifier({ ...mockUser, mustChangePassword: true })).rejects.toMatchObject({ code: 'PASSWORD_UNCHANGED' });

      await expect(service.setInitialPassword('testuser', 'weak', SESSION)).rejects.toMatchObject({ code: 'BAD_NEW_PASSWORD' });
    });

    it('refuses a new password from a session an admin ended while it was hashed', async () => {
      passwordService.comparePlainAndHash.mockResolvedValue(false);
      passwordService.getHashedValue.mockResolvedValue('attacker-hash');
      repository.atomicUpdateUser.mockResolvedValue(mockUser);
      // Let in at version 1; the admin's reset since raised it to 2.
      await service.setInitialPassword('testuser', 'Mine5678', { sessionVersion: 1, accountUuid: 'u-1' });
      const reset = { ...mockUser, uuid: 'u-1', sessionVersion: 2, mustChangePassword: true, password: 'temp-hash' };
      await expect(runModifier(reset)).rejects.toMatchObject({
        code: 'INVALID_TOKEN',
        additionalData: expect.objectContaining({ reason: 'SESSION_REVOKED' }),
      });

      // Nor from a deleted account's session on a new account of the same name.
      await service.setInitialPassword('testuser', 'Mine5678', { sessionVersion: 2, accountUuid: 'old' });
      await expect(runModifier(reset)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });

      await service.setInitialPassword('testuser', 'Mine5678', { sessionVersion: 2, accountUuid: 'u-1' });
      await expect(runModifier(reset)).resolves.toMatchObject({ password: 'attacker-hash' });
    });

    it('refuses a password change from an ended session', async () => {
      passwordService.comparePlainAndHash.mockResolvedValue(true);
      repository.atomicUpdateUser.mockResolvedValue(mockUser);
      await service.changePassword('testuser', { oldPassword: 'old', newPassword: 'NewPassw0rd' }, { sessionVersion: 0 });
      await expect(runModifier({ ...mockUser, sessionVersion: 1 })).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
      expect(passwordService.getHashedValue).not.toHaveBeenCalled();
    });

    it('checks the role it has inside the queue, not the one read before it', async () => {
      // Read as a plain user while the password is checked; an admin then
      // promoted this account and left, so it is the last admin by the time
      // the delete runs.
      repository.loadUserById
        .mockResolvedValueOnce({ ...mockUser, role: 'user' })
        .mockResolvedValueOnce({ ...mockUser, role: 'admin' });
      passwordService.comparePlainAndHash.mockResolvedValue(true);
      repository.listUsers.mockResolvedValue([{ ...mockUser, role: 'admin' }]);
      await expect(service.deleteUser('testuser', { password: 'pw' })).rejects.toMatchObject({ code: 'LAST_ADMIN' });
      expect(repository.deleteUser).not.toHaveBeenCalled();
    });

    it('refuses to delete the last active admin', async () => {
      repository.loadUserById.mockResolvedValue({ ...mockUser, role: 'admin' });
      passwordService.comparePlainAndHash.mockResolvedValue(true);
      repository.listUsers.mockResolvedValue([
        { ...mockUser, role: 'admin' },
        { ...mockUser, id: 'other', role: 'admin', status: 'disabled' },
      ]);
      await expect(service.deleteUser('testuser', { password: 'pw' })).rejects.toMatchObject({ code: 'LAST_ADMIN' });
      expect(repository.deleteUser).not.toHaveBeenCalled();
    });

    it('lets an admin delete themselves when another active admin remains', async () => {
      repository.loadUserById.mockResolvedValue({ ...mockUser, role: 'admin' });
      passwordService.comparePlainAndHash.mockResolvedValue(true);
      repository.listUsers.mockResolvedValue([
        { ...mockUser, role: 'admin' },
        { ...mockUser, id: 'other', role: 'admin' },
      ]);
      await service.deleteUser('testuser', { password: 'pw' });
      expect(repository.deleteUser).toHaveBeenCalledWith('testuser');
    });
  });
});
