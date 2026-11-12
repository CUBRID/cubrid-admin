import { app, BrowserWindow, dialog, powerMonitor, session, type MessageBoxSyncOptions } from 'electron';
import { isDesktopApiQuitting, startApiForWorkspace, stopDesktopApiOnQuit } from './api/api-runtime';
import { DESKTOP_API_BASE_URL } from './config/constants';
import { getDesktopSettingsPath, needsWorkspaceSetup } from './config/desktop-settings';
import { getDesktopDataRoot } from './config/portable-root';
import { registerDesktopIpcHandlers, setWorkspaceStartupError } from './ipc/handlers';
import { getMenuLanguage, installApplicationMenu } from './menu/application-menu';
import { registerAppProtocol, registerPrivilegedAppScheme } from './protocol/register-app-protocol';
import { getRendererDistDir, getWorkspacePaths, refreshWorkspacePaths } from './workspace/paths';
import { getDefaultWorkspaceRoot } from './workspace/workspace-paths';
import { waitForWorkspaceSetupComplete } from './workspace/workspace-setup';
import { createAppWindow } from './window/app-window';
import { loadRoute } from './window/load-route';
import { onApiStartStatus } from './api/start-status';
import { getMainWindow, setMainWindow } from './window/window-registry';
import { installDownloadDialogDefaults } from './window/dialog-paths';
import { confirmUnloadWithUnsavedChanges } from './window/unsaved-changes';
import { confirmQuit, createQuitFlow, hasPageUnsavedChanges, listenForQuitSignals, setPageUnsavedChanges, whenSessionEnds } from './window/quit-flow';

registerPrivilegedAppScheme();

let bootstrapComplete = false;

// The server stops in will-quit, once every window has really closed: a page
// with unsaved changes can still refuse to unload, and the app must not be
// left running without its server.
function requestQuit(): void {
  app.quit();
}

const ask = (window: BrowserWindow | null, show: (window: BrowserWindow) => boolean) =>
  window && !window.isDestroyed() ? show(window) : true;
const showMessageBoxSync = (window: BrowserWindow, options: MessageBoxSyncOptions) =>
  dialog.showMessageBoxSync(window, options);
const unsavedQuestion = (quitting: boolean) => () =>
  ask(getMainWindow(), (window) =>
    confirmUnloadWithUnsavedChanges(window, { quitting, language: getMenuLanguage(), showMessageBoxSync }));

const quitFlow = createQuitFlow(
  {
    quit: () => ask(getMainWindow(), (window) =>
      confirmQuit(window, { language: getMenuLanguage(), showMessageBoxSync })),
    quitWithUnsavedChanges: unsavedQuestion(true),
    leaveWithUnsavedChanges: unsavedQuestion(false),
  },
  hasPageUnsavedChanges
);

/**
 * Starts the server on the configured workspace. When it cannot (say the
 * folder is no longer writable), the workspace page shows why and asks for
 * another or the default; nothing falls back on its own.
 */
const SHOW_START_PROGRESS_AFTER_MS = 3_000;

async function startApiOrAskForWorkspace(window: BrowserWindow): Promise<void> {
  for (;;) {
    // A start that takes a while shows the workspace page with its progress
    // (the window is otherwise still hidden at launch).
    const showProgress = setTimeout(() => {
      if (!window.isDestroyed() && !window.isVisible()) {
        void loadRoute(window, 'desktop/workspace').then(() => window.show());
      }
    }, SHOW_START_PROGRESS_AFTER_MS);
    try {
      await startApiForWorkspace(getWorkspacePaths());
      clearTimeout(showProgress);
      setWorkspaceStartupError(null);
      return;
    } catch (error) {
      clearTimeout(showProgress);
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
  // Only now (see listenForQuitSignals): before ready, Electron's own handler
  // takes SIGINT/SIGTERM and the window then asks.
  listenForQuitSignals(process, quitFlow, requestQuit);
  installApplicationMenu();
  registerDesktopIpcHandlers();
  installDownloadDialogDefaults(session.defaultSession, () => app.getPath('documents'));

  console.log('[desktop] settings folder:', getDesktopDataRoot());
  console.log('[desktop] settings file:', getDesktopSettingsPath());
  console.log('[desktop] default workspace:', getDefaultWorkspaceRoot());

  const rendererRoot = getRendererDistDir();
  registerAppProtocol(rendererRoot);

  const requiresSetup = needsWorkspaceSetup();
  const mainWindow = createAppWindow(DESKTOP_API_BASE_URL);
  setMainWindow(mainWindow);
  // The workspace page shows the server start's progress.
  onApiStartStatus((status) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:api-start-status', status);
  });
  whenSessionEnds(quitFlow, powerMonitor, mainWindow);

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

  // Every quit closes this window first (File > Quit, Cmd+Q, the header
  // menu's Quit, the close button; the last window closed ends the app), so
  // the quit question is asked here, once. Not before start-up: the window
  // closed on the workspace page just ends the app.
  mainWindow.on('close', (event) => {
    if (bootstrapComplete && !quitFlow.onWindowClose()) {
      event.preventDefault();
    }
  });

  // A conf tab with unsaved changes makes the page refuse to unload
  // (Breadcrumb's beforeunload); without an answer here the quit, close or
  // reload was dropped silently.
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    if (quitFlow.onPreventUnload()) {
      event.preventDefault();
    }
  });

  // A new page reports its own unsaved changes.
  mainWindow.webContents.on('did-navigate', () => {
    setPageUnsavedChanges(false);
  });

  mainWindow.on('closed', () => {
    setMainWindow(null);
    // Closed on the workspace page before the app got going.
    if (!bootstrapComplete) {
      quitFlow.quitWithoutAsking();
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

app.on('will-quit', () => {
  void stopDesktopApiOnQuit();
});

