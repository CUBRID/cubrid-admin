import { setAppProtocolApiSocket } from '../protocol/register-app-protocol';
import { loadOrCreateDesktopSecrets } from '../config/secrets';
import { acquireWorkspaceLock, releaseWorkspaceLock } from '../workspace/instance-lock';
import { setWorkspacePathsInUse } from '../workspace/paths';
import { WorkspaceError } from '../workspace/workspace-check';
import { ensureWorkspaceDirectories, type WorkspacePaths } from '../workspace/workspace-paths';
import { ApiProcessHandle, startApiServer, stopApiServer } from './api-process';
import { waitForApiReady } from './wait-for-api';

let apiProcess: ApiProcessHandle | null = null;
let apiPaths: WorkspacePaths | null = null;

export function getApiProcess(): ApiProcessHandle | null {
  return apiProcess;
}

/** The workspace the running server uses, or null when none runs. */
export function getRunningWorkspacePaths(): WorkspacePaths | null {
  return apiPaths;
}

/**
 * Starts the server on `paths` after creating what the workspace is missing
 * (folders, its SEED/SALT; the server makes its certificate and data file).
 * Throws WORKSPACE_IN_USE when another app runs on it, and
 * WORKSPACE_API_START_FAILED with the server's last stderr lines when it
 * ends or does not answer in time.
 */
export async function startApiForWorkspace(paths: WorkspacePaths): Promise<ApiProcessHandle> {
  try {
    ensureWorkspaceDirectories(paths);
  } catch (error) {
    throw new WorkspaceError('WORKSPACE_CANNOT_CREATE_FOLDER', error instanceof Error ? error.message : String(error));
  }
  acquireWorkspaceLock(paths.dataDir);
  let handle: ApiProcessHandle | null = null;
  try {
    handle = startApiServer(paths, loadOrCreateDesktopSecrets(paths.dataDir));
    setAppProtocolApiSocket(paths.socketPath);
    await waitForApiReady(paths.socketPath, handle.exited);
  } catch (error) {
    const reason = handle?.stderrTail() || (error instanceof Error ? error.message : String(error));
    if (handle) await stopAndWait(handle);
    setAppProtocolApiSocket(undefined);
    releaseWorkspaceLock();
    throw new WorkspaceError('WORKSPACE_API_START_FAILED', reason);
  }
  apiProcess = handle;
  apiPaths = paths;
  setWorkspacePathsInUse(paths);
  return handle;
}

/**
 * Stops the server and gives its workspace back at once (also on quit);
 * the promise resolves once the process is gone.
 */
export function stopDesktopApi(): Promise<void> {
  const handle = apiProcess;
  apiProcess = null;
  apiPaths = null;
  setAppProtocolApiSocket(undefined);
  releaseWorkspaceLock();
  return handle ? stopAndWait(handle) : Promise.resolve();
}

async function stopAndWait(handle: ApiProcessHandle): Promise<void> {
  stopApiServer(handle.child, { force: true });
  await Promise.race([handle.exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
}
