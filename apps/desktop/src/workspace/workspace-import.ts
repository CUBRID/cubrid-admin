import * as fs from 'fs';
import * as path from 'path';
import { assertImportFolderEmpty, readWorkspaceArchiveFile, unpackWorkspaceArchive } from './workspace-archive';
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
 * Writes the export of `filePath` into the empty or new folder `root`, made a
 * workspace there (checkWorkspaceRoot) and checked to open (unpack). The
 * workspace in use is not touched; the switch is the page's, through
 * desktop:set-workspace-root, with its checks.
 */
export async function importWorkspaceArchive(filePath: string, password: string, root: string): Promise<{ workspaceRoot: string }> {
  if (!root) throw new WorkspaceError('WORKSPACE_PATH_REQUIRED');
  const resolved = path.resolve(root);
  assertImportFolderEmpty(resolved);
  const entries = readWorkspaceArchiveFile(filePath, password);
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

