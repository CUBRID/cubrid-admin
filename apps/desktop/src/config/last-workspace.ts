import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { getDesktopDataRoot, isPackagedRuntime, isPathInsideAppBundle, isPathInsideInstallFolder } from './portable-root';
import { isServerFolder } from './server-folder';

const LAST_WORKSPACE_FILE = 'last-workspace.json';

export type PreviousWorkspace = {
  workspaceRoot: string;
  /** The folder that held desktop-settings.json when it was last used. */
  settingsFolder: string;
};

/**
 * Paths only (no keys): kept in the user's app data folder, which is the same
 * for every copy of the app (app.getPath('userData'), %APPDATA%\CUBRID Admin on
 * Windows), so a portable copy started from another folder can offer it. Not
 * with CWM_PORTABLE_APP_ROOT (tests, which give each run its own data) or in dev mode.
 */
function lastWorkspaceFile(): string | null {
  if (process.env.CWM_PORTABLE_APP_ROOT?.trim() || !isPackagedRuntime()) {
    return null;
  }
  return path.join(app.getPath('userData'), LAST_WORKSPACE_FILE);
}

/** A folder a workspace has run in: it holds data/secrets.json. */
export function isWorkspaceFolder(root: string): boolean {
  try {
    return fs.statSync(path.join(root, 'data', 'secrets.json')).isFile();
  } catch {
    return false;
  }
}

/** Notes the workspace the server has just started on; never fails the start (a failure only logs). */
export function rememberLastWorkspace(workspaceRoot: string, settingsFolder?: string, filePath?: string | null): void {
  try {
    const file = filePath === undefined ? lastWorkspaceFile() : filePath;
    if (!file) {
      return;
    }
    const record: PreviousWorkspace & { savedAt: string } = {
      workspaceRoot: path.resolve(workspaceRoot),
      settingsFolder: path.resolve(settingsFolder ?? getDesktopDataRoot()),
      savedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(record, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    console.warn('[desktop] could not note the last workspace:', (error as Error).message);
  }
}

/**
 * The workspace noted last, when it still is one (data/secrets.json) and may
 * be used (not a server folder, the app bundle or the Windows install folder);
 * otherwise null.
 */
export function findPreviousWorkspace(filePath?: string | null): PreviousWorkspace | null {
  let file: string | null;
  try {
    file = filePath === undefined ? lastWorkspaceFile() : filePath;
  } catch (error) {
    console.warn('[desktop] last workspace note not used:', (error as Error).message);
    return null;
  }
  if (!file || !fs.existsSync(file)) {
    return null;
  }
  let record: Partial<PreviousWorkspace>;
  try {
    record = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.warn('[desktop] last workspace note not used:', (error as Error).message);
    return null;
  }
  if (typeof record.workspaceRoot !== 'string' || !record.workspaceRoot.trim()) {
    return null;
  }
  const workspaceRoot = path.resolve(record.workspaceRoot);
  if (
    !isWorkspaceFolder(workspaceRoot) ||
    isServerFolder(workspaceRoot) ||
    isPathInsideAppBundle(workspaceRoot) ||
    isPathInsideInstallFolder(workspaceRoot)
  ) {
    return null;
  }
  return {
    workspaceRoot,
    settingsFolder: typeof record.settingsFolder === 'string' ? record.settingsFolder : '',
  };
}
