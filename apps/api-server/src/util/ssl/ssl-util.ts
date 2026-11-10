import * as fs from 'fs';
import * as path from 'path';
import * as selfsigned from 'selfsigned';

export type HttpsKeyCert = { key: Buffer; cert: Buffer };

/**
 * Production: reads PEM paths from `SSL_CERT_PATH` and `SSL_KEY_PATH` (e.g. under `/etc`).
 * Non-production: self-signed certs next to the executable / project (see `getOrCreateSSLCert`).
 */
export function getHttpsOptions(): HttpsKeyCert {
  const certPath = process.env.SSL_CERT_PATH?.trim();
  const keyPath = process.env.SSL_KEY_PATH?.trim();

  // If either path is explicitly configured, both must be present and readable.
  // Silently falling back to a self-signed cert would give operators a false
  // sense of security — the server identity would be wrong and TLS would fail.
  if (certPath || keyPath) {
    if (!certPath || !keyPath) {
      throw new Error(
        `SSL misconfiguration: both SSL_CERT_PATH and SSL_KEY_PATH must be set (got cert=${certPath ?? '(unset)'}, key=${keyPath ?? '(unset)'}).`
      );
    }
    if (!fs.existsSync(certPath)) {
      throw new Error(`SSL_CERT_PATH file not found: ${certPath}`);
    }
    if (!fs.existsSync(keyPath)) {
      throw new Error(`SSL_KEY_PATH file not found: ${keyPath}`);
    }
    return {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    };
  }

  // Neither path configured — auto-generate self-signed cert.
  return getOrCreateSSLCert();
}

/**
 * Retrieves existing SSL certificates or generates new self-signed certificates if they don't exist.
 * Certificates are stored in an 'ssl' directory relative to the executable path (for pkg) or project root.
 *
 * @returns An object containing the SSL key and certificate.
 * @category Utilities
 * @since 1.0.0
 */
function resolveSslDir(): string {
  const configured = process.env.CWM_SSL_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }


  const isPkg = !!(process as any).pkg;
  const baseDir = isPkg ? path.dirname(process.execPath) : path.resolve(__dirname, '..', '..');
  return path.join(baseDir, 'ssl');
}

type SslPaths = { sslDir: string; keyPath: string; certPath: string };

/**
 * The key owner-only (0600), the certificate readable (0644), and the folder
 * owner-only (0700) when it is the server's own (`ownDir`): made by it, or
 * the default ssl/ next to the program. CWM_SSL_DIR may name a folder others
 * use, so an existing one keeps its mode. A change that cannot be made is
 * logged and the server starts anyway. Windows has no such modes: nothing is
 * done there.
 */
export function restrictSslFiles(
  { sslDir, keyPath, certPath }: SslPaths,
  { ownDir, platform = process.platform, warn = console.warn }: { ownDir: boolean; platform?: NodeJS.Platform; warn?: (message: string) => void }
): void {
  if (platform === 'win32') return;
  const targets: Array<[string, number]> = [[keyPath, 0o600], [certPath, 0o644]];
  if (ownDir) targets.push([sslDir, 0o700]);
  for (const [target, mode] of targets) {
    try {
      if ((fs.statSync(target).mode & 0o777) !== mode) fs.chmodSync(target, mode);
    } catch (error) {
      warn(`[ssl] could not set ${target} to ${mode.toString(8)}: ${(error as Error).message}`);
    }
  }
}

export function getOrCreateSSLCert(): HttpsKeyCert {
  const sslDir = resolveSslDir();
  const certPath = path.join(sslDir, 'cert.pem');
  const keyPath = path.join(sslDir, 'key.pem');

  console.log('\t@ sslDir : ', sslDir);
  console.log('\t@ certPath : ', certPath);
  console.log('\t@ keyPath : ', keyPath);

  // Get server IP from environment or network interfaces
  const getServerIPs = (): string[] => {
    const ips: string[] = ['127.0.0.1']; // Always include localhost

    // Try to get IP from environment variable
    const envIP = process.env.SERVER_IP;
    if (envIP) {
      ips.push(envIP);
    }

    // Try to get IPs from network interfaces
    try {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
          // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
          if (iface.family === 'IPv4' && !iface.internal) {
            ips.push(iface.address);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to get network interfaces:', error);
    }

    // Remove duplicates
    return [...new Set(ips)];
  };

  const serverIPs = getServerIPs();
  console.log('Server IPs for SSL certificate:', serverIPs);

  const certExtensions = [
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        ...serverIPs.map((ip) => ({ type: 7, ip })),
      ],
    },
  ];

  const configuredDir = Boolean(process.env.CWM_SSL_DIR?.trim());
  let madeDir = false;
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    if (!fs.existsSync(sslDir)) {
      fs.mkdirSync(sslDir, { recursive: true, mode: 0o700 });
      madeDir = true;
    }
    const pems = selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
      days: 365,
      algorithm: 'sha256',
      keySize: 2048,
      extensions: certExtensions,
    });
    fs.writeFileSync(certPath, pems.cert, { mode: 0o644 });
    fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });
    console.log('SSL created with IPs:', serverIPs);
  } else {
    // Check if certificate needs to be regenerated with new IPs
    // For now, we'll just log - in production you might want to check cert validity
    console.log('Using existing SSL certificate');
  }

  // Also files made before, with the default modes (a world-readable key).
  restrictSslFiles({ sslDir, keyPath, certPath }, { ownDir: madeDir || !configuredDir });

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
}
