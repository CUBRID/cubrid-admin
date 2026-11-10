import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

type DesktopSecrets = {
  seed: string;
  salt: string;
};

const SECRETS_FILE = 'secrets.json';

/**
 * The SEED/SALT the server encrypts the workspace's data with, kept in its
 * own data/secrets.json (owner-only). A workspace without one gets new ones.
 */
export function loadOrCreateDesktopSecrets(dataDir: string): DesktopSecrets {
  const filePath = path.join(dataDir, SECRETS_FILE);
  if (fs.existsSync(filePath)) {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as DesktopSecrets;
    if (!parsed.seed || !parsed.salt) {
      throw new Error(`Invalid secrets file: ${filePath}`);
    }
    return parsed;
  }

  const created: DesktopSecrets = {
    seed: crypto.randomBytes(32).toString('hex'),
    salt: crypto.randomBytes(16).toString('hex'),
  };
  fs.writeFileSync(filePath, JSON.stringify(created, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return created;
}
