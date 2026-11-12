import type { ApiStartStatus } from '../api/start-status';
import type { UpdateStatus } from '@update-check';

export type DesktopConfig = {
  apiBaseUrl: string;
  clearAuthOnExit: boolean;
  isDesktop: boolean;
};

export type WorkspaceInfo = {
  workspaceRoot: string;
  defaultWorkspaceRoot: string;
  isCustomWorkspace: boolean;
  settingsFilePath: string;
};

export type DesktopBridge = {
  isWorkspaceSetupRequired: () => Promise<boolean>;
  /** Why the server could not start on the configured workspace at launch (a WORKSPACE_* code), or null. */
  getWorkspaceStartupError: () => Promise<string | null>;
  /** The server start in progress (api/start-status.ts), and its changes. */
  getApiStartStatus: () => Promise<ApiStartStatus>;
  onApiStartStatus: (callback: (status: ApiStartStatus) => void) => () => void;
  /** The answer to the slow-start notice. */
  decideApiStart: (decision: 'wait' | 'stop') => Promise<{ ok: true }>;
  getWorkspaceInfo: () => Promise<WorkspaceInfo>;
  pickWorkspaceDirectory: () => Promise<string | null>;
  /** A file chosen in the app's open dialog (with its default folder), as base64; null if cancelled. */
  pickOpenFile: (accept?: string) => Promise<{ name: string; base64: string } | null>;
  /**
   * Moves the app to another workspace. `unchanged` when it is the folder in
   * use. Throws WORKSPACE_JOBS_UNKNOWN when the running jobs could not be
   * read; `ignoreUnknownJobs` goes on anyway (the user said so).
   */
  setWorkspaceRoot: (workspaceRoot: string, options?: { ignoreUnknownJobs?: boolean }) => Promise<{ ok: true; unchanged?: true }>;
  finishWorkspaceSetup: (workspaceRoot: string) => Promise<{ ok: boolean }>;
  revealSettingsFile: () => Promise<{ settingsPath: string; dataRoot: string }>;
  setMenuLanguage: (language: 'en' | 'ko') => Promise<{ ok: true }>;
  setMenuState: (state: Record<string, boolean>) => Promise<{ ok: true }>;
  /** A conf tab has unsaved changes: quitting asks about them. */
  setUnsavedChanges: (unsaved: boolean) => Promise<{ ok: true }>;
  onMenuAction: (callback: (actionId: string) => void) => () => void;
  /** View > Reload (CmdOrCtrl+R on macOS): re-read the active tab and the host list. */
  onRefreshView: (callback: () => void) => () => void;
  onCloseActiveTab: (callback: () => void) => () => void;
  closeWindow: () => Promise<void>;
  /** Quits the app, as File > Quit in the native menu does. */
  quitApp: () => Promise<void>;
  getAppVersion: () => Promise<string>;
  getUpdateStatus: () => Promise<UpdateStatus>;
  getStartupUpdateNotice: () => Promise<UpdateStatus | null>;
  dismissUpdate: (version: string) => Promise<{ ok: true }>;
  openUpdateDownload: (url: string) => Promise<boolean>;
  getCheckForUpdatesOnStartup: () => Promise<boolean>;
  setCheckForUpdatesOnStartup: (enabled: boolean) => Promise<{ ok: true }>;
};

declare global {
  interface Window {
    desktopConfig?: DesktopConfig;
    desktopBridge?: DesktopBridge;
  }
}

export {};
