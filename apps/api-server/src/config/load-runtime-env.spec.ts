import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadRuntimeEnv } from './load-runtime-env';

describe('loadRuntimeEnv', () => {
  const keys = ['CWM_DESKTOP', 'CWM_TEST_FROM_CONF', 'CWM_TEST_FROM_DOTENV', 'SEED', 'SALT', 'CWM_HOME', 'CWM_CONF_PATH'];
  let saved: Record<string, string | undefined>;
  let cwd: string;
  let dir: string;

  beforeEach(() => {
    saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    keys.forEach((key) => delete process.env[key]);
    process.env.SEED = 'test-seed';
    process.env.SALT = 'test-salt';
    cwd = process.cwd();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-env-'));
    fs.mkdirSync(path.join(dir, 'conf'));
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('never takes CWM_DESKTOP (no app login) from cwm.conf or .env, while loading their other keys', () => {
    fs.writeFileSync(path.join(dir, 'conf', 'cwm.conf'), JSON.stringify({ CWM_DESKTOP: '1', CWM_TEST_FROM_CONF: 'yes' }));
    fs.writeFileSync(path.join(dir, '.env'), 'CWM_DESKTOP=1\nCWM_TEST_FROM_DOTENV=yes\n');

    loadRuntimeEnv();

    expect(process.env.CWM_TEST_FROM_CONF).toBe('yes');
    expect(process.env.CWM_TEST_FROM_DOTENV).toBe('yes');
    expect(process.env.CWM_DESKTOP).toBeUndefined();
  });

  describe('installed (CWM_HOME and CWM_CONF_PATH set by the service)', () => {
    let home: string;
    let etc: string;

    beforeEach(() => {
      home = path.join(dir, 'var-lib');
      etc = path.join(dir, 'etc');
      fs.mkdirSync(home);
      fs.mkdirSync(etc);
      process.env.CWM_HOME = home;
      process.env.CWM_CONF_PATH = path.join(etc, 'cwm.conf');
      delete process.env.SEED;
      delete process.env.SALT;
    });

    it('reads no .env file at all, in CWM_HOME or in the working folder', () => {
      fs.writeFileSync(path.join(home, '.env'), 'CWM_TEST_FROM_DOTENV=home\nSEED=planted\nSALT=planted\n');
      fs.writeFileSync(path.join(dir, '.env'), 'CWM_TEST_FROM_DOTENV=cwd\n');

      loadRuntimeEnv();

      expect(process.env.CWM_TEST_FROM_DOTENV).toBeUndefined();
      expect(process.env.SEED).not.toBe('planted');
      expect(process.env.SALT).not.toBe('planted');
    });

    it('still reads .env without CWM_HOME (portable and source)', () => {
      delete process.env.CWM_HOME;
      delete process.env.CWM_CONF_PATH;
      fs.writeFileSync(path.join(dir, '.env'), 'CWM_TEST_FROM_DOTENV=cwd\n');

      loadRuntimeEnv();

      expect(process.env.CWM_TEST_FROM_DOTENV).toBe('cwd');
    });

    it('reads cwm.conf from CWM_CONF_PATH, not from the working folder', () => {
      fs.writeFileSync(path.join(etc, 'cwm.conf'), JSON.stringify({ CWM_TEST_FROM_CONF: 'etc' }));
      fs.writeFileSync(path.join(dir, 'conf', 'cwm.conf'), JSON.stringify({ CWM_TEST_FROM_CONF: 'cwd' }));

      loadRuntimeEnv();

      expect(process.env.CWM_TEST_FROM_CONF).toBe('etc');
    });

    it('creates cwm-vault/secrets.json in CWM_HOME once, and reuses it on the next start', () => {
      loadRuntimeEnv();
      const secretsPath = path.join(home, 'cwm-vault', 'secrets.json');
      const first = fs.readFileSync(secretsPath, 'utf8');
      expect(JSON.parse(first)).toEqual({ seed: process.env.SEED, salt: process.env.SALT });
      expect(fs.statSync(secretsPath).mode & 0o777).toBe(0o600);

      delete process.env.SEED;
      delete process.env.SALT;
      loadRuntimeEnv();

      expect(fs.readFileSync(secretsPath, 'utf8')).toBe(first);
      expect(fs.existsSync(path.join(dir, 'cwm-vault'))).toBe(false);
    });

    describe('an existing secrets.json that cannot be used is never replaced', () => {
      const secretsPath = () => path.join(home, 'cwm-vault', 'secrets.json');
      const writeVault = (text: string) => {
        fs.mkdirSync(path.dirname(secretsPath()), { recursive: true });
        fs.writeFileSync(secretsPath(), text);
      };

      it('stops on broken JSON, naming the file, and leaves it as it was', () => {
        writeVault('{"seed": "abc", ');
        expect(() => loadRuntimeEnv()).toThrow(secretsPath());
        expect(fs.readFileSync(secretsPath(), 'utf8')).toBe('{"seed": "abc", ');
        expect(process.env.SEED).toBeUndefined();
      });

      it('stops when seed or salt is missing', () => {
        writeVault(JSON.stringify({ seed: 'only-seed' }));
        expect(() => loadRuntimeEnv()).toThrow(/has no seed or salt/);
        expect(JSON.parse(fs.readFileSync(secretsPath(), 'utf8'))).toEqual({ seed: 'only-seed' });
      });

      const canTestPermissions = process.platform !== 'win32' && process.getuid?.() !== 0;
      (canTestPermissions ? it : it.skip)('stops when the file cannot be read', () => {
        writeVault(JSON.stringify({ seed: 's', salt: 't' }));
        fs.chmodSync(secretsPath(), 0o000);
        try {
          expect(() => loadRuntimeEnv()).toThrow(secretsPath());
        } finally {
          fs.chmodSync(secretsPath(), 0o600);
        }
        expect(JSON.parse(fs.readFileSync(secretsPath(), 'utf8'))).toEqual({ seed: 's', salt: 't' });
      });

      it('leaves no secrets.json when writing it fails part-way, so the next start can create it', () => {
        // The fs module object itself: the namespace import above cannot be spied on.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodeFs: typeof fs = require('fs');
        const realWrite = nodeFs.writeFileSync;
        const spy = jest.spyOn(nodeFs, 'writeFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
          if (typeof file === 'number') {
            throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
          }
          return (realWrite as (...args: unknown[]) => void)(file, ...rest);
        }) as typeof fs.writeFileSync);
        try {
          expect(() => loadRuntimeEnv()).toThrow(/Cannot create .*ENOSPC/);
        } finally {
          spy.mockRestore();
        }
        expect(fs.existsSync(secretsPath())).toBe(false);
        expect(fs.readdirSync(path.dirname(secretsPath()))).toEqual([]);

        delete process.env.SEED;
        delete process.env.SALT;
        loadRuntimeEnv();
        expect(JSON.parse(fs.readFileSync(secretsPath(), 'utf8')).seed).toBe(process.env.SEED);
      });

      it('uses the secrets.json another start created first, instead of stopping', () => {
        const other = { seed: 'other-start-seed', salt: 'other-start-salt' };
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodeFs: typeof fs = require('fs');
        const realLink = nodeFs.linkSync;
        const spy = jest.spyOn(nodeFs, 'linkSync').mockImplementation(((existing: fs.PathLike, created: fs.PathLike) => {
          nodeFs.writeFileSync(created, JSON.stringify(other));
          return realLink(existing, created);
        }) as typeof fs.linkSync);
        try {
          loadRuntimeEnv();
        } finally {
          spy.mockRestore();
        }
        expect(process.env.SEED).toBe(other.seed);
        expect(process.env.SALT).toBe(other.salt);
        expect(JSON.parse(fs.readFileSync(secretsPath(), 'utf8'))).toEqual(other);
        expect(fs.readdirSync(path.dirname(secretsPath()))).toEqual(['secrets.json']);
      });

      describe('on a file system without hard links', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodeFs: typeof fs = require('fs');
        const noLinks = () =>
          jest.spyOn(nodeFs, 'linkSync').mockImplementation((() => {
            throw Object.assign(new Error('EPERM: operation not permitted, link'), { code: 'EPERM' });
          }) as typeof fs.linkSync);
        afterEach(() => jest.restoreAllMocks());

        it('copies it into place', () => {
          noLinks();
          loadRuntimeEnv();
          expect(JSON.parse(fs.readFileSync(secretsPath(), 'utf8'))).toEqual({ seed: process.env.SEED, salt: process.env.SALT });
          expect(fs.readdirSync(path.dirname(secretsPath()))).toEqual(['secrets.json']);
        });

        it('removes its own copy when the copy fails part-way', () => {
          noLinks();
          jest.spyOn(nodeFs, 'copyFileSync').mockImplementation(((src: fs.PathLike, dest: fs.PathLike) => {
            nodeFs.writeFileSync(dest, nodeFs.readFileSync(src).subarray(0, 10));
            throw Object.assign(new Error('ENOSPC: no space left on device, copyfile'), { code: 'ENOSPC' });
          }) as typeof fs.copyFileSync);
          expect(() => loadRuntimeEnv()).toThrow(/Cannot create .*ENOSPC/);
          expect(fs.readdirSync(path.dirname(secretsPath()))).toEqual([]);
        });

        it('uses the one another start copied first', () => {
          const other = { seed: 'copied-first-seed', salt: 'copied-first-salt' };
          noLinks();
          jest.spyOn(nodeFs, 'copyFileSync').mockImplementation(((_src: fs.PathLike, dest: fs.PathLike) => {
            nodeFs.writeFileSync(dest, JSON.stringify(other));
            throw Object.assign(new Error('EEXIST: file already exists, copyfile'), { code: 'EEXIST' });
          }) as typeof fs.copyFileSync);
          loadRuntimeEnv();
          expect(process.env.SEED).toBe(other.seed);
          expect(JSON.parse(fs.readFileSync(secretsPath(), 'utf8'))).toEqual(other);
        });
      });

      it('stops, and creates nothing, when checking the file fails with anything but ENOENT (an ACL)', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodeFs: typeof fs = require('fs');
        const realStat = nodeFs.statSync;
        const spy = jest.spyOn(nodeFs, 'statSync').mockImplementation(((p: fs.PathLike, ...rest: unknown[]) => {
          if (String(p).endsWith('secrets.json')) {
            throw Object.assign(new Error('EPERM: operation not permitted, stat'), { code: 'EPERM' });
          }
          return (realStat as (...args: unknown[]) => unknown)(p, ...rest);
        }) as typeof fs.statSync);
        try {
          expect(() => loadRuntimeEnv()).toThrow(/Cannot check .*secrets\.json.*EPERM/);
        } finally {
          spy.mockRestore();
        }
        expect(fs.existsSync(path.dirname(secretsPath())) && fs.readdirSync(path.dirname(secretsPath())).length).toBeFalsy();
        expect(process.env.SEED).toBeUndefined();
      });

      it('creates it only when it does not exist', () => {
        expect(fs.existsSync(secretsPath())).toBe(false);
        loadRuntimeEnv();
        expect(JSON.parse(fs.readFileSync(secretsPath(), 'utf8'))).toEqual({ seed: process.env.SEED, salt: process.env.SALT });
      });
    });
  });
});
