import { Logger } from '@nestjs/common';
import * as nodeFs from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { LockError, LockErrorCode } from '@error/lock/lock-error';
import { createLockFs, FileLock, LockService } from './lock.service';

// The real proper-lockfile and file system on a temp storage folder. A lock
// is compromised the way another process does it (the lock directory is
// removed, as when it was taken for stale), and the way Windows does it
// during our own release (stat fails with EPERM while the deletion is
// pending). Waits poll a condition with a deadline, never a fixed sleep.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (condition: () => boolean, timeoutMs: number, what: string) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(50);
  }
};

// stale 2000 is the library's minimum; it then updates the mtime every 1000 ms.
class ShortStaleLockService extends LockService {
  protected override readonly lockOptions = {
    stale: 2000,
    retries: { retries: 3, factor: 1, minTimeout: 20, maxTimeout: 50 },
  };
}

describe('createLockFs', () => {
  const eperm = Object.assign(new Error('EPERM: operation not permitted, stat'), {
    code: 'EPERM',
    syscall: 'stat',
    path: '/x/f.lock',
  });
  const base = {
    mkdir: jest.fn(),
    rmdir: jest.fn(),
    rmdirSync: jest.fn(),
    realpath: jest.fn(),
    stat: jest.fn((_p, cb) => cb(eperm)),
    utimes: jest.fn((_p, _a, _m, cb) => cb(eperm)),
  } as never;

  it('passes a stat/utimes error through while the lock is held', (done) => {
    const lockFs = createLockFs(new Map([['/x/f.lock', { releasing: false }]]), base);
    lockFs.stat('/x/f.lock', (err) => {
      expect(err).toMatchObject({ code: 'EPERM' });
      lockFs.utimes('/x/f.lock', 1, 1, (err2) => {
        expect(err2).toMatchObject({ code: 'EPERM' });
        done();
      });
    });
  });

  it('reports a stat/utimes error as ENOENT once the release has started, keeping the original code', (done) => {
    const lockFs = createLockFs(new Map([['/x/f.lock', { releasing: true }]]), base);
    lockFs.stat('/x/f.lock', (err) => {
      expect(err).toMatchObject({ code: 'ENOENT', originalCode: 'EPERM', syscall: 'stat', path: '/x/f.lock' });
      lockFs.utimes('/x/f.lock', 1, 1, (err2) => {
        expect(err2).toMatchObject({ code: 'ENOENT', originalCode: 'EPERM' });
        done();
      });
    });
  });

  it('passes an error through for a path it holds no lock for', (done) => {
    const lockFs = createLockFs(new Map(), base);
    lockFs.stat('/x/other.lock', (err) => {
      expect(err).toMatchObject({ code: 'EPERM' });
      done();
    });
  });

  it('leaves ENOENT and success alone', (done) => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const okBase = { ...(base as object), stat: jest.fn((_p, cb) => cb(enoent)), utimes: jest.fn((_p, _a, _m, cb) => cb(null)) } as never;
    const lockFs = createLockFs(new Map([['/x/f.lock', { releasing: true }]]), okBase);
    lockFs.stat('/x/f.lock', (err) => {
      expect(err).toBe(enoent);
      lockFs.utimes('/x/f.lock', 1, 1, (err2) => {
        expect(err2).toBeNull();
        done();
      });
    });
  });
});

