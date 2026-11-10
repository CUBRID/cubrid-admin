import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  assertImportFolderEmpty,
  collectWorkspaceEntries,
  decryptWorkspaceArchive,
  encryptWorkspaceArchive,
  readWorkspaceArchiveFile,
  storageKeyOf,
  unpackWorkspaceArchive,
  writeWorkspaceArchiveFile,
} from './workspace-archive';

const PASSWORD = 'correct horse battery';
const USER_FILE = crypto.createHash('sha256').update('desktop').digest('hex');
const SECRETS = { seed: 'a'.repeat(64), salt: 'b'.repeat(32) };
const USER = { id: 'desktop', host_groups: { g: { name: 'G', hosts: { h1: { address: '10.0.0.1', port: 8001, dbProfiles: { demodb: { id: 'dba', password: 'p' } } } } } } };

// A storage file as the server writes it (encryption.service): "iv:ciphertext" in hex.
const encryptForStorage = (value: unknown, secrets = SECRETS) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', storageKeyOf(secrets.seed, secrets.salt), iv);
  return `${iv.toString('hex')}:${Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]).toString('hex')}`;
};

let tmp: string;
const dir = (...parts: string[]) => path.join(tmp, ...parts);
const write = (rel: string, data: string, mode = 0o600) => {
  fs.mkdirSync(path.dirname(dir(rel)), { recursive: true });
  fs.writeFileSync(dir(rel), data, { mode });
};
const makeWorkspace = (root = 'ws-a', { conf = true } = {}) => {
  write(`${root}/data/storage/${USER_FILE}`, encryptForStorage(USER));
  write(`${root}/data/storage/${USER_FILE}.tmp-123-456`, 'half written');
  write(`${root}/data/storage/jobs/abc/job-1.json`, '{}');
  write(`${root}/data/storage/jobs/operations/_global.json`, '{}');
  write(`${root}/data/secrets.json`, JSON.stringify(SECRETS));
  write(`${root}/data/instance.lock`, String(process.pid));
  write(`${root}/ssl/key.pem`, 'KEY');
  if (conf) write(`${root}/conf/cwm.conf`, 'CMS_MAX_CONCURRENT=4\n');
  return dir(root);
};

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-ws-archive-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('export', () => {
  it('takes the user files, secrets.json and cwm.conf, and leaves out jobs, half-written files, the lock and ssl/', () => {
    const entries = collectWorkspaceEntries(makeWorkspace());
    expect(entries.map((e) => e.path)).toEqual([`data/storage/${USER_FILE}`, 'data/secrets.json', 'conf/cwm.conf']);
    expect(collectWorkspaceEntries(makeWorkspace('ws-b', { conf: false })).map((e) => e.path)).not.toContain('conf/cwm.conf');
  });

  it('refuses a workspace with no data to export', () => {
    fs.mkdirSync(dir('empty', 'data'), { recursive: true });
    expect(() => collectWorkspaceEntries(dir('empty'))).toThrow('WORKSPACE_ARCHIVE_NOTHING_TO_EXPORT');
  });

  it('is not readable without the password, and never holds it', () => {
    const file = dir('a.cubridws');
    writeWorkspaceArchiveFile(makeWorkspace(), PASSWORD, file);
    const bytes = fs.readFileSync(file);
    expect(bytes.subarray(0, 8).toString('ascii')).toBe('CUBRIDWS');
    expect(bytes.includes(Buffer.from(PASSWORD))).toBe(false);
    expect(bytes.includes(Buffer.from(SECRETS.seed))).toBe(false);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(tmp).filter((n) => n.includes('.tmp-'))).toEqual([]);
  });

  it('needs a password', () => {
    expect(() => encryptWorkspaceArchive(collectWorkspaceEntries(makeWorkspace()), '')).toThrow('WORKSPACE_ARCHIVE_PASSWORD_REQUIRED');
  });
});

