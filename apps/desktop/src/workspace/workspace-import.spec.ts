import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readWorkspaceArchiveFile, storageKeyOf, writeWorkspaceArchiveFile } from './workspace-archive';
import { forgetOpenedArchive, heldArchive, holdOpenedArchive, importWorkspaceEntries } from './workspace-import';

const importWorkspaceArchive = async (file: string, password: string, root: string) =>
  importWorkspaceEntries(await readWorkspaceArchiveFile(file, password), root);

jest.mock('electron', () => ({ app: { isPackaged: false } }));

const PASSWORD = 'pw-for-tests';
const USER_FILE = crypto.createHash('sha256').update('desktop').digest('hex');
const SECRETS = { seed: 'a'.repeat(64), salt: 'b'.repeat(32) };

const storageFile = (value: unknown) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', storageKeyOf(SECRETS.seed, SECRETS.salt), iv);
  return `${iv.toString('hex')}:${Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]).toString('hex')}`;
};

describe('importWorkspaceArchive', () => {
  let base: string;
  let archive: string;

  beforeEach(async () => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-imp-'));
    process.env.CWM_PORTABLE_APP_ROOT = base;
    const source = path.join(base, 'a');
    fs.mkdirSync(path.join(source, 'data', 'storage'), { recursive: true });
    fs.writeFileSync(path.join(source, 'data', 'storage', USER_FILE), storageFile({ id: 'desktop' }));
    fs.writeFileSync(path.join(source, 'data', 'secrets.json'), JSON.stringify(SECRETS));
    archive = path.join(base, 'a.cubridws');
    await writeWorkspaceArchiveFile(source, PASSWORD, archive);
  });

  afterEach(() => {
    delete process.env.CWM_PORTABLE_APP_ROOT;
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('makes a new folder a workspace that opens, with data/ owner-only and ssl/ ready', async () => {
    const target = path.join(base, 'b');
    await expect(importWorkspaceArchive(archive, PASSWORD, target)).resolves.toEqual({ workspaceRoot: target });
    expect(fs.existsSync(path.join(target, 'data', 'storage', USER_FILE))).toBe(true);
    expect(fs.statSync(path.join(target, 'data')).mode & 0o777).toBe(0o700);
    expect(fs.existsSync(path.join(target, 'ssl'))).toBe(true);
  });

  it('touches nothing when the folder is not empty or the password is wrong', async () => {
    const busy = path.join(base, 'busy');
    fs.mkdirSync(busy);
    fs.writeFileSync(path.join(busy, 'keep.txt'), 'x');
    await expect(importWorkspaceArchive(archive, PASSWORD, busy)).rejects.toThrow('WORKSPACE_IMPORT_FOLDER_NOT_EMPTY');
    expect(fs.readdirSync(busy)).toEqual(['keep.txt']);

    const fresh = path.join(base, 'fresh');
    await expect(importWorkspaceArchive(archive, 'wrong', fresh)).rejects.toThrow('WORKSPACE_ARCHIVE_WRONG_PASSWORD');
    expect(fs.existsSync(fresh)).toBe(false);
  });

  it('leaves an empty folder it was given empty again when the workspace does not open', async () => {
    // An export whose secrets.json is not the one its user file was written with.
    const source = path.join(base, 'mismatch');
    fs.mkdirSync(path.join(source, 'data', 'storage'), { recursive: true });
    fs.writeFileSync(path.join(source, 'data', 'storage', USER_FILE), storageFile({ id: 'desktop' }));
    fs.writeFileSync(path.join(source, 'data', 'secrets.json'), JSON.stringify({ seed: 'c'.repeat(64), salt: 'd'.repeat(32) }));
    const bad = path.join(base, 'bad.cubridws');
    await writeWorkspaceArchiveFile(source, PASSWORD, bad);

    const target = path.join(base, 'empty');
    fs.mkdirSync(target);
    await expect(importWorkspaceArchive(bad, PASSWORD, target)).rejects.toThrow('WORKSPACE_ARCHIVE_UNREADABLE');
    expect(fs.readdirSync(target)).toEqual([]);
  });
});

describe('the opened export between the password and the folder', () => {
  it('is named by its token, one at a time, and gone once forgotten', () => {
    const entries = [{ path: 'data/secrets.json', data: Buffer.from('{}') }];
    const first = holdOpenedArchive(entries);
    expect(heldArchive(first)).toBe(entries);
    const second = holdOpenedArchive(entries);
    expect(() => heldArchive(first)).toThrow('WORKSPACE_ARCHIVE_NOT_OPEN');
    forgetOpenedArchive('someone else');
    expect(heldArchive(second)).toBe(entries);
    forgetOpenedArchive(second);
    expect(() => heldArchive(second)).toThrow('WORKSPACE_ARCHIVE_NOT_OPEN');
  });
});
