import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { acquireWorkspaceLock, isWorkspaceLockedByOther, releaseWorkspaceLock } from './instance-lock';

describe('workspace lock', () => {
  let dataDir: string;
  const lockFile = () => path.join(dataDir, 'instance.lock');

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-lock-'));
  });

  afterEach(() => {
    releaseWorkspaceLock();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('takes a free workspace and gives it back', () => {
    acquireWorkspaceLock(dataDir);
    expect(fs.readFileSync(lockFile(), 'utf8')).toBe(String(process.pid));
    expect(isWorkspaceLockedByOther(dataDir)).toBe(false);

    releaseWorkspaceLock();
    expect(fs.existsSync(lockFile())).toBe(false);
  });

  it('refuses a workspace a running process holds', () => {
    fs.writeFileSync(lockFile(), String(process.ppid));
    expect(isWorkspaceLockedByOther(dataDir)).toBe(true);
    expect(() => acquireWorkspaceLock(dataDir)).toThrow('WORKSPACE_IN_USE');
    expect(fs.readFileSync(lockFile(), 'utf8')).toBe(String(process.ppid));
  });

  it('takes over a lock left by a process that is gone', () => {
    fs.writeFileSync(lockFile(), '2147483646');
    acquireWorkspaceLock(dataDir);
    expect(fs.readFileSync(lockFile(), 'utf8')).toBe(String(process.pid));
  });
});
