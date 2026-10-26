import { app, BrowserWindow } from 'electron';
import { startApiForCurrentWorkspace, stopDesktopApi } from './api/api-runtime';
import { DESKTOP_API_BASE_URL } from './config/constants';
import { getDesktopSettingsPath, needsWorkspaceSetup } from './config/desktop-settings';
import { getPortableAppRoot } from './config/portable-root';
import { registerDesktopIpcHandlers } from './ipc/handlers';
import { installApplicationMenu } from './menu/application-menu';
import { registerAppProtocol, registerPrivilegedAppScheme } from './protocol/register-app-protocol';
import { getRendererDistDir, getWorkspacePaths, refreshWorkspacePaths } from './workspace/paths';
import { getDefaultWorkspaceRoot } from './workspace/workspace-paths';
import {
  waitForWorkspaceSetupComplete,
  wasWorkspaceSetupCompleted,
} from './workspace/workspace-setup';
import { createAppWindow, toAppRouteUrl } from './window/app-window';
import { setMainWindow } from './window/window-registry';

registerPrivilegedAppScheme();

let bootstrapComplete = false;
let isQuitting = false;

function clearRendererAuthToken(window: BrowserWindow): void {
  if (window.isDestroyed()) {
    return;
  }

  void window.webContents
    .executeJavaScript('localStorage.removeItem("token")', true)
    .catch(() => undefined);
}

function quitDesktopApp(): void {
  if (isQuitting) {
    return;
  }
  isQuitting = true;
  stopDesktopApi();
  app.quit();
}

function requestQuit(): void {
  quitDesktopApp();
}

async function loadRoute(window: BrowserWindow, routePath: string): Promise<void> {
  await window.loadURL(toAppRouteUrl(routePath));
}

async function bootstrap(): Promise<void> {
  registerDesktopIpcHandlers();
  installApplicationMenu();

  console.log('[desktop] install dir (beside .app / exe):', getPortableAppRoot());
  console.log('[desktop] settings file:', getDesktopSettingsPath());
  console.log('[desktop] default workspace:', getDefaultWorkspaceRoot());

  const rendererRoot = getRendererDistDir();
  registerAppProtocol(rendererRoot);

  const requiresSetup = needsWorkspaceSetup();
  const mainWindow = createAppWindow(DESKTOP_API_BASE_URL);
  setMainWindow(mainWindow);

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' &&
      (input.control || input.meta) &&
      input.key.toLowerCase() === 'w'
    ) {
      event.preventDefault();
      mainWindow.webContents.send('desktop:close-active-tab');
    }
  });

  mainWindow.on('close', () => {
    clearRendererAuthToken(mainWindow);
    if (!isQuitting) {
      setMainWindow(null);
    }
  });

  mainWindow.on('closed', () => {
    if (!bootstrapComplete) {
      if (requiresSetup && !wasWorkspaceSetupCompleted()) {
        requestQuit();
      }
      return;
    }

    if (BrowserWindow.getAllWindows().length === 0) {
      requestQuit();
    }
  });

  if (requiresSetup) {
    await loadRoute(mainWindow, 'desktop/workspace');
    mainWindow.show();
    await waitForWorkspaceSetupComplete();
    refreshWorkspacePaths();
  } else {
    getWorkspacePaths();
  }

  await startApiForCurrentWorkspace();

  await loadRoute(mainWindow, 'login');
  mainWindow.show();
  bootstrapComplete = true;
}

app.whenReady().then(bootstrap).catch((error) => {
  console.error('[desktop] failed to start', error);
  app.exit(1);
});

app.on('window-all-closed', () => {
  requestQuit();
});

app.on('before-quit', () => {
  isQuitting = true;
  stopDesktopApi();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    requestQuit();
  });
}
