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
  getWorkspaceInfo: () => Promise<WorkspaceInfo>;
  pickWorkspaceDirectory: () => Promise<string | null>;
  setWorkspaceRoot: (workspaceRoot: string) => Promise<{ ok: true }>;
  resetWorkspaceRoot: () => Promise<{ ok: true }>;
  finishWorkspaceSetup: (workspaceRoot: string) => Promise<{ ok: boolean }>;
  revealSettingsFile: () => Promise<{ settingsPath: string; portableRoot: string }>;
  setMenuLanguage: (language: 'en' | 'ko') => Promise<{ ok: true }>;
  setMenuState: (state: Record<string, boolean>) => Promise<{ ok: true }>;
  onMenuAction: (callback: (actionId: string) => void) => () => void;
  onCloseActiveTab: (callback: () => void) => () => void;
  closeWindow: () => Promise<void>;
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
