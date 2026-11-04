import { app, dialog, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import { getApiProcess, restartApiForCurrentWorkspace } from '../api/api-runtime';
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
import { getMenuLanguage, installApplicationMenu, setApplicationMenuState } from '../menu/application-menu';
import { getWorkspacePaths, refreshWorkspacePaths } from '../workspace/paths';
import {
  assertWorkspaceWritable,
  getDefaultWorkspaceRoot,
} from '../workspace/workspace-paths';
import { notifyWorkspaceSetupComplete } from '../workspace/workspace-setup';
import { getMainWindow } from '../window/window-registry';
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

async function applyWorkspaceChange(): Promise<{ ok: true }> {
  if (getApiProcess()) {
    await restartApiForCurrentWorkspace();
  }

  const window = getMainWindow();
  if (window && !window.isDestroyed()) {
    await window.webContents.executeJavaScript(
      'localStorage.removeItem("token"); sessionStorage.clear();',
      true
    );
  }

  return { ok: true };
}

export function registerDesktopIpcHandlers(): void {
  ipcMain.handle('desktop:is-workspace-setup-required', () => needsWorkspaceSetup());

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
    const L = WORKSPACE_DIALOG_LABELS[getMenuLanguage()];
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: L.title,
      message: L.message,
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('desktop:set-workspace-root', async (_event, workspaceRoot: string) => {
    if (!workspaceRoot?.trim()) {
      // Codes the settings page words in the UI language.
      throw new Error('WORKSPACE_PATH_REQUIRED');
    }

    const resolved = workspaceRoot.trim();
    assertWorkspaceWritable(resolved);
    setWorkspaceRoot(resolved);
    refreshWorkspacePaths();

    return applyWorkspaceChange();
  });

  ipcMain.handle('desktop:reset-workspace-root', async () => {
    clearConfiguredWorkspaceRoot();
    refreshWorkspacePaths();
    return applyWorkspaceChange();
  });

  ipcMain.handle('desktop:finish-workspace-setup', async (_event, workspaceRoot: string) => {
    const trimmed = workspaceRoot?.trim();
    if (trimmed) {
      assertWorkspaceWritable(trimmed);
      setWorkspaceRoot(trimmed);
    } else {
      const paths = getWorkspacePaths();
      assertWorkspaceWritable(paths.workspaceRoot);
    }

    refreshWorkspacePaths();
    markWorkspaceSetupComplete();
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
