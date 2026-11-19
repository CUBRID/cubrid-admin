import { Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { LockError, LockErrorCode } from '@error/lock/lock-error';
import { LockService } from './lock.service';

// The real proper-lockfile and file system: the lock directory is removed
// under a held lock, as another process does when it takes the lock for
// stale, and the library's mtime-update timer then finds it gone.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// stale 2000 is the library's minimum; it then updates the mtime every 1000 ms.
class ShortStaleLockService extends LockService {
  protected override readonly lockOptions = {
    stale: 2000,
    retries: { retries: 3, factor: 1, minTimeout: 20, maxTimeout: 50 },
  };
}

describe('LockService with a compromised lock', () => {
  let tmpDir: string;
  let service: LockService;
  let warn: jest.SpyInstance;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lock-compromised-'));
    // The service reads the storage path when it is constructed (in beforeEach).
    process.env.STORAGE_PATH = tmpDir;
  });

  afterAll(async () => {
    delete process.env.STORAGE_PATH;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    service = new ShortStaleLockService();
    warn = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('keeps the process alive, fails the work, and lets the next request through', async () => {
    const filename = 'compromised.json';
    const lockDir = `${path.join(tmpDir, filename)}.lock`;
    let heldBeforeRemoval: boolean | undefined;
    let errorAtWrite: unknown;

    const result = service.withLock(filename, async (lock) => {
      heldBeforeRemoval = lock.compromised === null;
      // Another process took the lock for stale and removed it.
      await fs.rm(lockDir, { recursive: true, force: true });
      // The next mtime update (every 1000 ms) finds it gone.
      await sleep(2500);
      try {
        lock.assertHeld();
      } catch (err) {
        errorAtWrite = err;
      }
      return 'written';
    });

    await expect(result).rejects.toBeInstanceOf(LockError);
    await expect(result).rejects.toMatchObject({ code: LockErrorCode.STALE_LOCK });
    expect(heldBeforeRemoval).toBe(true);
    // The write guard refused before the write would have happened.
    expect(errorAtWrite).toBeInstanceOf(LockError);
    expect((errorAtWrite as LockError).code).toBe(LockErrorCode.STALE_LOCK);
    // The warning names the lock, the library's code, and how long it was held.
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/compromised after \d+ ms \(code=ECOMPROMISED, syscall=/),
      'LockService'
    );
    expect(warn.mock.calls[0][0]).toContain(path.join(tmpDir, filename));
    // No "release failed" noise: a compromised lock is not released again.
    expect(warn.mock.calls.some(([message]) => /release failed/i.test(String(message)))).toBe(false);

    // The next request on the same file takes the lock and runs normally.
    const next = await service.withLock(filename, async (lock) => {
      lock.assertHeld();
      return 'next-ok';
    });
    expect(next).toBe('next-ok');
    await expect(fs.stat(lockDir)).rejects.toMatchObject({ code: 'ENOENT' });
  }, 15000);

  it('throws nothing into the library when the lock is compromised before the work ends', async () => {
    const filename = 'compromised-twice.json';
    const lockDir = `${path.join(tmpDir, filename)}.lock`;
    const result = service.withLock(filename, async () => {
      await fs.rm(lockDir, { recursive: true, force: true });
      await sleep(2500);
      // No assertHeld here: the work's result is still discarded by withLock.
      return 'unchecked';
    });
    await expect(result).rejects.toMatchObject({ code: LockErrorCode.STALE_LOCK });
    expect(warn).toHaveBeenCalledTimes(1);
  }, 15000);
});
