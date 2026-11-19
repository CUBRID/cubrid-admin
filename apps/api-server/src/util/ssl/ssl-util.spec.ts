import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getHttpsOptions, getOrCreateSSLCert } from './ssl-util';

// The first start of a fresh installation: no certificate yet, so one is
// made (selfsigned 5, without node-forge) and kept for the next start.
describe('self-signed certificate on the first start', () => {
  let dir: string;
  const saved = { ssl: process.env.CWM_SSL_DIR, cert: process.env.SSL_CERT_PATH, key: process.env.SSL_KEY_PATH };
  let log: jest.SpyInstance;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-ssl-'));
    process.env.CWM_SSL_DIR = path.join(dir, 'ssl');
    delete process.env.SSL_CERT_PATH;
    delete process.env.SSL_KEY_PATH;
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    log.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
    for (const [name, value] of [['CWM_SSL_DIR', saved.ssl], ['SSL_CERT_PATH', saved.cert], ['SSL_KEY_PATH', saved.key]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('makes a certificate for localhost and this machine, valid for a year, with its key', async () => {
    const { cert, key } = await getHttpsOptions();
    expect(fs.existsSync(path.join(dir, 'ssl', 'cert.pem'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'ssl', 'key.pem'))).toBe(true);

    const x509 = new crypto.X509Certificate(cert);
    expect(x509.subject).toContain('CN=localhost');
    expect(x509.subjectAltName).toContain('DNS:localhost');
    expect(x509.subjectAltName).toContain('IP Address:127.0.0.1');
    const days = (Date.parse(x509.validTo) - Date.parse(x509.validFrom)) / 86_400_000;
    expect(Math.round(days)).toBe(365);
    expect(x509.checkPrivateKey(crypto.createPrivateKey(key))).toBe(true);
    expect(crypto.createPublicKey(cert).asymmetricKeyDetails?.modulusLength).toBe(2048);
  });

  it('keeps the certificate it made for the next start', async () => {
    const first = await getOrCreateSSLCert();
    const second = await getOrCreateSSLCert();
    expect(second.cert.equals(first.cert)).toBe(true);
    expect(second.key.equals(first.key)).toBe(true);
  });
});
