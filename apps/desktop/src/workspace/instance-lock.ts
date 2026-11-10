import * as fs from 'fs';
import * as path from 'path';

const LOCK_FILE = 'instance.lock';

let heldLockPath: string | null = null;

const lockPathOf = (dataDir: string) => path.join(dataDir, LOCK_FILE);

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function lockOwner(lockPath: string): number | null {
  try {
    const pid = Number.parseInt(fs.readFileSync(lockPath, 'utf8'), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** Whether another running app holds the workspace (its data/instance.lock names a live process). */
export function isWorkspaceLockedByOther(dataDir: string): boolean {
  const owner = lockOwner(lockPathOf(dataDir));
  return owner !== null && owner !== process.pid && isRunning(owner);
}

/**
 * Takes the workspace for this app (data/instance.lock with our pid), so a
 * second app cannot run a server on the same workspace. A lock left by a
 * process that is gone is taken over. Throws WORKSPACE_IN_USE otherwise.
 */
export function acquireWorkspaceLock(dataDir: string): void {
  const lockPath = lockPathOf(dataDir);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx', mode: 0o600 });
      heldLockPath = lockPath;
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const owner = lockOwner(lockPath);
      if (owner === process.pid) {
        heldLockPath = lockPath;
        return;
      }
      if (owner !== null && isRunning(owner)) {
        throw new Error('WORKSPACE_IN_USE');
      }
      fs.rmSync(lockPath, { force: true });
    }
  }
  throw new Error('WORKSPACE_IN_USE');
}

/** Gives the workspace back (on a workspace change or quit). */
export function releaseWorkspaceLock(): void {
  if (heldLockPath && lockOwner(heldLockPath) === process.pid) {
    fs.rmSync(heldLockPath, { force: true });
  }
  heldLockPath = null;
}
