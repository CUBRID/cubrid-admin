import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as zlib from 'zlib';
import { WorkspaceError } from './workspace-check';

/*
 * A workspace export: the files that make up its data, packed and encrypted
 * with a password the user chooses.
 *
 * File layout (all of the header is the AES-GCM additional data):
 *   "CUBRIDWS" | version (1) | scrypt log2 N, r, p (1 each) | salt (16) |
 *   iv (12) | password check (32) | ciphertext | GCM tag (16)
 * scrypt gives 64 bytes: the first 32 are the AES-256-GCM key, the last 32
 * the password check. A different check is a wrong password; a matching one
 * with a failing tag (or a cut file) is a damaged file.
 * The plaintext is gzip of { format, version, createdAt, files: [{ path, data }] }.
 */

export const WORKSPACE_ARCHIVE_EXTENSION = 'cubridws';

const MAGIC = Buffer.from('CUBRIDWS', 'ascii');
const VERSION = 1;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const CHECK_BYTES = 32;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + 1 + 3 + SALT_BYTES + IV_BYTES + CHECK_BYTES;
const PAYLOAD_FORMAT = 'cubrid-admin-workspace';

// scrypt N = 2^17, r = 8, p = 1 (128 MiB). Version 1 is opened with exactly
// these: a file naming others is damaged, so a crafted one cannot make the
// app spend more memory or time than a real export.
const KDF = { logN: 17, r: 8, p: 1 };
const SCRYPT_MAXMEM = 128 * 2 ** KDF.logN * KDF.r + 32 * 1024 * 1024;
const scrypt = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number, options: crypto.ScryptOptions) => Promise<Buffer>;

/** The shortest password an export takes (it locks the key to every saved password). */
export const MIN_EXPORT_PASSWORD_LENGTH = 8;

const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;

/** What a workspace export holds; nothing else is written back. */
const USER_FILE = /^data\/storage\/[0-9a-f]{64}$/;
const SECRETS = 'data/secrets.json';
const CONF = 'conf/cwm.conf';
const isExportedPath = (p: string) => USER_FILE.test(p) || p === SECRETS || p === CONF;

export type ArchiveEntry = { path: string; data: Buffer };

/**
 * The files to export from a workspace: its users' data files (the server's
 * storage files named by a sha256), data/secrets.json (the key they are
 * encrypted with) and conf/cwm.conf when there is one. Left out: CMS job
 * records (data/storage/jobs), the server's socket and lock, ssl/ (made anew)
 * and every file outside the workspace.
 *
 * A plain read is a consistent copy: the server replaces a storage file by
 * writing a temporary file and renaming it (storage.service writeUnsafe),
 * secrets.json is written once when the workspace is made, and the server
 * never writes cwm.conf.
 */
export function collectWorkspaceEntries(workspaceRoot: string): ArchiveEntry[] {
  const storageDir = path.join(workspaceRoot, 'data', 'storage');
  const entries: ArchiveEntry[] = [];
  for (const name of fs.existsSync(storageDir) ? fs.readdirSync(storageDir).sort() : []) {
    const rel = `data/storage/${name}`;
    if (USER_FILE.test(rel) && fs.statSync(path.join(storageDir, name)).isFile()) {
      entries.push({ path: rel, data: fs.readFileSync(path.join(storageDir, name)) });
    }
  }
  const secretsPath = path.join(workspaceRoot, 'data', 'secrets.json');
  if (entries.length === 0 || !fs.existsSync(secretsPath)) {
    throw new WorkspaceError('WORKSPACE_ARCHIVE_NOTHING_TO_EXPORT');
  }
  entries.push({ path: SECRETS, data: fs.readFileSync(secretsPath) });
  const confPath = path.join(workspaceRoot, 'conf', 'cwm.conf');
  if (fs.existsSync(confPath)) {
    entries.push({ path: CONF, data: fs.readFileSync(confPath) });
  }
  return entries;
}

/** Off the main thread (libuv's pool): the window does not stop while it runs. */
async function deriveKeys(password: string, salt: Buffer) {
  const out = await scrypt(password, salt, 64, { N: 2 ** KDF.logN, r: KDF.r, p: KDF.p, maxmem: SCRYPT_MAXMEM });
  return { key: out.subarray(0, 32), check: out.subarray(32) };
}

/** Throws unless `password` may lock an export: given, and MIN_EXPORT_PASSWORD_LENGTH characters or more. */
export function assertExportPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || !password) throw new WorkspaceError('WORKSPACE_ARCHIVE_PASSWORD_REQUIRED');
  if ([...password].length < MIN_EXPORT_PASSWORD_LENGTH) throw new WorkspaceError('WORKSPACE_ARCHIVE_PASSWORD_TOO_SHORT');
}