describe('LockService with a compromised lock', () => {
  let tmpDir: string;
  let service: LockService;
  let warn: jest.SpyInstance;
  let debug: jest.SpyInstance;

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
    debug = jest.spyOn(Logger, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const compromisedWarnings = () => warn.mock.calls.filter(([m]) => /was compromised after/.test(String(m)));

  it('keeps the process alive, refuses the write, logs the lock, and lets the next request through', async () => {
    const filename = 'compromised.json';
    const lockDir = `${path.join(tmpDir, filename)}.lock`;
    let heldBeforeRemoval: boolean | undefined;
    let errorAtWrite: unknown;
    let seenLock: FileLock | undefined;

    const result = await service.withLock(filename, async (lock) => {
      seenLock = lock;
      heldBeforeRemoval = lock.compromised === null;
      // Another process took the lock for stale and removed it.
      await fs.rm(lockDir, { recursive: true, force: true });
      // The next mtime update (every 1000 ms) finds it gone.
      await waitFor(() => lock.compromised !== null, 8000, 'the compromise');
      try {
        lock.assertHeld();
      } catch (err) {
        errorAtWrite = err;
      }
      return 'nothing written';
    });

    // The work finished on its own terms: its result stands.
    expect(result).toBe('nothing written');
    // A compromised lock also counts as releasing: a late stat error of it is still mapped.
    expect(seenLock!.compromised).not.toBeNull();
    expect(seenLock!.releasing).toBe(true);
    expect(heldBeforeRemoval).toBe(true);
    // The write guard refused before the write would have happened.
    expect(errorAtWrite).toBeInstanceOf(LockError);
    expect((errorAtWrite as LockError).code).toBe(LockErrorCode.STALE_LOCK);
    // The warning names the lock, the library's code, and how long it was held.
    expect(compromisedWarnings()).toHaveLength(1);
    expect(compromisedWarnings()[0][0]).toMatch(/compromised after \d+ ms \(code=ECOMPROMISED, syscall=/);
    expect(compromisedWarnings()[0][0]).toContain(path.join(tmpDir, filename));
    expect(compromisedWarnings()[0][1]).toBe('LockService');
    // No "release failed" noise: a compromised lock is not released again.
    expect(warn.mock.calls.some(([m]) => /release failed/i.test(String(m)))).toBe(false);

    // The next request on the same file takes the lock and runs normally.
    const next = await service.withLock(filename, async (lock) => {
      lock.assertHeld();
      return 'next-ok';
    });
    expect(next).toBe('next-ok');
    await expect(fs.stat(lockDir)).rejects.toMatchObject({ code: 'ENOENT' });
  }, 20000);

  it('registers each lock under the path the library uses for its lock directory', async () => {
    await service.withLock('registry-key.json', async (lock) => {
      const registry = (service as unknown as { locksByPath: Map<string, unknown> }).locksByPath;
      expect(registry.get(`${path.resolve(tmpDir, 'registry-key.json')}.lock`)).toBe(lock);
      await expect(fs.stat(`${path.resolve(tmpDir, 'registry-key.json')}.lock`)).resolves.toBeDefined();
      return undefined;
    });
  });

  it('probes the mtime precision once: the second lock of a service skips the utimes probe', async () => {
    let utimesCalls = 0;
    class CountingLockService extends ShortStaleLockService {
      protected override readonly baseFs = {
        mkdir: nodeFs.mkdir,
        rmdir: nodeFs.rmdir,
        rmdirSync: nodeFs.rmdirSync,
        realpath: nodeFs.realpath,
        stat: nodeFs.stat,
        utimes: ((...args: Parameters<typeof nodeFs.utimes>) => { utimesCalls += 1; return nodeFs.utimes(...args); }) as typeof nodeFs.utimes,
      };
    }
    service = new CountingLockService();
    expect(await service.withLock('cache-a.json', async () => 'a')).toBe('a');
    expect(utimesCalls).toBe(1); // the probe of the first lock
    expect(await service.withLock('cache-b.json', async () => 'b')).toBe('b');
    expect(await service.withLock('cache-a.json', async () => 'a2')).toBe('a2');
    expect(utimesCalls).toBe(1); // no probe for the later locks (released before any update)
  });

  it('returns the result and warns when the lock is compromised only after the work wrote', async () => {
    const filename = 'compromised-after-write.json';
    const lockDir = `${path.join(tmpDir, filename)}.lock`;
    const result = await service.withLock(filename, async (lock) => {
      lock.assertHeld(); // the write happens here, under a sound lock
      await fs.rm(lockDir, { recursive: true, force: true });
      await waitFor(() => lock.compromised !== null, 8000, 'the compromise');
      return 'written';
    });
    expect(result).toBe('written');
    expect(compromisedWarnings()).toHaveLength(1);
    expect(warn.mock.calls.some(([m]) => /the work had finished, so its result stands/.test(String(m)))).toBe(true);
  }, 20000);

  it('does not end the process when the update stat fails (not ENOENT) during our release', async () => {
    const filename = 'stat-eperm-on-release.json';
    const lockDir = `${path.join(tmpDir, filename)}.lock`;
    // The library's update stat of the lock directory is slow and then fails
    // with EPERM (Windows, deletion pending); our release runs meanwhile.
    let statCalls = 0;
    let holdStat = false;
    class SlowStatLockService extends ShortStaleLockService {
      protected override readonly baseFs = {
        mkdir: nodeFs.mkdir,
        rmdir: nodeFs.rmdir,
        rmdirSync: nodeFs.rmdirSync,
        realpath: nodeFs.realpath,
        utimes: nodeFs.utimes,
        stat: ((p: nodeFs.PathLike, ...rest: unknown[]) => {
          const cb = rest[rest.length - 1] as (err: NodeJS.ErrnoException | null, stat?: nodeFs.Stats) => void;
          if (holdStat && String(p) === lockDir) {
            statCalls += 1;
            setTimeout(() => cb(Object.assign(new Error('EPERM: operation not permitted, stat'), { code: 'EPERM', syscall: 'stat', path: lockDir })), 300);
            return;
          }
          return (nodeFs.stat as unknown as (...a: unknown[]) => void)(p, ...rest);
        }) as typeof nodeFs.stat,
      };
    }
    service = new SlowStatLockService();

    const result = await service.withLock(filename, async () => {
      holdStat = true;
      // Wait until the library's update timer is inside its (slow) stat, then
      // return: the release below runs while that stat is pending.
      await waitFor(() => statCalls > 0, 8000, 'the update stat');
      return 'done';
    });
    expect(result).toBe('done');
    // Without the fs wrapper the library would now call updateLock on its
    // deleted entry and throw a TypeError in the fs callback (Jest would fail
    // the test with an uncaught exception). Instead the library takes the
    // compromised path and the service logs it at debug, as a release race.
    await waitFor(() => debug.mock.calls.some(([m]) => /ended during its release/.test(String(m))), 8000, 'the release-race log');
    const line = String(debug.mock.calls.find(([m]) => /ended during its release/.test(String(m)))![0]);
    expect(line).toMatch(/code=ECOMPROMISED, originalCode=EPERM, syscall=stat/);
    expect(compromisedWarnings()).toHaveLength(0);
    holdStat = false;

    const next = await service.withLock(filename, async (lock) => {
      lock.assertHeld();
      return 'next-ok';
    });
    expect(next).toBe('next-ok');
  }, 20000);
});
