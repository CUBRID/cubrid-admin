import * as fs from 'fs';
import * as path from 'path';
import { getDesktopDataRoot, isPathInsideAppBundle } from './portable-root';

export type DesktopSettings = {
  workspaceRoot?: string;
  workspaceSetupComplete?: boolean;
  checkForUpdatesOnStartup?: boolean;
  lastUpdateCheckAt?: string;
  lastKnownLatestVersion?: string;
  dismissedUpdateVersion?: string;
  /** The folder of the last file or folder chosen in a file dialog (see window/dialog-paths.ts). */
  lastDialogDirectory?: string;
};

const SETTINGS_FILE = 'desktop-settings.json';

function getSettingsFilePath(): string {
  return path.join(getDesktopDataRoot(), SETTINGS_FILE);
}

/** Drops only the workspace override; update preferences and history stay. */
function withoutWorkspaceRoot(settings: DesktopSettings): DesktopSettings {
  const rest = { ...settings };
  delete rest.workspaceRoot;
  return rest;
}

// A workspace may be any folder outside the app bundle (inside it, an app
// update would replace it); one the user picks is kept as picked.
function normalizeLoadedSettings(parsed: DesktopSettings): DesktopSettings {
  if (!parsed.workspaceRoot?.trim()) {
    return parsed;
  }

  if (isPathInsideAppBundle(path.resolve(parsed.workspaceRoot.trim()))) {
    return withoutWorkspaceRoot(parsed);
  }

  return parsed;
}

export function loadDesktopSettings(): DesktopSettings {
  const filePath = getSettingsFilePath();
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as DesktopSettings;
  if (parsed.workspaceRoot != null && typeof parsed.workspaceRoot !== 'string') {
    throw new Error(`Invalid desktop settings file: ${filePath}`);
  }
  if (
    parsed.workspaceSetupComplete != null &&
    typeof parsed.workspaceSetupComplete !== 'boolean'
  ) {
    throw new Error(`Invalid desktop settings file: ${filePath}`);
  }
  if (
    parsed.checkForUpdatesOnStartup != null &&
    typeof parsed.checkForUpdatesOnStartup !== 'boolean'
  ) {
    throw new Error(`Invalid desktop settings file: ${filePath}`);
  }
  for (const field of ['lastUpdateCheckAt', 'lastKnownLatestVersion', 'dismissedUpdateVersion'] as const) {
    if (parsed[field] != null && typeof parsed[field] !== 'string') {
      throw new Error(`Invalid desktop settings file: ${filePath}`);
    }
  }

  return normalizeLoadedSettings(parsed);
}

export function needsWorkspaceSetup(): boolean {
  return loadDesktopSettings().workspaceSetupComplete !== true;
}

export function markWorkspaceSetupComplete(): void {
  const current = loadDesktopSettings();
  saveDesktopSettings({ ...current, workspaceSetupComplete: true });
}

export function saveDesktopSettings(settings: DesktopSettings): void {
  const filePath = getSettingsFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export function setWorkspaceRoot(workspaceRoot: string): DesktopSettings {
  const resolved = path.resolve(workspaceRoot);
  if (isPathInsideAppBundle(resolved)) {
    // A code the settings page words in the UI language.
    throw new Error('WORKSPACE_IN_APP_BUNDLE');
  }

  const current = loadDesktopSettings();
  const settings: DesktopSettings = { ...current, workspaceRoot: resolved };
  saveDesktopSettings(settings);
  return settings;
}

export function getDesktopSettingsPath(): string {
  return getSettingsFilePath();
}

export function isCheckForUpdatesOnStartupEnabled(): boolean {
  return loadDesktopSettings().checkForUpdatesOnStartup !== false;
}

export function setCheckForUpdatesOnStartup(enabled: boolean): void {
  const current = loadDesktopSettings();
  saveDesktopSettings({ ...current, checkForUpdatesOnStartup: enabled });
}

export function recordUpdateCheckTimestamp(latestVersion?: string): void {
  const current = loadDesktopSettings();
  saveDesktopSettings({
    ...current,
    lastUpdateCheckAt: new Date().toISOString(),
    ...(latestVersion ? { lastKnownLatestVersion: latestVersion } : {}),
  });
}

export function getLastUpdateCheckAt(): string | undefined {
  return loadDesktopSettings().lastUpdateCheckAt;
}

export function getDismissedUpdateVersion(): string | undefined {
  return loadDesktopSettings().dismissedUpdateVersion;
}

export function dismissUpdateVersion(version: string): void {
  const current = loadDesktopSettings();
  saveDesktopSettings({ ...current, dismissedUpdateVersion: version });
}
