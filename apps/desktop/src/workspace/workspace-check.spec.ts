import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkWorkspaceRoot } from './workspace-check';

jest.mock('electron', () => ({ app: { isPackaged: false } }));

const unixOnly = process.platform === 'win32' ? it.skip : it;

describe('checkWorkspaceRoot', () => {
  let base: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-ws-'));
    process.env.CWM_PORTABLE_APP_ROOT = base;
  });

  afterEach(() => {
    delete process.env.CWM_PORTABLE_APP_ROOT;
    fs.chmodSync(base, 0o700);
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('takes a writable folder anywhere and prepares its data/ (owner-only) and ssl/', async () => {
    const root = path.join(base, 'elsewhere', 'ws');
    const paths = await checkWorkspaceRoot(root);

    expect(paths.workspaceRoot).toBe(root);
    expect(fs.statSync(paths.sslDir).isDirectory()).toBe(true);
    if (process.platform !== 'win32') {
      expect(fs.statSync(paths.dataDir).mode & 0o777).toBe(0o700);
    }
  });

  it('needs a path', async () => {
    await expect(checkWorkspaceRoot('  ')).rejects.toThrow('WORKSPACE_PATH_REQUIRED');
  });

  unixOnly('names a folder it cannot write to, with the OS reason', async () => {
    const root = path.join(base, 'locked');
    fs.mkdirSync(root);
    fs.chmodSync(root, 0o500);
    await expect(checkWorkspaceRoot(root)).rejects.toThrow(/^WORKSPACE_NOT_WRITABLE: /);
    fs.chmodSync(root, 0o700);
  });

  it('names a folder it cannot create inside the workspace', async () => {
    const root = path.join(base, 'ws');
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'data'), 'not a folder');
    await expect(checkWorkspaceRoot(root)).rejects.toThrow(/^WORKSPACE_CANNOT_CREATE_FOLDER: /);
  });

  unixOnly('refuses a path whose socket would be longer than the OS takes', async () => {
    const root = path.join(base, 'x'.repeat(120));
    await expect(checkWorkspaceRoot(root)).rejects.toThrow(/^WORKSPACE_PATH_TOO_LONG: /);
  });

  it('refuses a workspace another running app holds', async () => {
    const root = path.join(base, 'ws');
    fs.mkdirSync(path.join(root, 'data'), { recursive: true });
    fs.writeFileSync(path.join(root, 'data', 'instance.lock'), String(process.ppid));
    await expect(checkWorkspaceRoot(root)).rejects.toThrow('WORKSPACE_IN_USE');
  });
});
