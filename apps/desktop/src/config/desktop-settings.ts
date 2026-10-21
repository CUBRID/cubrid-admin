import * as fs from 'fs';
import * as path from 'path';
import { getPortableAppRoot, isPathInsideAppBundle } from './portable-root';

export type DesktopSettings = {
  workspaceRoot?: string;
  workspaceSetupComplete?: boolean;
  checkForUpdatesOnStartup?: boolean;
  lastUpdateCheckAt?: string;
  lastKnownLatestVersion?: string;
  dismissedUpdateVersion?: string;
};

const SETTINGS_FILE = 'desktop-settings.json';

function getSettingsFilePath(): string {
  return path.join(getPortableAppRoot(), SETTINGS_FILE);
}

function normalizeLoadedSettings(parsed: DesktopSettings): DesktopSettings {
  const portableRoot = getPortableAppRoot();
  const defaultWorkspace = path.join(portableRoot, 'cwm-workspace');

  if (!parsed.workspaceRoot?.trim()) {
    return parsed;
  }

  const resolved = path.resolve(parsed.workspaceRoot.trim());
  const underPortableRoot =
    resolved === portableRoot || resolved.startsWith(`${portableRoot}${path.sep}`);

  if (!underPortableRoot || isPathInsideAppBundle(resolved)) {
    return {
      workspaceSetupComplete: parsed.workspaceSetupComplete,
    };
  }

  if (path.basename(resolved) === 'test' && resolved !== defaultWorkspace) {
    return {
      workspaceSetupComplete: parsed.workspaceSetupComplete,
    };
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
    throw new Error('Workspace cannot be inside the application bundle.');
  }

  const current = loadDesktopSettings();
  const settings: DesktopSettings = { ...current, workspaceRoot: resolved };
  saveDesktopSettings(settings);
  return settings;
}

export function clearConfiguredWorkspaceRoot(): DesktopSettings {
  const current = loadDesktopSettings();
  const settings: DesktopSettings = {
    workspaceSetupComplete: current.workspaceSetupComplete ?? true,
  };
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