/** The encrypted export of `entries`, locked with `password`. */
export async function encryptWorkspaceArchive(entries: ArchiveEntry[], password: string): Promise<Buffer> {
  assertExportPassword(password);
  const payload = zlib.gzipSync(Buffer.from(JSON.stringify({
    format: PAYLOAD_FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    files: entries.map((entry) => ({ path: entry.path, data: entry.data.toString('base64') })),
  }), 'utf8'));
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const { key, check } = await deriveKeys(password, salt);
  const header = Buffer.concat([MAGIC, Buffer.from([VERSION, KDF.logN, KDF.r, KDF.p]), salt, iv, check]);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([header, body, cipher.getAuthTag()]);
}

/**
 * The files in an export. Throws WORKSPACE_ARCHIVE_NOT_OURS (not a workspace
 * export), WORKSPACE_ARCHIVE_VERSION (made by a newer app),
 * WORKSPACE_ARCHIVE_WRONG_PASSWORD, or WORKSPACE_ARCHIVE_DAMAGED.
 */
export async function decryptWorkspaceArchive(file: Buffer, password: string): Promise<ArchiveEntry[]> {
  if (file.length < MAGIC.length || !file.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new WorkspaceError('WORKSPACE_ARCHIVE_NOT_OURS');
  }
  if (file.length < HEADER_BYTES + TAG_BYTES) throw new WorkspaceError('WORKSPACE_ARCHIVE_DAMAGED');
  let at = MAGIC.length;
  const version = file[at++];
  if (version !== VERSION) throw new WorkspaceError('WORKSPACE_ARCHIVE_VERSION');
  if (file[at++] !== KDF.logN || file[at++] !== KDF.r || file[at++] !== KDF.p) {
    throw new WorkspaceError('WORKSPACE_ARCHIVE_DAMAGED');
  }
  const salt = file.subarray(at, (at += SALT_BYTES));
  const iv = file.subarray(at, (at += IV_BYTES));
  const storedCheck = file.subarray(at, (at += CHECK_BYTES));
  const header = file.subarray(0, HEADER_BYTES);
  const { key, check } = await deriveKeys(password ?? '', salt);
  if (!crypto.timingSafeEqual(check, storedCheck)) throw new WorkspaceError('WORKSPACE_ARCHIVE_WRONG_PASSWORD');

  let parsed: { format?: unknown; version?: unknown; files?: unknown };
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(header);
    decipher.setAuthTag(file.subarray(file.length - TAG_BYTES));
    const payload = Buffer.concat([decipher.update(file.subarray(HEADER_BYTES, file.length - TAG_BYTES)), decipher.final()]);
    parsed = JSON.parse(zlib.gunzipSync(payload, { maxOutputLength: MAX_PAYLOAD_BYTES }).toString('utf8'));
  } catch {
    throw new WorkspaceError('WORKSPACE_ARCHIVE_DAMAGED');
  }
  if (parsed?.format !== PAYLOAD_FORMAT || parsed.version !== VERSION || !Array.isArray(parsed.files)) {
    throw new WorkspaceError('WORKSPACE_ARCHIVE_DAMAGED');
  }
  const seen = new Set<string>();
  const entries = parsed.files.map((item: { path?: unknown; data?: unknown }) => {
    if (typeof item?.path !== 'string' || typeof item.data !== 'string' || !isExportedPath(item.path) || seen.has(item.path)) {
      throw new WorkspaceError('WORKSPACE_ARCHIVE_DAMAGED');
    }
    seen.add(item.path);
    return { path: item.path, data: Buffer.from(item.data, 'base64') };
  });
  if (!seen.has(SECRETS) || !entries.some((entry) => USER_FILE.test(entry.path))) {
    throw new WorkspaceError('WORKSPACE_ARCHIVE_DAMAGED');
  }
  return entries;
}

/** Reads an export file from disk, refusing one too large to be ours. */
export async function readWorkspaceArchiveFile(filePath: string, password: string): Promise<ArchiveEntry[]> {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch (error) {
    throw new WorkspaceError('WORKSPACE_ARCHIVE_UNREADABLE', (error as Error).message);
  }
  if (!stat.isFile()) throw new WorkspaceError('WORKSPACE_ARCHIVE_NOT_OURS');
  if (stat.size > MAX_ARCHIVE_BYTES) throw new WorkspaceError('WORKSPACE_ARCHIVE_NOT_OURS');
  return decryptWorkspaceArchive(fs.readFileSync(filePath), password);
}

