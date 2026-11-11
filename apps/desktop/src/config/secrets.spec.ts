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

  describe('an existing secrets.json that cannot be used is never replaced', () => {
    const file = () => path.join(base, 'secrets.json');

    it('stops on broken JSON, naming the file, and leaves it as it was', () => {
      fs.writeFileSync(file(), '{"seed": ');
      expect(() => loadOrCreateDesktopSecrets(base)).toThrow(file());
      expect(fs.readFileSync(file(), 'utf8')).toBe('{"seed": ');
    });

    it('stops when seed or salt is missing', () => {
      fs.writeFileSync(file(), JSON.stringify({ seed: 'x' }));
      expect(() => loadOrCreateDesktopSecrets(base)).toThrow(file());
      expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toEqual({ seed: 'x' });
    });

    const canTestPermissions = process.platform !== 'win32' && process.getuid?.() !== 0;
    (canTestPermissions ? it : it.skip)('stops when the file cannot be read', () => {
      fs.writeFileSync(file(), JSON.stringify({ seed: 's', salt: 't' }));
      fs.chmodSync(file(), 0o000);
      try {
        expect(() => loadOrCreateDesktopSecrets(base)).toThrow(file());
      } finally {
        fs.chmodSync(file(), 0o600);
      }
      expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toEqual({ seed: 's', salt: 't' });
    });
  });

  it('stops, and creates nothing, when checking the file fails with anything but ENOENT', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeFs: typeof fs = require('fs');
    const spy = jest.spyOn(nodeFs, 'statSync').mockImplementation((() => {
      throw Object.assign(new Error('EACCES: permission denied, stat'), { code: 'EACCES' });
    }) as typeof fs.statSync);
    try {
      expect(() => loadOrCreateDesktopSecrets(base)).toThrow(/Cannot check .*secrets\.json.*EACCES/);
    } finally {
      spy.mockRestore();
    }
    expect(fs.existsSync(path.join(base, 'secrets.json'))).toBe(false);
  });
});
