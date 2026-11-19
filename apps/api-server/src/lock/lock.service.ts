import { Injectable, Logger } from '@nestjs/common';
import * as nodeFs from 'fs';
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
  /** True when our own release had already started: not a real compromise. */
  duringRelease: boolean;
}

export interface FileLock {
  filePath: string;
  release: () => Promise<void>;
  /** Milliseconds since the epoch when the lock was taken. */
  acquiredAt: number;
  /** Set once our release has started (see `createLockFs`). */
  releasing: boolean;
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

/** The callback-style fs functions proper-lockfile calls through `options.fs`. */
export type LockFs = Pick<typeof nodeFs, 'mkdir' | 'rmdir' | 'rmdirSync' | 'realpath' | 'stat' | 'utimes'>;

type FsCallback<T> = (err: NodeJS.ErrnoException | null, value?: T) => void;

/** The locks a service has taken, by lock directory path. */
export interface LockRegistry {
  get(lockPath: string): Pick<FileLock, 'releasing'> | undefined;
}

/**
 * The fs proper-lockfile gets from a service: one object, shared by all its
 * locks, so the library's mtime-precision cache (a property it sets on the fs
 * object after a probe) holds for every lock after the first. Once a lock's
 * release has started, a stat or utimes error on its lock directory other
 * than ENOENT is reported to the library as ENOENT.
 *
 * Why: the library's mtime-update timer (lockfile.js updateLock) can be in
 * its stat when release runs; release deletes the library's lock entry.
 * Back in the stat callback, an ENOENT (or an update over the stale time)
 * takes the compromised path, which copes with a gone entry and calls
 * onCompromised. Any other error (Windows reports EPERM/EACCES/EBUSY for a
 * directory whose deletion is pending) makes it schedule another update
 * through `updateLock`, which reads the deleted entry and throws a TypeError
 * inside the fs callback: an unhandled exception that ends the process.
 * Reporting ENOENT there sends it down the compromised path instead; the
 * original code is kept on the error for the log.
 */
export function createLockFs(locks: LockRegistry, base: LockFs = nodeFs): LockFs {
  const afterRelease = (lockPath: nodeFs.PathLike, err: NodeJS.ErrnoException | null): NodeJS.ErrnoException | null => {
    if (!err || err.code === 'ENOENT' || !locks.get(String(lockPath))?.releasing) return err;
    const mapped: NodeJS.ErrnoException & { originalCode?: string } = Object.assign(
      new Error(`${err.message} (reported as ENOENT: the lock was being released)`),
      { code: 'ENOENT', originalCode: err.code, syscall: err.syscall, path: err.path }
    );
    return mapped;
  };
  return {
    mkdir: base.mkdir.bind(base),
    rmdir: base.rmdir.bind(base),
    rmdirSync: base.rmdirSync.bind(base),
    realpath: base.realpath.bind(base),
    stat: ((p: nodeFs.PathLike, cb: FsCallback<nodeFs.Stats>) =>
      base.stat(p, (err, stat) => cb(afterRelease(p, err), stat))) as typeof nodeFs.stat,
    utimes: ((p: nodeFs.PathLike, atime: nodeFs.TimeLike, mtime: nodeFs.TimeLike, cb: FsCallback<void>) =>
      base.utimes(p, atime, mtime, (err) => cb(afterRelease(p, err)))) as typeof nodeFs.utimes,
  };
}

@Injectable()
export class LockService {
  private readonly storageDir = getStoragePath();
  /** A test subclass shortens these (no constructor argument: Nest makes the service without one). */
  protected readonly lockOptions: LockOptions = DEFAULT_LOCK_OPTIONS;
  /** The fs under the lock library (a test subclass makes its stat fail or counts its calls). */
  protected readonly baseFs: LockFs = nodeFs;
  /**
   * The latest lock per lock directory path, for `createLockFs`. An entry is
   * replaced by the next lock on the path, never removed: a stat of a
   * released lock can still be pending when the next lock on the path is
   * taken, but by then the directory exists again (a directory whose
   * deletion is pending cannot be re-created), so that stat succeeds or
   * reports ENOENT, never the error the mapping is for. The one cost: a
   * probe of the next lock failing with another error while the previous
   * lock is still marked releasing is reported as ENOENT; the acquisition
   * fails either way.
   */
  private readonly locksByPath = new Map<string, Pick<FileLock, 'releasing'>>();
  private sharedLockFs?: LockFs;

  private lockFs(): LockFs {
    this.sharedLockFs ??= createLockFs(this.locksByPath, this.baseFs);
    return this.sharedLockFs;
  }

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
      releasing: false,
      compromised: null,
      // It cannot catch a compromise between two of the library's checks
      // (every stale/2 ms): the lock is only known to be lost at the next check.
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
      fs: this.lockFs(),
      // The library calls this from its mtime-update timer when the lock file is
      // gone (another process took it for stale and removed it, or it raced
      // with our own release) or when the update ran over the stale time. Its
      // default throws there, which ends the whole process as an unhandled
      // exception. Here the lock is only marked: the work under it refuses its
      // next write (`assertHeld`); what was already written stays.
      onCompromised: (err: NodeJS.ErrnoException & { originalCode?: string }) => {
        try {
          const at = Date.now();
          const duringRelease = lock.releasing;
          lock.compromised = { at, error: err, duringRelease };
          // The library has dropped this lock, and the service does not
          // release it again: from here on it counts as releasing too, so a
          // late stat/utimes error of it is still reported as ENOENT.
          lock.releasing = true;
          const detail =
            `code=${err?.code}${err?.originalCode ? ', originalCode=' + err.originalCode : ''}, ` +
            `syscall=${err?.syscall ?? '-'}, path=${err?.path ?? '-'}`;
          if (duringRelease) {
            // Our release had already started: the library's last update
            // just lost the race with it. Nothing was held any more.
            Logger.debug(
              `Lock on ${filePath} ended during its release after ${at - lock.acquiredAt} ms (${detail}): ${err?.message}`,
              'LockService'
            );
          } else {
            Logger.warn(
              `Lock on ${filePath} was compromised after ${at - lock.acquiredAt} ms (${detail}): ${err?.message}`,
              'LockService'
            );
          }
        } catch {
          // Never let anything escape into the library's timer callback.
        }
      },
    });
    lock.acquiredAt = Date.now();
    // proper-lockfile's lock directory is path.resolve(file) + '.lock' (realpath
    // is off and no lockfilePath option is given): the same resolution here.
    this.locksByPath.set(`${path.resolve(filePath)}.lock`, lock);
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
    lock.releasing = true;
    await lock.release();
  }

  /**
   * Executes a work function while holding a file lock.
   *
   * The lock is automatically acquired before the work and released afterwards.
   * If the work function throws an error, the lock is still released, and the original
   * error is re-thrown, potentially augmented with lock release failure information.
   * Work that writes calls `lock.assertHeld()` right before each write, so a
   * lock compromised meanwhile (another process may hold it by now) stops
   * the write and fails the work. A compromise found only after the work has
   * finished is logged; the work's result stands, since what it wrote is
   * already on disk.
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
      if (lock.compromised) {
        Logger.warn(
          `The lock on ${filename} was compromised while its work ran; the work had finished, so its result stands`,
          'LockService'
        );
      }
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
