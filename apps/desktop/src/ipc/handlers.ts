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
import { getPortableAppRoot } from '../config/portable-root';
import { getMenuLanguage, installApplicationMenu, setApplicationMenuState } from '../menu/application-menu';
import { getWorkspacePaths, refreshWorkspacePaths } from '../workspace/paths';
import { checkWorkspaceRoot, WorkspaceError } from '../workspace/workspace-check';
import {
  assertExportPassword,
  readWorkspaceArchiveFile,
  WORKSPACE_ARCHIVE_EXTENSION,
  writeWorkspaceArchiveFile,
} from '../workspace/workspace-archive';
import { forgetOpenedArchive, heldArchive, holdOpenedArchive, importWorkspaceEntries } from '../workspace/workspace-import';
import { getDefaultWorkspaceRoot, isSameWorkspaceFolder, resolveWorkspacePaths } from '../workspace/workspace-paths';
import { notifyWorkspaceSetupComplete } from '../workspace/workspace-setup';
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

const ARCHIVE_DIALOG_LABELS = {
  en: {
    exportTitle: 'Export Workspace',
    importTitle: 'Import Workspace',
    importFolderTitle: 'Choose an empty folder for the imported workspace',
    fileType: 'CUBRID Admin workspace',
  },
  ko: {
    exportTitle: '워크스페이스 내보내기',
    importTitle: '워크스페이스 가져오기',
    importFolderTitle: '가져온 워크스페이스를 둘 빈 폴더 선택',
    fileType: 'CUBRID Admin 워크스페이스',
  },
};

const archiveFilters = () => [{ name: ARCHIVE_DIALOG_LABELS[getMenuLanguage()].fileType, extensions: [WORKSPACE_ARCHIVE_EXTENSION] }];

const requirePassword = (password: unknown): string => {
  if (typeof password !== 'string' || !password) throw new WorkspaceError('WORKSPACE_ARCHIVE_PASSWORD_REQUIRED');
  return password;
};

const requireArchivePath = (filePath: unknown): string => {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new WorkspaceError('WORKSPACE_ARCHIVE_NOT_OURS');
  return path.resolve(filePath.trim());
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

  // The workspace in use, to a file the user names, locked with `password`.
  ipcMain.handle('desktop:export-workspace', async (_event, password: unknown) => {
    assertExportPassword(password);
    const running = getRunningWorkspacePaths();
    if (!running) throw new WorkspaceError('WORKSPACE_NOT_RUNNING');
    const L = ARCHIVE_DIALOG_LABELS[getMenuLanguage()];
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const result = await dialog.showSaveDialog({
      title: L.exportTitle,
      defaultPath: path.join(dialogDefaultDirectory(app.getPath('documents')), `cubrid-admin-workspace-${stamp}.${WORKSPACE_ARCHIVE_EXTENSION}`),
      filters: archiveFilters(),
    });
    if (result.canceled || !result.filePath) return null;
    const ext = `.${WORKSPACE_ARCHIVE_EXTENSION}`;
    const filePath = result.filePath.endsWith(ext) ? result.filePath : `${result.filePath}${ext}`;
    rememberDialogPath(filePath, false);
    await writeWorkspaceArchiveFile(running.workspaceRoot, password, filePath);
    return { filePath };
  });

  ipcMain.handle('desktop:pick-workspace-archive', async () => {
    const result = await dialog.showOpenDialog({
      title: ARCHIVE_DIALOG_LABELS[getMenuLanguage()].importTitle,
      defaultPath: dialogDefaultDirectory(app.getPath('documents')),
      properties: ['openFile'],
      filters: archiveFilters(),
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    rememberDialogPath(result.filePaths[0], false);
    return result.filePaths[0];
  });

  // Opens the export with `password` (the page asks again on a wrong one)
  // and keeps it here for the import: the token names it.
  ipcMain.handle('desktop:open-workspace-archive', async (_event, filePath: unknown, password: unknown) => {
    const entries = await readWorkspaceArchiveFile(requireArchivePath(filePath), requirePassword(password));
    return { token: holdOpenedArchive(entries) };
  });

  ipcMain.handle('desktop:forget-workspace-archive', (_event, token: unknown) => {
    forgetOpenedArchive(token);
    return { ok: true };
  });

  ipcMain.handle('desktop:pick-import-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: ARCHIVE_DIALOG_LABELS[getMenuLanguage()].importFolderTitle,
      defaultPath: dialogDefaultDirectory(app.getPath('documents')),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    rememberDialogPath(result.filePaths[0], true);
    return result.filePaths[0];
  });

  // Into `folder`; on a folder that will not do, the same export may be
  // tried in another (the token stays until it works or is dropped).
  ipcMain.handle('desktop:import-workspace-archive', async (_event, token: unknown, folder: unknown) => {
    const result = await importWorkspaceEntries(heldArchive(token), typeof folder === 'string' ? folder.trim() : '');
    forgetOpenedArchive(token);
    return result;
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
