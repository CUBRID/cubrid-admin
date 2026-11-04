import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadRuntimeEnv } from './load-runtime-env';

describe('loadRuntimeEnv', () => {
  const keys = ['CWM_DESKTOP', 'CWM_TEST_FROM_CONF', 'CWM_TEST_FROM_DOTENV', 'SEED', 'SALT'];
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
});
