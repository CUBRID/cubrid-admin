import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { config as loadEnv } from 'dotenv';
import { parseCliArgs } from './parse-cli-args';
import { CMS_MAX_CONCURRENT_REQUESTS_PER_HOST } from './cms-concurrency';
import { TOPSQL_MAX_LOG_LINES, TOPSQL_MAX_LOG_MB } from './topsql-limits';
import { refuseInstalledCopyWithoutHome, serverHome } from './server-home';
import { isStandaloneExecutable } from '../util/standalone-executable';

const CWM_CONF_FILENAME = 'cwm.conf';
const CWM_CONF_SUBDIR = 'conf';
/** Keys the desktop app reads from its workspace cwm.conf (CWM_CONF_PATH). */
const DESKTOP_CONF_KEYS = [CMS_MAX_CONCURRENT_REQUESTS_PER_HOST, TOPSQL_MAX_LOG_LINES, TOPSQL_MAX_LOG_MB] as const;

const CWM_VAULT_DIRNAME = 'cwm-vault';
const CWM_VAULT_SECRETS_FILENAME = 'secrets.json';

type CwmConf = Record<string, string>;
type CwmSecrets = { seed: string; salt: string };

// ── conf/cwm.conf ────────────────────────────────────────────────────────────

function readCwmConf(confPath: string): CwmConf {
  if (!fs.existsSync(confPath)) {
    return {};
  }
  // A config file that exists but cannot be parsed is a hard error.
  // Silently continuing with defaults risks starting on the wrong port or
  // storage path, which looks like data loss to the operator.
  let raw: string;
  try {
    raw = fs.readFileSync(confPath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read ${confPath}: ${(err as Error).message}`);
  }
  try {
    return JSON.parse(raw) as CwmConf;
  } catch (err) {
    throw new Error(`Invalid JSON in ${confPath}: ${(err as Error).message}`);
  }
}

function injectIntoEnv(conf: CwmConf): void {
  for (const [key, value] of Object.entries(conf)) {
    if (process.env[key] === undefined && typeof value === 'string') {
      process.env[key] = value;
    }
  }
}

function loadCwmConf(confPath: string): void {
  const conf = readCwmConf(confPath);

  // SEED/SALT belong in cwm-vault/secrets.json, not here.
  delete conf.SEED;
  delete conf.SALT;

  injectIntoEnv(conf);
  if (fs.existsSync(confPath)) {
    console.log(`[cwm.conf] loaded: ${confPath}`);
  }
}

// ── cwm-vault/secrets.json ───────────────────────────────────────────────────

function getVaultDir(baseDir: string): string {
  return path.join(baseDir, CWM_VAULT_DIRNAME);
}

const SECRETS_KEPT =
  'It holds the keys of the saved hosts and passwords, so it is never replaced. ' +
  'Restore it from a backup or fix its permissions, then start again.';

/**
 * True when secrets.json exists, false only when it really does not (ENOENT).
 * Any other error (EPERM/EACCES from an ACL, an I/O error) stops the start:
 * fs.existsSync would report those as "absent", and new keys would be made.
 */
function secretsFileExists(secretsPath: string): boolean {
  try {
    fs.statSync(secretsPath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw new Error(`Cannot check ${secretsPath}: ${(err as Error).message}. ${SECRETS_KEPT}`);
  }
}

/** The saved SEED/SALT, or null when there is no secrets.json yet. Never null for a file that exists. */
function readSecrets(secretsPath: string): CwmSecrets | null {
  if (!secretsFileExists(secretsPath)) {
    return null;
  }
  let parsed: Partial<CwmSecrets>;
  try {
    parsed = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot read ${secretsPath}: ${(err as Error).message}. ${SECRETS_KEPT}`);
  }
  if (!parsed?.seed || !parsed?.salt) {
    throw new Error(`${secretsPath} has no seed or salt. ${SECRETS_KEPT}`);
  }
  return parsed as CwmSecrets;
}

/** secrets.json that another start created first (EEXIST): it must be there and usable. */
function readExistingSecrets(target: string): CwmSecrets {
  const secrets = readSecrets(target);
  if (!secrets) {
    throw new Error(`${target} was reported as existing but cannot be found. ${SECRETS_KEPT}`);
  }
  return secrets;
}

/**
 * For a file system without hard links: copies the synced temporary file to
 * secrets.json, never replacing one. A copy that fails part-way is removed again
 * (only when it is our own partial copy), and one another start made first is read.
 */
