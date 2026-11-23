import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { assertImportFolderEmpty, type ArchiveEntry, unpackWorkspaceArchive } from './workspace-archive';
import { checkWorkspaceRoot, WorkspaceError } from './workspace-check';

/** Empty folders the import made (data/, ssl/, the folder itself if it was new), after it failed. */
function removeEmptyImportFolders(root: string, rootExisted: boolean): void {
  const dirs = [path.join(root, 'data', 'storage'), path.join(root, 'data'), path.join(root, 'ssl'), path.join(root, 'conf')];
  if (!rootExisted) dirs.push(root);
  for (const dir of dirs) {
    try {
      fs.rmdirSync(dir);
    } catch {
      // Missing or not empty: leave it.
    }
  }
}

/**
 * Writes an opened export (`entries`, readWorkspaceArchiveFile) into the
 * empty or new folder `root`, made a workspace there (checkWorkspaceRoot) and
 * checked to open (unpack). The workspace in use is not touched; the switch
 * is the page's, through desktop:set-workspace-root, with its checks.
 */
export async function importWorkspaceEntries(entries: ArchiveEntry[], root: string): Promise<{ workspaceRoot: string }> {
  if (!root) throw new WorkspaceError('WORKSPACE_PATH_REQUIRED');
  const resolved = path.resolve(root);
  assertImportFolderEmpty(resolved);
  const rootExisted = fs.existsSync(resolved);
  let paths;
  try {
    paths = await checkWorkspaceRoot(resolved);
    unpackWorkspaceArchive(entries, paths.workspaceRoot);
  } catch (error) {
    removeEmptyImportFolders(resolved, rootExisted);
    throw error;
  }
  return { workspaceRoot: paths.workspaceRoot };
}


/**
 * The export opened for an import, held in this process between the password
 * check and the folder (which may be chosen again): the password is asked and
 * scrypt run once. Only one at a time; forgotten once imported or dropped.
 */
let pending: { token: string; entries: ArchiveEntry[] } | null = null;

export function holdOpenedArchive(entries: ArchiveEntry[]): string {
  pending = { token: crypto.randomUUID(), entries };
  return pending.token;
}

export function heldArchive(token: unknown): ArchiveEntry[] {
  if (!pending || typeof token !== 'string' || token !== pending.token) throw new WorkspaceError('WORKSPACE_ARCHIVE_NOT_OPEN');
  return pending.entries;
}

export function forgetOpenedArchive(token?: unknown): void {
  if (!pending || token === undefined || token === pending.token) pending = null;
}

type NavigationDetails = { isMainFrame?: boolean; isSameDocument?: boolean };

/**
 * Forgets the opened export when the page that held it is gone: a new
 * document in the main frame (a reload, the reload after a switch) or a
 * renderer that died. The page forgets it itself when it unmounts.
 */
export function forgetOpenedArchiveWhenPageGoes(webContents: { on(event: string, listener: (...args: never[]) => void): unknown }): void {
  webContents.on('did-start-navigation', ((details: NavigationDetails) => {
    if (details?.isMainFrame && !details.isSameDocument) forgetOpenedArchive();
  }) as (...args: never[]) => void);
  webContents.on('render-process-gone', () => forgetOpenedArchive());
}
