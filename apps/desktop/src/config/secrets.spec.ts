import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadOrCreateDesktopSecrets } from './secrets';

describe('loadOrCreateDesktopSecrets', () => {
  let base: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-secrets-'));
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('gives each workspace its own SEED/SALT, made once in its data folder', () => {
    const a = path.join(base, 'a');
    const b = path.join(base, 'b');
    fs.mkdirSync(a);
    fs.mkdirSync(b);

    const first = loadOrCreateDesktopSecrets(a);
    expect(loadOrCreateDesktopSecrets(a)).toEqual(first);
    expect(loadOrCreateDesktopSecrets(b)).not.toEqual(first);
    if (process.platform !== 'win32') {
      expect(fs.statSync(path.join(a, 'secrets.json')).mode & 0o777).toBe(0o600);
    }
  });
});
