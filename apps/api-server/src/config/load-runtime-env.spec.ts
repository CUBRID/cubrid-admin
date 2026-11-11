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
  });
});
