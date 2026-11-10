import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { assertWorkspaceWritable } from './workspace-paths';

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
