import { app, BrowserWindow } from 'electron';
import { startApiForWorkspace, stopDesktopApi } from './api/api-runtime';
import { DESKTOP_API_BASE_URL } from './config/constants';
import { getDesktopSettingsPath, needsWorkspaceSetup } from './config/desktop-settings';
import { getPortableAppRoot } from './config/portable-root';
import { registerDesktopIpcHandlers, setWorkspaceStartupError } from './ipc/handlers';
import { installApplicationMenu } from './menu/application-menu';
import { registerAppProtocol, registerPrivilegedAppScheme } from './protocol/register-app-protocol';
import { getRendererDistDir, getWorkspacePaths, refreshWorkspacePaths } from './workspace/paths';
import { getDefaultWorkspaceRoot } from './workspace/workspace-paths';
import { waitForWorkspaceSetupComplete } from './workspace/workspace-setup';
import { createAppWindow, toAppRouteUrl } from './window/app-window';
import { setMainWindow } from './window/window-registry';

registerPrivilegedAppScheme();

let bootstrapComplete = false;
let isQuitting = false;

function quitDesktopApp(): void {
  if (isQuitting) {
    return;
  }
  isQuitting = true;
  void stopDesktopApi();
  app.quit();
}

function requestQuit(): void {
  quitDesktopApp();
}

async function loadRoute(window: BrowserWindow, routePath: string): Promise<void> {
  await window.loadURL(toAppRouteUrl(routePath));
}

/**
 * Starts the server on the configured workspace. When it cannot (say the
 * folder is no longer writable), the workspace page shows why and asks for
 * another or the default; nothing falls back on its own.
 */
async function startApiOrAskForWorkspace(window: BrowserWindow): Promise<void> {
  for (;;) {
    try {
      await startApiForWorkspace(getWorkspacePaths());
      setWorkspaceStartupError(null);
      return;
    } catch (error) {
      console.error('[desktop] could not start on the workspace', error);
      setWorkspaceStartupError(error instanceof Error ? error.message : String(error));
      await loadRoute(window, 'desktop/workspace');
      window.show();
      await waitForWorkspaceSetupComplete();
      refreshWorkspacePaths();
    }
  }
}

async function bootstrap(): Promise<void> {
  installApplicationMenu();
  registerDesktopIpcHandlers();

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
    if (!isQuitting) {
      setMainWindow(null);
    }
  });

  mainWindow.on('closed', () => {
    // Closed on the workspace page before the app got going.
    if (!bootstrapComplete) {
      requestQuit();
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
  }

  await startApiOrAskForWorkspace(mainWindow);

  await loadRoute(mainWindow, '');
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
  void stopDesktopApi();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    requestQuit();
  });
}
