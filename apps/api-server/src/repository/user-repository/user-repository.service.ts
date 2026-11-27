import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

import { User, UserDTO, UserRole } from '@type/index';
import { getStoragePath } from '@util';

import { LockService } from '@lock/lock.service';
import { EncryptionService } from '@security/encryption/encryption.service';
import { PasswordService } from '@security/password/password.service';
import { StorageService } from '@storage/storage.service';

import { HandleUserRepoErrors } from '@decorators/handle-user-repo-errors.decorator';

/**
 * Service for user data repository operations.
 *
 * Provides low-level data access operations for user management including
 * CRUD operations, file-based storage, and data persistence.
 *
 * @category Infrastructure Services
 * @since 1.0.0
 */
/** Account files are named by the SHA-256 hex of the account id. */
const ACCOUNT_FILE_NAME = /^[0-9a-f]{64}$/;

export type CreateUserOptions = {
  role?: UserRole;
  mustChangePassword?: boolean;
  /** `pending` for a sign-up that waits for an administrator. */
  status?: 'active' | 'pending';
};

@Injectable()
export class UserRepositoryService {
  private readonly logger = new Logger(UserRepositoryService.name);

  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly passwordService: PasswordService,
    private readonly storageService: StorageService,
    private readonly lockService: LockService
  ) {}

  /**
   * Loads a user by their ID.
   *
   * The ID is hashed before being used to read from storage.
   *
   * @param id - The user's ID.
   * @returns A Promise that resolves with the User object.
   * @throws UserError.UserNotFound if the user file is not found.
   */
  @HandleUserRepoErrors()
  async loadUserById(id: string): Promise<User> {
    const hashedId = this.encryptionService.getHashedValue(id);
    const encrypted = await this.storageService.read(hashedId);
    const userJson: User = JSON.parse(this.encryptionService.decryptValue(encrypted));
    return userJson;
  }

  /**
   * Creates a new user.
   *
   * The user's ID is hashed, and the user data is encrypted before being written to storage.
   *
   * @param dto - The UserDTO containing the user's ID and password.
   * @returns A Promise that resolves when the user is created.
   * @throws UserError.UserAlreadyExists if a user with the given ID already exists.
   */
  @HandleUserRepoErrors()
  async createUser(dto: UserDTO, options: CreateUserOptions = {}): Promise<void> {
    const hashedId = this.encryptionService.getHashedValue(dto.id);
    const uuid = uuidv4();

    const userJson: User = {
      uuid,
      id: dto.id,
      password: await this.passwordService.getHashedValue(dto.password),
      department: 'default',
      host_groups: {},
      ha_mon_list: {},
      resource_mon_list: {},
      user_preference: { dashboardInterval: 3, brokerStatusInterval: 0 },
      role: options.role ?? 'user',
      status: options.status ?? 'active',
      ...(options.mustChangePassword ? { mustChangePassword: true } : {}),
      sessionVersion: 0,
      createdAt: new Date().toISOString(),
    };
    await this.storageService.createAndWrite(
      hashedId,
      this.encryptionService.encryptValue(JSON.stringify(userJson))
    );
  }

  /**
   * Loads every account in storage. There is no separate index: account files
   * are the ones named like a hashed id that decrypt to an account record, so
   * the list can never disagree with what login reads. A file that fails to
   * read or decrypt is skipped and logged, not fatal to the whole list.
   */
  async listUsers(): Promise<User[]> {
    const names = await this.accountFileNames();

    const users: User[] = [];
    for (const name of names) {
      try {
        const user = JSON.parse(this.encryptionService.decryptValue(await this.storageService.read(name))) as User;
        if (typeof user?.id === 'string' && typeof user?.password === 'string') users.push(user);
      } catch (err: unknown) {
        this.logger.warn(`Skipping unreadable account file ${name}: ${String(err)}`);
      }
    }
    return users;
  }

  /**
   * Whether storage holds any account file, readable or not. A fresh install
   * has none; an install whose files can't be decrypted (a changed master
   * key) still has them and is not fresh.
   */
  async hasAccountFiles(): Promise<boolean> {
    return (await this.accountFileNames()).length > 0;
  }

  private async accountFileNames(): Promise<string[]> {
    try {
      const entries = await fs.readdir(getStoragePath(), { withFileTypes: true });
      return entries.filter((e) => e.isFile() && ACCOUNT_FILE_NAME.test(e.name)).map((e) => e.name);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
      throw err;
    }
  }

  /**
   * Deletes a user by their ID.
   *
   * The user's ID is hashed before being used to delete from storage.
   *
   * @param id - The user's ID.
   * @returns A Promise that resolves when the user is deleted.
   * @throws UserError.UserNotFound if the user file is not found.
   */
  @HandleUserRepoErrors()
  async deleteUser(id: string): Promise<void> {
    const hashedId = this.encryptionService.getHashedValue(id);
    await this.storageService.delete(hashedId);
  }

  /**
   * Updates a user's data.
   *
   * The user's ID is hashed, and the updated user data is encrypted before being written to storage.
   *
   * @param id - The user's ID.
   * @param userJson - The updated User object.
   * @returns A Promise that resolves when the user is updated.
   * @throws UserError.UserNotFound if the user file is not found.
   */
  @HandleUserRepoErrors()
  async updateUser(id: string, userJson: User): Promise<void> {
    const hashedId = this.encryptionService.getHashedValue(id);
    const encrypted = this.encryptionService.encryptValue(JSON.stringify(userJson));
    await this.storageService.write(hashedId, encrypted);
  }

  /**
   * Performs an atomic update on a user's data.
   *
   * Acquires a lock on the user file, reads the data, applies a modifier function,
   * and then writes the updated data back to storage, releasing the lock afterwards.
   *
   * @param id - The user's ID.
   * @param modifierCallback - An asynchronous function that modifies the User object.
   * @returns A Promise that resolves with the updated User object.
   * @throws UserError if any lock or storage operation fails.
   */
  @HandleUserRepoErrors()
  async atomicUpdateUser(
    id: string,
    modifierCallback: (user: User) => Promise<User>
  ): Promise<User> {
    const hashedId = this.encryptionService.getHashedValue(id);

    const updated = await this.lockService.withLock(hashedId, async () => {
      const encrypted: string = await this.storageService.readUnsafe(hashedId);
      const decrypted: string = await this.encryptionService.decryptValue(encrypted);
      const userJson: User = JSON.parse(decrypted);

      await modifierCallback(userJson);

      const newEncryted = await this.encryptionService.encryptValue(JSON.stringify(userJson));
      await this.storageService.writeUnsafe(hashedId, newEncryted);

      return userJson;
    });
    return updated;
  }
}
