import { dialog, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import { getApiProcess, restartApiForCurrentWorkspace } from '../api/api-runtime';
import {
  clearConfiguredWorkspaceRoot,
  getDesktopSettingsPath,
  loadDesktopSettings,
  markWorkspaceSetupComplete,
  needsWorkspaceSetup,
  setWorkspaceRoot,
} from '../config/desktop-settings';
import { getPortableAppRoot } from '../config/portable-root';
import { installApplicationMenu, setApplicationMenuState } from '../menu/application-menu';
import { getWorkspacePaths, refreshWorkspacePaths } from '../workspace/paths';
import {
  assertWorkspaceWritable,
  getDefaultWorkspaceRoot,
} from '../workspace/workspace-paths';
import { notifyWorkspaceSetupComplete } from '../workspace/workspace-setup';
import { getMainWindow } from '../window/window-registry';

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

  ipcMain.handle('desktop:set-workspace-root', async (_event, workspaceRoot: string) => {
    if (!workspaceRoot?.trim()) {
      throw new Error('Workspace path is required');
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

  ipcMain.handle('desktop:close-window', async () => {
    const window = getMainWindow();
    if (window && !window.isDestroyed()) {
      window.close();
    }
  });
}