describe('import', () => {
  const exported = () => {
    const file = dir('a.cubridws');
    writeWorkspaceArchiveFile(makeWorkspace(), PASSWORD, file);
    return file;
  };

  it('opens with the right password and restores the files with owner-only data/', () => {
    const entries = readWorkspaceArchiveFile(exported(), PASSWORD);
    const target = dir('ws-new');
    assertImportFolderEmpty(target);
    unpackWorkspaceArchive(entries, target);

    expect(fs.readFileSync(path.join(target, 'data', 'storage', USER_FILE), 'utf8'))
      .toBe(fs.readFileSync(dir('ws-a', 'data', 'storage', USER_FILE), 'utf8'));
    expect(JSON.parse(fs.readFileSync(path.join(target, 'data', 'secrets.json'), 'utf8'))).toEqual(SECRETS);
    expect(fs.readFileSync(path.join(target, 'conf', 'cwm.conf'), 'utf8')).toBe('CMS_MAX_CONCURRENT=4\n');
    expect(fs.statSync(path.join(target, 'data')).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(target, 'data', 'storage')).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(target, 'data', 'secrets.json')).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.join(target, 'data', 'storage', USER_FILE)).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(path.join(target, 'data', 'storage', 'jobs'))).toBe(false);
    expect(fs.existsSync(path.join(target, 'ssl'))).toBe(false);
    expect(fs.existsSync(path.join(target, 'data', 'instance.lock'))).toBe(false);
  });

  it('says the password is wrong', () => {
    expect(() => readWorkspaceArchiveFile(exported(), 'wrong')).toThrow('WORKSPACE_ARCHIVE_WRONG_PASSWORD');
  });

  it('says a damaged file is damaged, not that the password is wrong', () => {
    const bytes = fs.readFileSync(exported());
    const flipped = Buffer.from(bytes);
    flipped[flipped.length - 40] ^= 0xff;
    expect(() => decryptWorkspaceArchive(flipped, PASSWORD)).toThrow('WORKSPACE_ARCHIVE_DAMAGED');
    expect(() => decryptWorkspaceArchive(bytes.subarray(0, bytes.length - 10), PASSWORD)).toThrow('WORKSPACE_ARCHIVE_DAMAGED');
    const header = Buffer.from(bytes);
    header[9] = 30; // scrypt cost no export uses
    expect(() => decryptWorkspaceArchive(header, PASSWORD)).toThrow('WORKSPACE_ARCHIVE_DAMAGED');
  });

  it('says a file that is not a workspace export is not one', () => {
    write('other.zip', 'PK\u0003\u0004 not ours');
    expect(() => readWorkspaceArchiveFile(dir('other.zip'), PASSWORD)).toThrow('WORKSPACE_ARCHIVE_NOT_OURS');
  });

  it('refuses a folder that is not empty, and takes a new or empty one', () => {
    write('busy/notes.txt', 'x');
    expect(() => assertImportFolderEmpty(dir('busy'))).toThrow('WORKSPACE_IMPORT_FOLDER_NOT_EMPTY');
    write('file-not-folder', 'x');
    expect(() => assertImportFolderEmpty(dir('file-not-folder'))).toThrow('WORKSPACE_IMPORT_FOLDER_NOT_EMPTY');
    write('finder/.DS_Store', 'x');
    expect(() => assertImportFolderEmpty(dir('finder'))).not.toThrow();
    expect(() => assertImportFolderEmpty(dir('does-not-exist'))).not.toThrow();
  });

  it('writes nothing outside the files a workspace export holds', () => {
    const entries = [
      { path: 'data/secrets.json', data: Buffer.from(JSON.stringify(SECRETS)) },
      { path: `data/storage/${USER_FILE}`, data: Buffer.from(encryptForStorage(USER)) },
      { path: '../escape.txt', data: Buffer.from('x') },
    ];
    expect(() => decryptWorkspaceArchive(encryptWorkspaceArchive(entries, PASSWORD), PASSWORD)).toThrow('WORKSPACE_ARCHIVE_DAMAGED');
    expect(() => unpackWorkspaceArchive(entries, dir('ws-escape'))).toThrow('WORKSPACE_ARCHIVE_DAMAGED');
    expect(fs.existsSync(dir('escape.txt'))).toBe(false);
    expect(fs.existsSync(dir('ws-escape'))).toBe(false);
  });

  it('removes what it wrote when secrets.json does not open the user file', () => {
    const entries = [
      { path: 'data/secrets.json', data: Buffer.from(JSON.stringify({ seed: 'c'.repeat(64), salt: 'd'.repeat(32) })) },
      { path: `data/storage/${USER_FILE}`, data: Buffer.from(encryptForStorage(USER)) },
    ];
    expect(() => unpackWorkspaceArchive(entries, dir('ws-bad'))).toThrow('WORKSPACE_ARCHIVE_UNREADABLE');
    expect(fs.existsSync(dir('ws-bad'))).toBe(false);
  });
});

it('reads storage with the same key and cipher as the server (master-key.ts, encryption.service.ts)', () => {
  const server = (rel: string) => fs.readFileSync(path.join(__dirname, '../../../api-server/src', rel), 'utf8');
  expect(server('config/master-key.ts')).toContain("crypto.pbkdf2Sync(seed, salt, 100_000, 32, 'sha256')");
  expect(server('security/encryption/encryption.service.ts')).toContain("algorithm = 'aes-256-cbc'");
  expect(server('security/encryption/encryption.service.ts')).toContain("iv.toString('hex') + ':' + encrypted.toString('hex')");
});