/** Writes the export of the workspace at `workspaceRoot` to `filePath` (whole or not at all). */
export async function writeWorkspaceArchiveFile(workspaceRoot: string, password: string, filePath: string): Promise<void> {
  const archive = await encryptWorkspaceArchive(collectWorkspaceEntries(workspaceRoot), password);
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmp, archive, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, filePath);
  } catch (error) {
    fs.rmSync(tmp, { force: true });
    throw new WorkspaceError('WORKSPACE_ARCHIVE_WRITE_FAILED', (error as Error).message);
  }
}

// Files the OS leaves in a folder (Finder's and Explorer's folder settings,
// macOS's ._ companions); a folder holding only these counts as empty.
const OS_FOLDER_FILES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
const isOsFolderFile = (name: string) => OS_FOLDER_FILES.has(name) || name.startsWith('._');

/** Throws WORKSPACE_IMPORT_FOLDER_NOT_EMPTY unless `root` is missing or empty. */
export function assertImportFolderEmpty(root: string): void {
  if (!fs.existsSync(root)) return;
  if (!fs.statSync(root).isDirectory()) throw new WorkspaceError('WORKSPACE_IMPORT_FOLDER_NOT_EMPTY');
  if (fs.readdirSync(root).some((name) => !isOsFolderFile(name))) {
    throw new WorkspaceError('WORKSPACE_IMPORT_FOLDER_NOT_EMPTY');
  }
}

/** The key the server reads storage with (api-server config/master-key.ts). */
export function storageKeyOf(seed: string, salt: string): Buffer {
  return crypto.pbkdf2Sync(seed, salt, 100_000, 32, 'sha256');
}

/** Whether `data` (a storage file, "iv:ciphertext" in hex) opens with `key` (storage.service, encryption.service). */
export function opensWithStorageKey(data: string, key: Buffer): boolean {
  try {
    const [ivHex, encryptedHex] = data.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
    const plain = Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8');
    JSON.parse(plain);
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes `entries` into the workspace at `root` (checked empty beforehand):
 * data/ and its files owner-only (0700, 0600). Then checks that its
 * secrets.json opens every user file, as the server will; if anything fails,
 * what was written is removed and WORKSPACE_ARCHIVE_UNREADABLE (or the write
 * error) is thrown.
 */
export function unpackWorkspaceArchive(entries: ArchiveEntry[], root: string): void {
  const written: string[] = [];
  const madeDirs: string[] = [];
  // The chosen folder keeps its own mode; data/ and below are owner-only.
  const makeDir = (dir: string, mode?: number) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, mode === undefined ? undefined : { mode });
      madeDirs.push(dir);
    }
    if (mode !== undefined) fs.chmodSync(dir, mode);
  };
  try {
    makeDir(root);
    makeDir(path.join(root, 'data'), 0o700);
    makeDir(path.join(root, 'data', 'storage'), 0o700);
    for (const entry of entries) {
      if (!isExportedPath(entry.path)) throw new WorkspaceError('WORKSPACE_ARCHIVE_DAMAGED');
      if (entry.path === CONF) makeDir(path.join(root, 'conf'), 0o700);
      const target = path.join(root, ...entry.path.split('/'));
      try {
        fs.writeFileSync(target, entry.data, { mode: 0o600, flag: 'wx' });
      } catch (error) {
        // Made but not finished (a full disk): removed with the rest. One
        // that was there already (EEXIST) is not ours to remove.
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') written.push(target);
        throw error;
      }
      written.push(target);
    }

    const secrets = JSON.parse(fs.readFileSync(path.join(root, 'data', 'secrets.json'), 'utf8')) as { seed?: unknown; salt?: unknown };
    if (typeof secrets?.seed !== 'string' || typeof secrets.salt !== 'string') {
      throw new WorkspaceError('WORKSPACE_ARCHIVE_UNREADABLE');
    }
    const key = storageKeyOf(secrets.seed, secrets.salt);
    for (const entry of entries.filter((item) => USER_FILE.test(item.path))) {
      if (!opensWithStorageKey(entry.data.toString('utf8'), key)) throw new WorkspaceError('WORKSPACE_ARCHIVE_UNREADABLE');
    }
  } catch (error) {
    for (const file of written.reverse()) fs.rmSync(file, { force: true });
    for (const dir of madeDirs.reverse()) {
      try {
        fs.rmdirSync(dir);
      } catch {
        // Not empty (something else is there): leave it.
      }
    }
    if (error instanceof WorkspaceError) throw error;
    throw new WorkspaceError('WORKSPACE_ARCHIVE_UNREADABLE', (error as Error).message);
  }
}
