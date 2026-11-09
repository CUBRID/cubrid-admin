import { app, BrowserWindow, dialog, session } from 'electron';
import { isDesktopApiQuitting, startApiForWorkspace, stopDesktopApiOnQuit } from './api/api-runtime';
import { DESKTOP_API_BASE_URL } from './config/constants';
import { getDesktopSettingsPath, needsWorkspaceSetup } from './config/desktop-settings';
import { getPortableAppRoot } from './config/portable-root';
import { registerDesktopIpcHandlers, setWorkspaceStartupError } from './ipc/handlers';
import { getMenuLanguage, installApplicationMenu } from './menu/application-menu';
import { registerAppProtocol, registerPrivilegedAppScheme } from './protocol/register-app-protocol';
import { getRendererDistDir, getWorkspacePaths, refreshWorkspacePaths } from './workspace/paths';
import { getDefaultWorkspaceRoot } from './workspace/workspace-paths';
import { waitForWorkspaceSetupComplete } from './workspace/workspace-setup';
import { createAppWindow, toAppRouteUrl } from './window/app-window';
import { setMainWindow } from './window/window-registry';
import { installDownloadDialogDefaults } from './window/dialog-paths';
import { confirmUnloadWithUnsavedChanges } from './window/unsaved-changes';

registerPrivilegedAppScheme();

let bootstrapComplete = false;
// A quit (File > Quit, Cmd+Q, the last window closed) is under way: an
// unsaved-changes question then reads "quit". Cleared when the user stays.
let quitRequested = false;

// The server stops in will-quit, once every window has really closed: a page
// with unsaved changes can still refuse to unload, and the app must not be
// left running without its server.
function requestQuit(): void {
  app.quit();
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
      // Quit while the server started: the window is closing, nothing to ask.
      if (isDesktopApiQuitting()) return;
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
  installDownloadDialogDefaults(session.defaultSession, () => app.getPath('documents'));

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

  // A conf tab with unsaved changes makes the page refuse to unload
  // (Breadcrumb's beforeunload); without an answer here the quit, close or
  // reload was dropped silently. Ask, and go on only if the user says so.
  // Closing the window ends the app too (window-all-closed quits).
  let windowClosing = false;
  mainWindow.on('close', () => {
    windowClosing = true;
  });

  mainWindow.webContents.on('will-prevent-unload', (event) => {
    const quitting = quitRequested || windowClosing;
    quitRequested = false;
    windowClosing = false;
    const unload = confirmUnloadWithUnsavedChanges(mainWindow, {
      quitting,
      language: getMenuLanguage(),
      showMessageBoxSync: (window, options) => dialog.showMessageBoxSync(window, options),
    });
    if (unload) {
      quitRequested = quitting;
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    setMainWindow(null);
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
  if (isDesktopApiQuitting() || mainWindow.isDestroyed()) return;

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
  quitRequested = true;
});

app.on('will-quit', () => {
  void stopDesktopApiOnQuit();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    requestQuit();
  });
}
