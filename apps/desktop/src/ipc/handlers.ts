import { app, dialog, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { listActiveJobs } from '../api/active-jobs';
import { getRunningWorkspacePaths, startApiForWorkspace, stopDesktopApi } from '../api/api-runtime';
import {
  getDesktopSettingsPath,
  isCheckForUpdatesOnStartupEnabled,
  loadDesktopSettings,
  markWorkspaceSetupComplete,
  needsWorkspaceSetup,
  setCheckForUpdatesOnStartup,
  setWorkspaceRoot,
} from '../config/desktop-settings';
import { getDesktopDataRoot } from '../config/portable-root';
import { getProductVersion } from '../product-version';
import { getMenuLanguage, installApplicationMenu, setApplicationMenuState } from '../menu/application-menu';
import { getWorkspacePaths, refreshWorkspacePaths } from '../workspace/paths';
import { checkWorkspaceRoot, WorkspaceError } from '../workspace/workspace-check';
import { getDefaultWorkspaceRoot, isSameWorkspaceFolder, resolveWorkspacePaths } from '../workspace/workspace-paths';
import { notifyWorkspaceSetupComplete } from '../workspace/workspace-setup';
import { decideApiStart, getApiStartStatus } from '../api/start-status';
import { dialogDefaultDirectory, rememberDialogPath } from '../window/dialog-paths';
import { toAppRouteUrl } from '../window/app-window';
import { getMainWindow } from '../window/window-registry';
import { setPageUnsavedChanges } from '../window/quit-flow';
import {
  dismissUpdate,
  getStartupUpdateNotice,
  getUpdateStatus,
  openUpdateDownload,
} from '../update/check-for-update';

const WORKSPACE_DIALOG_LABELS = {
  en: {
    title: 'Select workspace folder',
    message: 'Choose one folder. The app will create data/ and ssl/ inside it automatically.',
  },
  ko: {
    title: '워크스페이스 폴더 선택',
    message: '폴더 하나를 고르세요. 앱이 그 안에 data/와 ssl/을 자동으로 만듭니다.',
  },
};

// Why the server could not start on the configured workspace at launch
// (a WorkspaceError message); the workspace page shows it until another
// workspace is set up.
let workspaceStartupError: string | null = null;

export function setWorkspaceStartupError(error: string | null): void {
  workspaceStartupError = error;
}

/**
 * Moves the app to the workspace at `root`. It is
 * checked first (checkWorkspaceRoot) and refused while a CMS job runs; then
 * the server stops and starts there. Only once it runs is the choice saved
 * and the window reloaded on it. If it does not start, the server goes back
 * to the workspace it was on and the reason is thrown, never a silent
 * fallback.
 */
async function changeWorkspace(
  root: string,
  { ignoreUnknownJobs = false }: { ignoreUnknownJobs?: boolean } = {}
): Promise<{ ok: true; unchanged?: true }> {
  const running = getRunningWorkspacePaths();
  // The folder the server already runs on, however it was typed: nothing to do.
  if (running && root && isSameWorkspaceFolder(root, running.workspaceRoot)) {
    return { ok: true, unchanged: true };
  }
  const paths = await checkWorkspaceRoot(root);
  if (running) {
    const jobs = await listActiveJobs(running.socketPath);
    if (jobs === null && !ignoreUnknownJobs) {
      // The server did not say: ask the user before stopping it under a job.
      throw new WorkspaceError('WORKSPACE_JOBS_UNKNOWN');
    }
    if (jobs && jobs.length > 0) {
      throw new WorkspaceError('WORKSPACE_JOBS_RUNNING');
    }
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

  setWorkspaceRoot(paths.workspaceRoot);
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

  ipcMain.handle('desktop:get-api-start-status', () => getApiStartStatus());

  ipcMain.handle('desktop:api-start-decision', (_event, decision: unknown) => {
    if (decision === 'wait' || decision === 'stop') decideApiStart(decision);
    return { ok: true };
  });

  ipcMain.handle('desktop:reveal-settings-file', async () => {
    const settingsPath = getDesktopSettingsPath();
    const dataRoot = getDesktopDataRoot();
    if (fs.existsSync(settingsPath)) {
      shell.showItemInFolder(settingsPath);
    } else if (fs.existsSync(dataRoot)) {
      shell.openPath(dataRoot);
    }
    return { settingsPath, dataRoot };
  });

  ipcMain.handle('desktop:set-menu-language', (_event, language: unknown) => {
    installApplicationMenu(language);
    return { ok: true };
  });

  ipcMain.handle('desktop:set-menu-state', (_event, state: unknown) => {
    setApplicationMenuState(state);
    return { ok: true };
  });

  // Asked on quit: the unsaved-changes question instead of the plain one.
  ipcMain.handle('desktop:set-unsaved-changes', (_event, unsaved: unknown) => {
    if (typeof unsaved !== 'boolean') {
      throw new Error('unsaved must be a boolean');
    }
    setPageUnsavedChanges(unsaved);
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
    const L = WORKSPACE_DIALOG_LABELS[getMenuLanguage()];
    const result = await dialog.showOpenDialog({
      defaultPath: dialogDefaultDirectory(app.getPath('documents')),
      properties: ['openDirectory', 'createDirectory'],
      title: L.title,
      message: L.message,
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    rememberDialogPath(result.filePaths[0], true);
    return result.filePaths[0];
  });

  // A file to read in the window (importing hosts): the window's own file
  // chooser can't be told where to open, so the app's dialog is used, with
  // the same default folder as every other dialog. `accept` is the input's
  // accept list, e.g. ".json,.xml".
  ipcMain.handle('desktop:pick-open-file', async (_event, accept?: string) => {
    const extensions = (accept ?? '')
      .split(',')
      .map((item) => item.trim().replace(/^\./, ''))
      .filter((item) => item && item !== '*' && !item.includes('/'));
    const result = await dialog.showOpenDialog({
      defaultPath: dialogDefaultDirectory(app.getPath('documents')),
      properties: ['openFile'],
      filters: extensions.length > 0 ? [{ name: extensions.join(', '), extensions }] : undefined,
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const filePath = result.filePaths[0];
    rememberDialogPath(filePath, false);
    return { name: path.basename(filePath), base64: (await fs.promises.readFile(filePath)).toString('base64') };
  });

  ipcMain.handle('desktop:set-workspace-root', (_event, workspaceRoot: string, options?: { ignoreUnknownJobs?: unknown }) =>
    changeWorkspace(workspaceRoot?.trim() ?? '', { ignoreUnknownJobs: options?.ignoreUnknownJobs === true })
  );

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

  ipcMain.handle('desktop:get-app-version', () => getProductVersion());

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

  // File > Quit in the window's header menu: the same as the native Quit
  // (app.quit). The window asks first (main.ts, close); the server stops in
  // will-quit.
  ipcMain.handle('desktop:quit', () => {
    app.quit();
  });

  ipcMain.handle('desktop:close-window', async () => {
    const window = getMainWindow();
    if (window && !window.isDestroyed()) {
      window.close();
    }
  });
}
