import { app, dialog, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import { listActiveJobs } from '../api/active-jobs';
import { getRunningWorkspacePaths, startApiForWorkspace, stopDesktopApi } from '../api/api-runtime';
import {
  clearConfiguredWorkspaceRoot,
  getDesktopSettingsPath,
  isCheckForUpdatesOnStartupEnabled,
  loadDesktopSettings,
  markWorkspaceSetupComplete,
  needsWorkspaceSetup,
  setCheckForUpdatesOnStartup,
  setWorkspaceRoot,
} from '../config/desktop-settings';
import { getPortableAppRoot } from '../config/portable-root';
import { installApplicationMenu, setApplicationMenuState } from '../menu/application-menu';
import { getWorkspacePaths, refreshWorkspacePaths } from '../workspace/paths';
import { checkWorkspaceRoot, WorkspaceError } from '../workspace/workspace-check';
import { getDefaultWorkspaceRoot, resolveWorkspacePaths } from '../workspace/workspace-paths';
import { notifyWorkspaceSetupComplete } from '../workspace/workspace-setup';
import { toAppRouteUrl } from '../window/app-window';
import { getMainWindow } from '../window/window-registry';
import {
  dismissUpdate,
  getStartupUpdateNotice,
  getUpdateStatus,
  openUpdateDownload,
} from '../update/check-for-update';

// Why the server could not start on the configured workspace at launch
// (a WorkspaceError message); the workspace page shows it until another
// workspace is set up.
let workspaceStartupError: string | null = null;

export function setWorkspaceStartupError(error: string | null): void {
  workspaceStartupError = error;
}

/**
 * Moves the app to the workspace at `root` (null: the default one). It is
 * checked first (checkWorkspaceRoot) and refused while a CMS job runs; then
 * the server stops and starts there. Only once it runs is the choice saved
 * and the window reloaded on it. If it does not start, the server goes back
 * to the workspace it was on and the reason is thrown, never a silent
 * fallback.
 */
async function changeWorkspace(root: string | null): Promise<{ ok: true }> {
  const paths = await checkWorkspaceRoot(root ?? getDefaultWorkspaceRoot());
  const running = getRunningWorkspacePaths();
  if (running && (await listActiveJobs(running.socketPath)).length > 0) {
    throw new WorkspaceError('WORKSPACE_JOBS_RUNNING');
  }

  await stopDesktopApi();
  try {
    await startApiForWorkspace(paths);
  } catch (error) {
    if (running) {
      await startApiForWorkspace(resolveWorkspacePaths(running.workspaceRoot)).catch((restartError) => {
        console.error('[desktop] could not restart the server on the previous workspace', restartError);
      });
    }
    throw error;
  }

  if (root === null) {
    clearConfiguredWorkspaceRoot();
  } else {
    setWorkspaceRoot(paths.workspaceRoot);
  }
  const window = getMainWindow();
  if (window && !window.isDestroyed()) {
    // After this reply reaches the page: everything on it belonged to the old workspace.
    setTimeout(() => void window.loadURL(toAppRouteUrl('')), 0);
  }
  return { ok: true };
}

export function registerDesktopIpcHandlers(): void {
  ipcMain.handle(
    'desktop:is-workspace-setup-required',
    () => needsWorkspaceSetup() || workspaceStartupError !== null
  );

  ipcMain.handle('desktop:get-workspace-startup-error', () => workspaceStartupError);

  ipcMain.handle('desktop:reveal-settings-file', async () => {
    const settingsPath = getDesktopSettingsPath();
    const portableRoot = getPortableAppRoot();
    if (fs.existsSync(settingsPath)) {
      shell.showItemInFolder(settingsPath);
    } else if (fs.existsSync(portableRoot)) {
      shell.openPath(portableRoot);
    }
    return { settingsPath, portableRoot };
  });

  ipcMain.handle('desktop:set-menu-language', (_event, language: unknown) => {
    installApplicationMenu(language);
    return { ok: true };
  });

  ipcMain.handle('desktop:set-menu-state', (_event, state: unknown) => {
    setApplicationMenuState(state);
    return { ok: true };
  });

  ipcMain.handle('desktop:get-workspace-info', () => {
    const paths = getWorkspacePaths();
    const defaultRoot = getDefaultWorkspaceRoot();
    const configured = Boolean(loadDesktopSettings().workspaceRoot?.trim());

    return {
      workspaceRoot: paths.workspaceRoot,
      defaultWorkspaceRoot: defaultRoot,
      isCustomWorkspace: configured,
      settingsFilePath: getDesktopSettingsPath(),
    };
  });

  ipcMain.handle('desktop:pick-workspace-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select workspace folder',
      message:
        'Choose one folder. The app will create data/ and ssl/ inside it automatically.',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('desktop:set-workspace-root', (_event, workspaceRoot: string) =>
    changeWorkspace(workspaceRoot?.trim() ?? '')
  );

  ipcMain.handle('desktop:reset-workspace-root', () => changeWorkspace(null));

  // First run, or the configured workspace failed at launch: no server runs
  // yet, so this only checks and saves; main.ts then starts the server.
  ipcMain.handle('desktop:finish-workspace-setup', async (_event, workspaceRoot: string) => {
    const trimmed = workspaceRoot?.trim();
    const paths = await checkWorkspaceRoot(trimmed || getWorkspacePaths().workspaceRoot);
    if (trimmed) {
      setWorkspaceRoot(paths.workspaceRoot);
    }

    refreshWorkspacePaths();
    markWorkspaceSetupComplete();
    workspaceStartupError = null;
    notifyWorkspaceSetupComplete();
    return { ok: true };
  });

  ipcMain.handle('desktop:get-app-version', () => app.getVersion());

  ipcMain.handle('desktop:get-update-status', () => getUpdateStatus());

  ipcMain.handle('desktop:get-startup-update-notice', () => getStartupUpdateNotice());

  ipcMain.handle('desktop:dismiss-update', (_event, version: unknown) => {
    dismissUpdate(version);
    return { ok: true };
  });

  ipcMain.handle('desktop:open-update-download', (_event, url: unknown) => openUpdateDownload(url));

  ipcMain.handle('desktop:get-check-updates-on-startup', () => isCheckForUpdatesOnStartupEnabled());

  ipcMain.handle('desktop:set-check-updates-on-startup', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('enabled must be a boolean');
    }
    setCheckForUpdatesOnStartup(enabled);
    return { ok: true };
  });

  ipcMain.handle('desktop:close-window', async () => {
    const window = getMainWindow();
    if (window && !window.isDestroyed()) {
      window.close();
    }
  });
}
