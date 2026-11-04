import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { config as loadEnv } from 'dotenv';
import { parseCliArgs } from './parse-cli-args';

const CWM_CONF_FILENAME = 'cwm.conf';
const CWM_CONF_SUBDIR = 'conf';

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

function loadCwmConf(confDir: string): void {
  const confPath = path.join(confDir, CWM_CONF_FILENAME);
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

function readSecrets(secretsPath: string): CwmSecrets | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) as CwmSecrets;
    if (parsed.seed && parsed.salt) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeSecrets(vaultDir: string, secrets: CwmSecrets): void {
  fs.mkdirSync(vaultDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(vaultDir, CWM_VAULT_SECRETS_FILENAME),
    JSON.stringify(secrets, null, 2),
    { encoding: 'utf8', mode: 0o600 }
  );
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
    // Only generate new secrets for values not already set.
    secrets = {
      seed: crypto.randomBytes(32).toString('hex'),
      salt: crypto.randomBytes(32).toString('hex'),
    };
    try {
      writeSecrets(vaultDir, secrets);
      console.log(`[cwm-vault] secrets generated: ${secretsPath}`);
    } catch (err) {
      console.warn(`[cwm-vault] could not write secrets:`, (err as Error).message);
    }
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
  const isPkg = !!(process as any).pkg;
  const baseDir = isPkg ? path.dirname(process.execPath) : process.cwd();
  const confDir = resolveCwmConfDir(baseDir);
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
 * Loads env before Nest bootstrap (pkg-aware base dir).
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
    return;
  }

  const args = parseCliArgs(process.argv.slice(2));
  const rawMode = (
    args.ENV ??
    args.ENVIRONMENT ??
    process.env.ENVIRONMENT ??
    'development'
  ).toLowerCase();
  const isProduction = rawMode === 'production';
  const isPkg = !!(process as any).pkg;
  const baseDir = isPkg ? path.dirname(process.execPath) : process.cwd();

  // 1. .env first — so legacy SEED/SALT are in process.env before vault runs.
  const candidates: string[] = [];
  if (isProduction) {
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

  // 2. conf/cwm.conf — user-editable settings (throws on parse error).
  const confDir = resolveCwmConfDir(baseDir);
  const confPath = confDir ? path.join(confDir, CWM_CONF_FILENAME) : null;
  if (confPath && (isPkg || fs.existsSync(confPath))) {
    loadCwmConf(confDir ?? baseDir);
  }

  // 3. cwm-vault — SEED/SALT, only for values not already set above.
  const vaultExists = fs.existsSync(path.join(getVaultDir(baseDir), CWM_VAULT_SECRETS_FILENAME));
  if (isPkg || vaultExists) {
    loadOrCreateVaultSecrets(baseDir);
  }
}
