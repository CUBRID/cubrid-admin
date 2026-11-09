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
  getWorkspaceInfo: () => Promise<WorkspaceInfo>;
  pickWorkspaceDirectory: () => Promise<string | null>;
  /** A file chosen in the app's open dialog (with its default folder), as base64; null if cancelled. */
  pickOpenFile: (accept?: string) => Promise<{ name: string; base64: string } | null>;
  setWorkspaceRoot: (workspaceRoot: string) => Promise<{ ok: true }>;
  finishWorkspaceSetup: (workspaceRoot: string) => Promise<{ ok: boolean }>;
  revealSettingsFile: () => Promise<{ settingsPath: string; portableRoot: string }>;
  setMenuLanguage: (language: 'en' | 'ko') => Promise<{ ok: true }>;
  setMenuState: (state: Record<string, boolean>) => Promise<{ ok: true }>;
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
