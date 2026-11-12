import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import { HandleLockFsErrors } from '@common';
import { getStoragePath } from '@util';

/**
 * Service for managing file locking operations.
 *
 * Provides functionality for file locking using proper-lockfile library.
 * Handles lock acquisition, release, and stale lock detection.
 *
 * @category Infrastructure Services
 * @since 1.0.0
 */

export interface LockErrorDetails {
  message: string;
  code: string;
  stack?: string;
}

export interface LockServiceDetails {
  lockReleaseFailed?: boolean;
  lockReleaseError?: LockErrorDetails;
  [key: string]: unknown;
}

export interface FileLock {
  filePath: string;
  release: () => Promise<void>;
}

@Injectable()
export class LockService {
  private readonly storageDir = getStoragePath();

  /**
   * Resolves the absolute path for a given filename within the storage directory.
   *
   * @param filename - The name of the file.
   * @returns The absolute path to the file.
   */
  private resolvePath(filename: string) {
    return path.join(this.storageDir, filename);
  }

  /**
   * Acquires an internal file lock for a given filename.
   *
   * @param filename - The name of the file to lock.
   * @returns A Promise that resolves with a FileLock object.
   * @throws LockError if the lock cannot be acquired.
   */
  @HandleLockFsErrors()
  private async acquireInternal(filename: string): Promise<FileLock> {
    const filePath = this.resolvePath(filename);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const release = await lockfile.lock(filePath, {
      stale: 30_000,
      realpath: false,
      retries: {
        retries: 50, // Increased retry count
        factor: 1.2, // Decreased retry interval growth rate
        minTimeout: 50, // Decreased minimum wait time
        maxTimeout: 2000, // Increased maximum wait time
      },
    });
    return { filePath, release };
  }

  /**
   * Acquires a file lock for a given filename.
   *
   * @param filename - The name of the file to lock.
   * @returns A Promise that resolves with a FileLock object.
   * @throws LockError if the lock cannot be acquired.
   */
  @HandleLockFsErrors()
  async acquire(filename: string): Promise<FileLock> {
    return this.acquireInternal(filename);
  }

  /**
   * Releases a previously acquired file lock.
   *
   * @param lock - The FileLock object to release.
   * @returns A Promise that resolves when the lock is released.
   * @throws LockError if the lock cannot be released.
   */
  @HandleLockFsErrors()
  async release(lock: FileLock): Promise<void> {
    await lock.release();
  }

  /**
   * Executes a work function while holding a file lock.
   *
   * The lock is automatically acquired before the work and released afterwards.
   * If the work function throws an error, the lock is still released, and the original
   * error is re-thrown, potentially augmented with lock release failure information.
   *
   * @param filename - The name of the file to lock.
   * @param work - The asynchronous function to execute while holding the lock.
   * @returns A Promise that resolves with the result of the work function.
   * @throws Any error thrown by the work function or a LockError if lock operations fail.
   */
  async withLock<T>(filename: string, work: () => Promise<T>): Promise<T> {
    const lock = await this.acquire(filename);

    try {
      Logger.log('with lock work');
      return await work();
    } catch (error) {
      Logger.log('with lock error');
      throw error;
    } finally {
      try {
        await this.release(lock);
      } catch (releaseError) {
        Logger.warn(
          `Lock release failed for ${filename}: ${releaseError.message}`,
          releaseError.stack
        );
      }
    }
  }
}
