import { setAppProtocolApiSocket } from '../protocol/register-app-protocol';
import { loadOrCreateDesktopSecrets } from '../config/secrets';
import { acquireWorkspaceLock, releaseWorkspaceLock } from '../workspace/instance-lock';
import { setWorkspacePathsInUse } from '../workspace/paths';
import { WorkspaceError } from '../workspace/workspace-check';
import { ensureWorkspaceDirectories, type WorkspacePaths } from '../workspace/workspace-paths';
import { ApiProcessHandle, startApiServer, stopApiServer } from './api-process';
import { askKeepWaiting, getApiStartStatus, setApiStartStatus } from './start-status';
import { ApiStartStoppedError, waitForApiReady } from './wait-for-api';

let apiProcess: ApiProcessHandle | null = null;
let apiPaths: WorkspacePaths | null = null;
// Spawned but not answering yet: a quit in that time must stop it too.
let startingProcess: ApiProcessHandle | null = null;
// Set on quit: no server starts after it (a switch that fails then would
// otherwise restart the previous workspace's server).
let quitting = false;

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
 * Throws WORKSPACE_IN_USE when another app runs on it,
 * WORKSPACE_API_START_FAILED with the reason (the server's "failed" message
 * or its last stderr lines) when it fails or ends, and
 * WORKSPACE_API_START_STOPPED when the user stops a slow start. A slow start
 * by itself never fails: the page shows the time so far.
 */
export async function startApiForWorkspace(paths: WorkspacePaths): Promise<ApiProcessHandle> {
  if (quitting) {
    throw new WorkspaceError('WORKSPACE_API_START_FAILED', 'The app is quitting.');
  }
  try {
    ensureWorkspaceDirectories(paths);
  } catch (error) {
    throw new WorkspaceError('WORKSPACE_CANNOT_CREATE_FOLDER', error instanceof Error ? error.message : String(error));
  }
  acquireWorkspaceLock(paths.dataDir);
  let handle: ApiProcessHandle | null = null;
  try {
    handle = startApiServer(paths, loadOrCreateDesktopSecrets(paths.dataDir));
    startingProcess = handle;
    setAppProtocolApiSocket(paths.socketPath);
    setApiStartStatus({ state: 'starting', elapsedMs: 0 });
    await waitForApiReady(paths.socketPath, handle.exited, handle.signal, {
      // Keeps the slow notice up while it counts.
      onProgress: (elapsedMs) =>
        setApiStartStatus({ state: getApiStartStatus().state === 'slow' ? 'slow' : 'starting', elapsedMs }),
      onSoftLimit: askKeepWaiting,
    });
    if (startingProcess !== handle) {
      throw new Error('The server was stopped while it started.');
    }
    startingProcess = null;
  } catch (error) {
    setApiStartStatus({ state: 'idle' });
    const stoppedWhileStarting = handle !== null && startingProcess !== handle;
    if (startingProcess === handle) startingProcess = null;
    // Stopped by a quit: the stop already gave the workspace back.
    if (stoppedWhileStarting) {
      throw new WorkspaceError('WORKSPACE_API_START_FAILED', 'The server was stopped while it started.');
    }
    const message = error instanceof Error ? error.message : String(error);
    const tail = handle?.stderrTail();
    if (handle) await stopAndWait(handle);
    setAppProtocolApiSocket(undefined);
    releaseWorkspaceLock();
    if (error instanceof ApiStartStoppedError) {
      throw new WorkspaceError('WORKSPACE_API_START_STOPPED');
    }
    throw new WorkspaceError('WORKSPACE_API_START_FAILED', tail ? `${message}\n${tail}` : message);
  }
  setApiStartStatus({ state: 'idle' });
  apiProcess = handle;
  apiPaths = paths;
  setWorkspacePathsInUse(paths);
  return handle;
}

/**
 * Stops the server, and one still starting, and gives its workspace back at
 * once; the promise resolves once the processes are gone.
 */
export function stopDesktopApi(): Promise<void> {
  const handles = [apiProcess, startingProcess].filter((h): h is ApiProcessHandle => h !== null);
  apiProcess = null;
  apiPaths = null;
  startingProcess = null;
  setAppProtocolApiSocket(undefined);
  releaseWorkspaceLock();
  return Promise.all(handles.map(stopAndWait)).then(() => undefined);
}

/** On quit: stops every server, and none starts after it. */
export function stopDesktopApiOnQuit(): Promise<void> {
  quitting = true;
  return stopDesktopApi();
}

export function isDesktopApiQuitting(): boolean {
  return quitting;
}

async function stopAndWait(handle: ApiProcessHandle): Promise<void> {
  stopApiServer(handle.child, { force: true });
  await Promise.race([handle.exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
}
