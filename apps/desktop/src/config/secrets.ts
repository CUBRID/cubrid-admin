import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

type DesktopSecrets = {
  seed: string;
  salt: string;
};

const SECRETS_FILE = 'secrets.json';

/**
 * False only when the file really does not exist (ENOENT); any other error
 * (an ACL, an I/O error) stops instead of being read as "absent", which would
 * make new keys for a workspace that has data.
 */
function secretsFileExists(filePath: string): boolean {
  try {
    fs.statSync(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw new Error(`Cannot check ${filePath}: ${(error as Error).message}`);
  }
}

/**
 * The SEED/SALT the server encrypts the workspace's data with, kept in its
 * own data/secrets.json (owner-only). A workspace without one gets new ones.
 */
export function loadOrCreateDesktopSecrets(dataDir: string): DesktopSecrets {
  const filePath = path.join(dataDir, SECRETS_FILE);
  if (secretsFileExists(filePath)) {
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
