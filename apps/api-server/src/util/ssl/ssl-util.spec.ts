import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('selfsigned', () => ({ generate: () => ({ cert: 'CERT', private: 'KEY' }) }));

import { getOrCreateSSLCert, restrictSslFiles } from './ssl-util';

const unixOnly = process.platform === 'win32' ? it.skip : it;
const modeOf = (p: string) => fs.statSync(p).mode & 0o777;

describe('ssl file modes', () => {
  let base: string;
  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-ssl-'));
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    delete process.env.CWM_SSL_DIR;
    jest.restoreAllMocks();
    fs.rmSync(base, { recursive: true, force: true });
  });

  unixOnly('makes a new folder owner-only, the key owner-only and the certificate readable', () => {
    process.env.CWM_SSL_DIR = path.join(base, 'ssl');
    getOrCreateSSLCert();
    expect(modeOf(path.join(base, 'ssl'))).toBe(0o700);
    expect(modeOf(path.join(base, 'ssl', 'key.pem'))).toBe(0o600);
    expect(modeOf(path.join(base, 'ssl', 'cert.pem'))).toBe(0o644);
  });

  unixOnly('narrows a key made before to owner-only, and leaves a configured folder it did not make as it is', () => {
    const dir = path.join(base, 'shared');
    fs.mkdirSync(dir, { mode: 0o755 });
    fs.chmodSync(dir, 0o755);
    fs.writeFileSync(path.join(dir, 'key.pem'), 'KEY', { mode: 0o644 });
    fs.writeFileSync(path.join(dir, 'cert.pem'), 'CERT', { mode: 0o644 });
    process.env.CWM_SSL_DIR = dir;
    getOrCreateSSLCert();
    expect(modeOf(path.join(dir, 'key.pem'))).toBe(0o600);
    expect(modeOf(dir)).toBe(0o755);
  });

  unixOnly('narrows its own folder made before', () => {
    const dir = path.join(base, 'own');
    fs.mkdirSync(dir, { mode: 0o755 });
    fs.chmodSync(dir, 0o755);
    const paths = { sslDir: dir, keyPath: path.join(dir, 'key.pem'), certPath: path.join(dir, 'cert.pem') };
    fs.writeFileSync(paths.keyPath, 'KEY', { mode: 0o644 });
    fs.writeFileSync(paths.certPath, 'CERT', { mode: 0o600 });
    restrictSslFiles(paths, { ownDir: true });
    expect(modeOf(dir)).toBe(0o700);
    expect(modeOf(paths.keyPath)).toBe(0o600);
    expect(modeOf(paths.certPath)).toBe(0o644);
  });

  it('only warns when a mode cannot be changed, and does nothing on Windows', () => {
    const paths = { sslDir: path.join(base, 'none'), keyPath: path.join(base, 'none', 'key.pem'), certPath: path.join(base, 'none', 'cert.pem') };
    const warn = jest.fn();
    expect(() => restrictSslFiles(paths, { ownDir: true, platform: 'linux', warn })).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls[0][0]).toContain('key.pem');

    // Windows: files are left as they are, and nothing is said.
    const dir = path.join(base, 'win');
    fs.mkdirSync(dir);
    const winPaths = { sslDir: dir, keyPath: path.join(dir, 'key.pem'), certPath: path.join(dir, 'cert.pem') };
    fs.writeFileSync(winPaths.keyPath, 'KEY');
    fs.chmodSync(winPaths.keyPath, 0o644);
    const winWarn = jest.fn();
    restrictSslFiles(winPaths, { ownDir: true, platform: 'win32', warn: winWarn });
    expect(winWarn).not.toHaveBeenCalled();
    if (process.platform !== 'win32') expect(modeOf(winPaths.keyPath)).toBe(0o644);
  });

  unixOnly('leaves a linked key, certificate or folder as it is', () => {
    const shared = path.join(base, 'letsencrypt');
    fs.mkdirSync(shared);
    fs.writeFileSync(path.join(shared, 'privkey.pem'), 'KEY', { mode: 0o640 });
    fs.chmodSync(path.join(shared, 'privkey.pem'), 0o640);
    fs.writeFileSync(path.join(shared, 'cert.pem'), 'CERT', { mode: 0o600 });
    fs.chmodSync(path.join(shared, 'cert.pem'), 0o600);
    fs.chmodSync(shared, 0o755);
    const dir = path.join(base, 'ssl');
    fs.symlinkSync(shared, dir);
    const paths = { sslDir: dir, keyPath: path.join(base, 'key-link.pem'), certPath: path.join(base, 'cert-link.pem') };
    fs.symlinkSync(path.join(shared, 'privkey.pem'), paths.keyPath);
    fs.symlinkSync(path.join(shared, 'cert.pem'), paths.certPath);
    const warn = jest.fn();
    restrictSslFiles(paths, { ownDir: true, warn });
    expect(modeOf(path.join(shared, 'privkey.pem'))).toBe(0o640);
    expect(modeOf(path.join(shared, 'cert.pem'))).toBe(0o600);
    expect(modeOf(shared)).toBe(0o755);
    expect(warn).not.toHaveBeenCalled();
  });

  unixOnly('makes missing parent folders with the usual mode and only ssl/ owner-only', () => {
    process.env.CWM_SSL_DIR = path.join(base, 'a', 'b', 'ssl');
    getOrCreateSSLCert();
    const usual = 0o777 & ~process.umask();
    expect(modeOf(path.join(base, 'a'))).toBe(usual);
    expect(modeOf(path.join(base, 'a', 'b'))).toBe(usual);
    expect(modeOf(path.join(base, 'a', 'b', 'ssl'))).toBe(0o700);
  });

  unixOnly('says to check the ssl/ owner and permissions when the key cannot be read, and still fails', () => {
    const dir = path.join(base, 'ssl');
    fs.mkdirSync(dir);
    const locked = path.join(base, 'locked-key.pem');
    fs.writeFileSync(locked, 'KEY');
    fs.chmodSync(locked, 0o000);
    fs.symlinkSync(locked, path.join(dir, 'key.pem')); // left as it is, so the read is refused
    fs.writeFileSync(path.join(dir, 'cert.pem'), 'CERT');
    process.env.CWM_SSL_DIR = dir;
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => getOrCreateSSLCert()).toThrow(/EACCES/);
      expect(error.mock.calls[0][0]).toContain(path.join(dir, 'key.pem'));
      expect(error.mock.calls[0][0]).toContain('check the owner and permissions');
    } finally {
      fs.chmodSync(locked, 0o600);
    }
  });
});

