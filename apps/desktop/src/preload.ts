import { contextBridge, ipcRenderer } from 'electron';
import { DESKTOP_API_BASE_URL } from './config/constants';
import type { DesktopBridge, DesktopConfig } from './ipc/bridge-types';

function resolveApiBaseUrl(): string {
  const prefix = '--cwm-api-base-url=';
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : DESKTOP_API_BASE_URL;
}

const desktopBridge: DesktopBridge = {
  isWorkspaceSetupRequired: () => ipcRenderer.invoke('desktop:is-workspace-setup-required'),
  getWorkspaceInfo: () => ipcRenderer.invoke('desktop:get-workspace-info'),
  pickWorkspaceDirectory: () => ipcRenderer.invoke('desktop:pick-workspace-directory'),
  setWorkspaceRoot: (workspaceRoot) => ipcRenderer.invoke('desktop:set-workspace-root', workspaceRoot),
  resetWorkspaceRoot: () => ipcRenderer.invoke('desktop:reset-workspace-root'),
  finishWorkspaceSetup: (workspaceRoot) =>
    ipcRenderer.invoke('desktop:finish-workspace-setup', workspaceRoot),
  revealSettingsFile: () => ipcRenderer.invoke('desktop:reveal-settings-file'),
  onCloseActiveTab: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('desktop:close-active-tab', subscription);
    return () => {
      ipcRenderer.removeListener('desktop:close-active-tab', subscription);
    };
  },
  closeWindow: () => ipcRenderer.invoke('desktop:close-window'),
  getAppVersion: () => ipcRenderer.invoke('desktop:get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-for-updates'),
  getCheckForUpdatesOnStartup: () => ipcRenderer.invoke('desktop:get-check-updates-on-startup'),
  setCheckForUpdatesOnStartup: (enabled) =>
    ipcRenderer.invoke('desktop:set-check-updates-on-startup', enabled),
};

contextBridge.exposeInMainWorld('desktopConfig', {
  apiBaseUrl: resolveApiBaseUrl(),
  clearAuthOnExit: true,
  isDesktop: true,
} satisfies DesktopConfig);

contextBridge.exposeInMainWorld('desktopBridge', desktopBridge);