function copySecretsIntoPlace(temp: string, target: string, secrets: CwmSecrets): CwmSecrets {
  const content = fs.readFileSync(temp);
  try {
    fs.copyFileSync(temp, target, fs.constants.COPYFILE_EXCL);
    const fd = fs.openSync(target, 'r+');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return secrets;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      return readExistingSecrets(target);
    }
    let left: Buffer | null = null;
    try {
      left = fs.readFileSync(target);
    } catch {
      // nothing was created
    }
    if (left && content.subarray(0, left.length).equals(left)) {
      fs.rmSync(target, { force: true });
    }
    throw err;
  }
}

/**
 * Creates secrets.json with `secrets`, all or nothing: the content is written
 * and synced to a temporary file in the same folder, which is then linked into
 * place only if no secrets.json exists. A failed write leaves no secrets.json;
 * when another start created it first, that file is read and its keys returned.
 */
function writeSecrets(vaultDir: string, secrets: CwmSecrets): CwmSecrets {
  fs.mkdirSync(vaultDir, { recursive: true, mode: 0o700 });
  const target = path.join(vaultDir, CWM_VAULT_SECRETS_FILENAME);
  const temp = path.join(vaultDir, `.${CWM_VAULT_SECRETS_FILENAME}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  try {
    const fd = fs.openSync(temp, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(secrets, null, 2), 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try {
      // A hard link never replaces an existing file.
      fs.linkSync(temp, target);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') {
        return readExistingSecrets(target);
      }
      // Any other link error means hard links are not usable here: EPERM,
      // ENOTSUP, ENOSYS, or EISDIR, which Windows reports for FAT32/exFAT (a USB
      // stick). The copy never replaces a file either, and a folder that really
      // cannot be written still fails there.
      return copySecretsIntoPlace(temp, target, secrets);
    }
    return secrets;
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

/**
 * Load SEED/SALT from cwm-vault/secrets.json, but only for values not already
 * set by a higher-priority source (env file, system env).
 * This preserves compatibility with legacy deployments that store SEED/SALT
 * in .env — the vault must not silently replace them.
 */
function loadOrCreateVaultSecrets(baseDir: string): void {
  // Skip entirely if both values are already provided (e.g. from .env).
  if (process.env.SEED !== undefined && process.env.SALT !== undefined) {
    return;
  }

  const vaultDir = getVaultDir(baseDir);
  const secretsPath = path.join(vaultDir, CWM_VAULT_SECRETS_FILENAME);

  let secrets = readSecrets(secretsPath);

  if (!secrets) {
    // Only when there is no secrets.json at all. Keys that cannot be saved
    // would be lost on the next start, together with everything encrypted with
    // them, so a failed write stops the start too.
    const generated: CwmSecrets = {
      seed: crypto.randomBytes(32).toString('hex'),
      salt: crypto.randomBytes(32).toString('hex'),
    };
    try {
      secrets = writeSecrets(vaultDir, generated);
    } catch (err) {
      throw new Error(`Cannot create ${secretsPath}: ${(err as Error).message}.`);
    }
    console.log(
      secrets === generated
        ? `[cwm-vault] secrets generated: ${secretsPath}`
        : `[cwm-vault] secrets loaded (created by another start): ${secretsPath}`
    );
  }

  if (process.env.SEED === undefined) process.env.SEED = secrets.seed;
  if (process.env.SALT === undefined) process.env.SALT = secrets.salt;
}

// ── conf/ resolution ─────────────────────────────────────────────────────────

function resolveCwmConfDir(baseDir: string): string | null {
  const subDir = path.join(baseDir, CWM_CONF_SUBDIR);
  if (fs.existsSync(path.join(subDir, CWM_CONF_FILENAME))) {
    return subDir;
  }
  if (fs.existsSync(path.join(baseDir, CWM_CONF_FILENAME))) {
    return baseDir;
  }
  return path.join(baseDir, CWM_CONF_SUBDIR);
}

/**
 * Resolves the same cwm.conf path `loadRuntimeEnv()` reads at boot, so a
 * hot-reload watcher can watch the exact file that was actually loaded
 * rather than re-deriving (and potentially drifting from) the logic.
 */
export function resolveCwmConfPath(): string {
  // The desktop app keeps cwm.conf in its workspace and passes the path; the
  // Linux installer passes /etc/cubrid-admin/cwm.conf.
  const explicit = process.env.CWM_CONF_PATH?.trim();
  if (explicit) return explicit;
  const confDir = resolveCwmConfDir(serverHome(process.cwd()));
  return path.join(confDir, CWM_CONF_FILENAME);
}

/**
 * Re-reads cwm.conf and returns its raw key/value map, or `null` if the file
 * is missing or fails to parse. Unlike `loadRuntimeEnv()`'s boot-time
 * `readCwmConf`, this never throws — a malformed edit to a running server's
 * config should be reported and ignored, not crash the process.
 */
export function readCwmConfSafe(confPath: string): CwmConf | null {
  try {
    if (!fs.existsSync(confPath)) return null;
    return JSON.parse(fs.readFileSync(confPath, 'utf8')) as CwmConf;
  } catch {
    return null;
  }
}

// ── entry point ──────────────────────────────────────────────────────────────

/**
 * Loads env before Nest bootstrap (base dir beside the single executable when run as one).
 *
 * Priority (highest to lowest):
 *   1. process.env already set (systemd EnvironmentFile etc.)
 *   2. .env file  — legacy SEED/SALT and other config (loaded first so vault
 *                   does not shadow values that existing installs rely on)
 *   3. conf/cwm.conf  — user config (PORT, ENVIRONMENT, etc.)
 *   4. cwm-vault/secrets.json  — SEED/SALT (auto-generated; skipped if
 *                                already provided by steps 1–2)
 */
export function loadRuntimeEnv(): void {
  if ((process.env.CWM_DESKTOP ?? '').trim() === '1') {
    // The desktop app sets everything else itself; from the workspace
    // cwm.conf it takes only the keys that change how CMS is called
    // and how much of a log Top SQL reads.
    const conf = process.env.CWM_CONF_PATH ? readCwmConfSafe(process.env.CWM_CONF_PATH) : null;
    for (const key of DESKTOP_CONF_KEYS) {
      if (conf && key in conf && process.env[key] === undefined) process.env[key] = String(conf[key]);
    }
    return;
  }
  // Desktop mode drops the app login, so only the environment the desktop
  // app starts the server with may turn it on — never .env or cwm.conf.
  const desktopFlag = process.env.CWM_DESKTOP;
  try {
    loadRuntimeEnvFiles();
  } finally {
    if (desktopFlag === undefined) {
      delete process.env.CWM_DESKTOP;
    } else {
      process.env.CWM_DESKTOP = desktopFlag;
    }
  }
}

function loadRuntimeEnvFiles(): void {
  refuseInstalledCopyWithoutHome();
  const args = parseCliArgs(process.argv.slice(2));
  const rawMode = (
    args.ENV ??
    args.ENVIRONMENT ??
    process.env.ENVIRONMENT ??
    'development'
  ).toLowerCase();
  const isProduction = rawMode === 'production';
  const isStandalone = isStandaloneExecutable();
  // CWM_HOME (installers), beside the executable (portable) or the working folder (source).
  const baseDir = serverHome(process.cwd());
  const isInstalled = Boolean(process.env.CWM_HOME?.trim());

  // 1. .env first — so legacy SEED/SALT are in process.env before vault runs.
  //    Not for the installed server (CWM_HOME set by its service): its settings
  //    come only from the service definition and cwm.conf, so a file another
  //    local user drops into the data folder is never read.
  const candidates: string[] = [];
  if (isInstalled) {
    // no .env
  } else if (isProduction) {
    candidates.push('/etc/cubrid-webmanager.env');
    candidates.push(path.join(baseDir, 'apps/api-server/.env'));
    candidates.push(path.join(baseDir, '.env'));
  } else {
    candidates.push(path.join(baseDir, '.env'));
    candidates.push(path.join(baseDir, 'apps/api-server/.env'));
  }
  const envFilePath = candidates.find((p) => fs.existsSync(p)) ?? null;
  if (envFilePath) {
    loadEnv({ path: envFilePath, override: false });
  }

  // 2. cwm.conf — user-editable settings (throws on parse error): CWM_CONF_PATH
  //    when set, otherwise conf/cwm.conf (or cwm.conf) in the base folder.
  loadCwmConf(resolveCwmConfPath());

  // 3. cwm-vault — SEED/SALT, only for values not already set above.
  const vaultExists = secretsFileExists(path.join(getVaultDir(baseDir), CWM_VAULT_SECRETS_FILENAME));
  if (isStandalone || isInstalled || vaultExists) {
    loadOrCreateVaultSecrets(baseDir);
  }
}
