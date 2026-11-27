import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { assertWorkspaceWritable, ensureWorkspaceDirectories, resolveWorkspacePaths } from './workspace-paths';

jest.mock('electron', () => ({ app: { isPackaged: false } }));

it('names a workspace it cannot write to by a code, with the OS reason', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-workspace-'));
  try {
    const file = path.join(root, 'not-a-folder');
    fs.writeFileSync(file, '');
    expect(() => assertWorkspaceWritable(path.join(file, 'workspace'))).toThrow(/^WORKSPACE_NOT_WRITABLE: ENOTDIR/);
    expect(() => assertWorkspaceWritable(path.join(root, 'workspace'))).not.toThrow();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

(process.platform === 'win32' ? it.skip : it)('makes ssl/ owner-only like data/, also when it was made before', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-workspace-'));
  try {
    fs.mkdirSync(path.join(root, 'ssl'), { mode: 0o755 });
    fs.chmodSync(path.join(root, 'ssl'), 0o755);
    const paths = resolveWorkspacePaths(root);
    ensureWorkspaceDirectories(paths);
    expect(fs.statSync(paths.sslDir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(paths.dataDir).mode & 0o777).toBe(0o700);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
