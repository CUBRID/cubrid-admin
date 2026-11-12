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
    // Never replaced: it holds the keys of the workspace's saved hosts and passwords.
    let parsed: Partial<DesktopSecrets>;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      throw new Error(`Cannot read ${filePath}: ${(error as Error).message}`);
    }
    if (!parsed?.seed || !parsed?.salt) {
      throw new Error(`Invalid secrets file: ${filePath}`);
    }
    return parsed as DesktopSecrets;
  }

  const created: DesktopSecrets = {
    seed: crypto.randomBytes(32).toString('hex'),
    salt: crypto.randomBytes(16).toString('hex'),
  };
  fs.writeFileSync(filePath, JSON.stringify(created, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return created;
}
