import { Test, TestingModule } from '@nestjs/testing';
import { UserRepositoryService } from './user-repository.service';
import { EncryptionService } from '@security/encryption/encryption.service';
import { PasswordService } from '@security/password/password.service';
import { StorageService } from '@storage/storage.service';
import { LockService } from '@lock/lock.service';
import { User, UserDTO } from '@type/index';

// Mock dependencies
jest.mock('@lock/lock.service');

describe('UserRepositoryService', () => {
  let service: UserRepositoryService;
  let encryptionService: jest.Mocked<EncryptionService>;
  let passwordService: jest.Mocked<PasswordService>;
  let storageService: jest.Mocked<StorageService>;
  let lockService: jest.Mocked<LockService>;

  const mockUserId = 'test-user';
  const mockHashedId = 'hashed-test-user';
  const mockPassword = 'test-password';
  const mockHashedPassword = 'hashed-test-password';
  const mockEncryptedData = 'encrypted-data';
  const mockDecryptedData = '{"id":"test-user","password":"hashed-password"}';

  const mockUser: User = {
    uuid: 'test-uuid',
    id: 'test-user',
    password: 'hashed-password',
    department: 'default',
    host_groups: {},
    ha_mon_list: {},
    resource_mon_list: {},
    user_preference: { dashboardInterval: 0, brokerStatusInterval: 0 },
  };

  beforeEach(async () => {
    const mockEncryptionService = {
      getHashedValue: jest.fn(),
      encryptValue: jest.fn(),
      decryptValue: jest.fn(),
    };

    const mockPasswordService = {
      getHashedValue: jest.fn(),
      comparePlainAndHash: jest.fn(),
    };

    const mockStorageService = {
      read: jest.fn(),
      readUnsafe: jest.fn(),
      write: jest.fn(),
      writeUnsafe: jest.fn(),
      createAndWrite: jest.fn(),
      delete: jest.fn(),
    };

    const mockLockService = {
      withLock: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRepositoryService,
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
        {
          provide: PasswordService,
          useValue: mockPasswordService,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
        {
          provide: LockService,
          useValue: mockLockService,
        },
      ],
    }).compile();

    service = module.get<UserRepositoryService>(UserRepositoryService);
    encryptionService = module.get(EncryptionService);
    passwordService = module.get(PasswordService);
    storageService = module.get(StorageService);
    lockService = module.get(LockService);

    // Default mock implementations
    encryptionService.getHashedValue.mockReturnValue(mockHashedId);
    encryptionService.encryptValue.mockReturnValue(mockEncryptedData);
    encryptionService.decryptValue.mockReturnValue(mockDecryptedData);
    passwordService.getHashedValue.mockResolvedValue(mockHashedPassword);
    lockService.withLock.mockImplementation(async (filename: string, work: () => Promise<any>) => {
      return work();
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('loadUserById', () => {
    it('should load user by id, decrypt and return User object', async () => {
      storageService.read.mockResolvedValue(mockEncryptedData);
      encryptionService.decryptValue.mockReturnValue(JSON.stringify(mockUser));

      const result = await service.loadUserById(mockUserId);

      expect(encryptionService.getHashedValue).toHaveBeenCalledWith(mockUserId);
      expect(storageService.read).toHaveBeenCalledWith(mockHashedId);
      expect(encryptionService.decryptValue).toHaveBeenCalledWith(mockEncryptedData);
      expect(result).toEqual(mockUser);
    });

    it('should throw error if user file not found', async () => {
      storageService.read.mockRejectedValue(new Error('File not found'));

      await expect(service.loadUserById(mockUserId)).rejects.toThrow();
    });
  });

  describe('createUser', () => {
    it('should create a new user with hashed id and encrypted data', async () => {
      const userDto: UserDTO = {
        id: mockUserId,
        password: mockPassword,
      };

      await service.createUser(userDto);

      expect(encryptionService.getHashedValue).toHaveBeenCalledWith(mockUserId);
      expect(passwordService.getHashedValue).toHaveBeenCalledWith(mockPassword);
      expect(encryptionService.encryptValue).toHaveBeenCalled();
      expect(storageService.createAndWrite).toHaveBeenCalledWith(mockHashedId, mockEncryptedData);
    });

    it('should create user with default values', async () => {
      const userDto: UserDTO = {
        id: mockUserId,
        password: mockPassword,
      };

      await service.createUser(userDto);

      const encryptCall = encryptionService.encryptValue.mock.calls[0][0];
      const userJson = JSON.parse(encryptCall);

      expect(userJson.id).toBe(mockUserId);
      expect(userJson.password).toBe(mockHashedPassword);
      expect(userJson.department).toBe('default');
      expect(userJson.host_groups).toEqual({});
      expect(userJson.ha_mon_list).toEqual({});
      expect(userJson.resource_mon_list).toEqual({});
      expect(userJson.user_preference).toEqual({
        dashboardInterval: 3,
        brokerStatusInterval: 0,
      });
      expect(userJson.uuid).toBeDefined();
    });
  });

  describe('deleteUser', () => {
    it('should delete user by hashed id', async () => {
      storageService.delete.mockResolvedValue(undefined);

      await service.deleteUser(mockUserId);

      expect(encryptionService.getHashedValue).toHaveBeenCalledWith(mockUserId);
      expect(storageService.delete).toHaveBeenCalledWith(mockHashedId);
    });

    it('should throw error if user file not found', async () => {
      storageService.delete.mockRejectedValue(new Error('File not found'));

      await expect(service.deleteUser(mockUserId)).rejects.toThrow();
    });
  });

  describe('updateUser', () => {
    it('should update user with hashed id and encrypted data', async () => {
      storageService.write.mockResolvedValue(undefined);

      await service.updateUser(mockUserId, mockUser);

      expect(encryptionService.getHashedValue).toHaveBeenCalledWith(mockUserId);
      expect(encryptionService.encryptValue).toHaveBeenCalledWith(JSON.stringify(mockUser));
      expect(storageService.write).toHaveBeenCalledWith(mockHashedId, mockEncryptedData);
    });

    it('should throw error if user file not found', async () => {
      storageService.write.mockRejectedValue(new Error('File not found'));

      await expect(service.updateUser(mockUserId, mockUser)).rejects.toThrow();
    });
  });

  describe('atomicUpdateUser', () => {
    it('should perform atomic update using lockService.withLock', async () => {
      const modifierCallback = jest.fn(async (user: User) => {
        user.department = 'updated-department';
        return user;
      });

      storageService.readUnsafe.mockResolvedValue(mockEncryptedData);
      encryptionService.decryptValue.mockReturnValue(JSON.stringify(mockUser));
      encryptionService.encryptValue.mockReturnValue(mockEncryptedData);
      storageService.writeUnsafe.mockResolvedValue(undefined);

      let capturedWorker: (() => Promise<any>) | null = null;
      lockService.withLock.mockImplementation(
        async (filename: string, work: () => Promise<any>) => {
          expect(filename).toBe(mockHashedId);
          capturedWorker = work;
          return work();
        }
      );

      const result = await service.atomicUpdateUser(mockUserId, modifierCallback);

      const updatedUser: User = {
        ...mockUser,
        department: 'updated-department',
      };

      expect(encryptionService.getHashedValue).toHaveBeenCalledWith(mockUserId);
      expect(lockService.withLock).toHaveBeenCalledWith(mockHashedId, expect.any(Function));
      expect(capturedWorker).toBeDefined();
      expect(storageService.readUnsafe).toHaveBeenCalledWith(mockHashedId);
      expect(encryptionService.decryptValue).toHaveBeenCalledWith(mockEncryptedData);
      expect(modifierCallback).toHaveBeenCalledWith(expect.objectContaining({ id: mockUser.id }));
      expect(encryptionService.encryptValue).toHaveBeenCalledWith(JSON.stringify(updatedUser));
      expect(storageService.writeUnsafe).toHaveBeenCalledWith(mockHashedId, mockEncryptedData);
      expect(result).toEqual(updatedUser);
    });

    it('should throw error if read fails', async () => {
      const modifierCallback = jest.fn().mockResolvedValue(mockUser);
      storageService.readUnsafe.mockRejectedValue(new Error('Read failed'));

      lockService.withLock.mockImplementation(
        async (filename: string, work: () => Promise<any>) => {
          return work();
        }
      );

      await expect(service.atomicUpdateUser(mockUserId, modifierCallback)).rejects.toThrow();

      expect(encryptionService.getHashedValue).toHaveBeenCalledWith(mockUserId);
      expect(lockService.withLock).toHaveBeenCalledWith(mockHashedId, expect.any(Function));
    });

    it('should throw error if modifier callback fails', async () => {
      const modifierCallback = jest.fn().mockRejectedValue(new Error('Modifier failed'));

      storageService.readUnsafe.mockResolvedValue(mockEncryptedData);
      encryptionService.decryptValue.mockReturnValue(JSON.stringify(mockUser));

      lockService.withLock.mockImplementation(
        async (filename: string, work: () => Promise<any>) => {
          return work();
        }
      );

      await expect(service.atomicUpdateUser(mockUserId, modifierCallback)).rejects.toThrow(
        'Modifier failed'
      );

      expect(encryptionService.getHashedValue).toHaveBeenCalledWith(mockUserId);
      expect(lockService.withLock).toHaveBeenCalledWith(mockHashedId, expect.any(Function));
    });
  });
});
