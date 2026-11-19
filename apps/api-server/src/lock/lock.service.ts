import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import { HandleLockFsErrors } from '@common';
import { LockError } from '@error/lock/lock-error';
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

/** What proper-lockfile reports when it finds the lock no longer ours. */
export interface LockCompromise {
  /** Milliseconds since the epoch when the library gave the lock up. */
  at: number;
  /** The library's error (code ECOMPROMISED; syscall/path from the failed stat or utimes). */
  error: NodeJS.ErrnoException;
}

export interface FileLock {
  filePath: string;
  release: () => Promise<void>;
  /** Milliseconds since the epoch when the lock was taken. */
  acquiredAt: number;
  /** Set once the lock is no longer ours (see `assertHeld`). */
  compromised: LockCompromise | null;
  /**
   * Throws when the lock has been compromised. Work under a lock calls this
   * right before each write, so nothing is written under a lock another
   * process may hold by now.
   */
  assertHeld: () => void;
}

/** proper-lockfile options the service uses; a test shortens `stale` to make a compromise quickly. */
export interface LockOptions {
  /** After this many ms without an mtime update the lock counts as stale (library minimum 2000). */
  stale: number;
  retries: { retries: number; factor: number; minTimeout: number; maxTimeout: number };
}

export const DEFAULT_LOCK_OPTIONS: LockOptions = {
  stale: 30_000,
  retries: {
    retries: 50, // Increased retry count
    factor: 1.2, // Decreased retry interval growth rate
    minTimeout: 50, // Decreased minimum wait time
    maxTimeout: 2000, // Increased maximum wait time
  },
};

@Injectable()
export class LockService {
  private readonly storageDir = getStoragePath();
  /** A test subclass shortens these (no constructor argument: Nest makes the service without one). */
  protected readonly lockOptions: LockOptions = DEFAULT_LOCK_OPTIONS;

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

    const lock: FileLock = {
      filePath,
      release: async () => undefined,
      acquiredAt: 0,
      compromised: null,
      assertHeld: () => {
        if (lock.compromised) {
          throw LockError.StaleLock(
            { filePath, reason: 'Lock compromised', heldMs: lock.compromised.at - lock.acquiredAt },
            lock.compromised.error
          );
        }
      },
    };
    lock.release = await lockfile.lock(filePath, {
      stale: this.lockOptions.stale,
      realpath: false,
      retries: this.lockOptions.retries,
      // The library calls this from its mtime-update timer when the lock file is
      // gone (another process took it for stale and removed it, or it raced
      // with our own release) or when the update ran over the stale time. Its
      // default throws there, which ends the whole process as an unhandled
      // exception. Here the lock is only marked: the work under it fails at its
      // next `assertHeld`, and `withLock` fails the work's result.
      onCompromised: (err: NodeJS.ErrnoException) => {
        try {
          const at = Date.now();
          lock.compromised = { at, error: err };
          Logger.warn(
            `Lock on ${filePath} was compromised after ${at - lock.acquiredAt} ms ` +
              `(code=${err?.code}, syscall=${err?.syscall ?? '-'}, path=${err?.path ?? '-'}): ${err?.message}`,
            'LockService'
          );
        } catch {
          // Never let anything escape into the library's timer callback.
        }
      },
    });
    lock.acquiredAt = Date.now();
    return lock;
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
   * A compromised lock was already given up by the library (its release
   * would fail with ENOTACQUIRED), so there is nothing to release.
   *
   * @param lock - The FileLock object to release.
   * @returns A Promise that resolves when the lock is released.
   * @throws LockError if the lock cannot be released.
   */
  @HandleLockFsErrors()
  async release(lock: FileLock): Promise<void> {
    if (lock.compromised) return;
    await lock.release();
  }

  /**
   * Executes a work function while holding a file lock.
   *
   * The lock is automatically acquired before the work and released afterwards.
   * If the work function throws an error, the lock is still released, and the original
   * error is re-thrown, potentially augmented with lock release failure information.
   * If the lock is compromised while the work runs, the work's result is
   * discarded and a stale-lock error is thrown instead: another process may
   * have changed the file meanwhile. Work that writes calls `lock.assertHeld()`
   * right before each write so that it does not write at all in that case.
   *
   * @param filename - The name of the file to lock.
   * @param work - The asynchronous function to execute while holding the lock; it gets the lock.
   * @returns A Promise that resolves with the result of the work function.
   * @throws Any error thrown by the work function or a LockError if lock operations fail.
   */
  async withLock<T>(filename: string, work: (lock: FileLock) => Promise<T>): Promise<T> {
    const lock = await this.acquire(filename);

    try {
      const result = await work(lock);
      lock.assertHeld();
      return result;
    } catch (error) {
      // The caller handles the error (an expected one, such as a user file that
      // does not exist yet on the first start, included); the lock is released below.
      Logger.debug(`Work under the lock on ${filename} ended with an error; releasing the lock`);
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
