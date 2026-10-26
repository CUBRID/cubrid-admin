import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  clearConfiguredWorkspaceRoot,
  getDismissedUpdateVersion,
  getLastUpdateCheckAt,
  isCheckForUpdatesOnStartupEnabled,
  loadDesktopSettings,
} from './desktop-settings';

jest.mock('electron', () => ({ app: { isPackaged: false } }));

const updateSettings = {
  checkForUpdatesOnStartup: false,
  lastUpdateCheckAt: '2026-10-26T00:00:00.000Z',
  lastKnownLatestVersion: '0.2.0',
  dismissedUpdateVersion: '0.2.0',
};

describe('desktop settings', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-settings-'));
    process.env.CWM_PORTABLE_APP_ROOT = root;
  });

  afterEach(() => {
    delete process.env.CWM_PORTABLE_APP_ROOT;
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeSettings(settings: object): void {
    fs.writeFileSync(path.join(root, 'desktop-settings.json'), JSON.stringify(settings));
  }

  function readSettingsFile(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(root, 'desktop-settings.json'), 'utf8'));
  }

  it('keeps update preferences when the workspace is reset to the default', () => {
    writeSettings({
      workspaceRoot: path.join(root, 'custom-workspace'),
      workspaceSetupComplete: true,
      ...updateSettings,
    });

    clearConfiguredWorkspaceRoot();

    expect(readSettingsFile()).toEqual({ workspaceSetupComplete: true, ...updateSettings });
    expect(isCheckForUpdatesOnStartupEnabled()).toBe(false);
    expect(getLastUpdateCheckAt()).toBe(updateSettings.lastUpdateCheckAt);
    expect(getDismissedUpdateVersion()).toBe(updateSettings.dismissedUpdateVersion);
  });

  it('marks setup complete when resetting a workspace that never finished setup', () => {
    writeSettings({ workspaceRoot: path.join(root, 'custom-workspace') });

    expect(clearConfiguredWorkspaceRoot()).toEqual({ workspaceSetupComplete: true });
  });

  it('drops only an out-of-root workspace on load and keeps update preferences', () => {
    writeSettings({
      workspaceRoot: path.join(os.tmpdir(), 'elsewhere'),
      workspaceSetupComplete: true,
      ...updateSettings,
    });

    expect(loadDesktopSettings()).toEqual({ workspaceSetupComplete: true, ...updateSettings });
  });

  it('drops only a stray "test" workspace on load and keeps update preferences', () => {
    writeSettings({
      workspaceRoot: path.join(root, 'test'),
      workspaceSetupComplete: true,
      ...updateSettings,
    });

    expect(loadDesktopSettings()).toEqual({ workspaceSetupComplete: true, ...updateSettings });
  });

  it('keeps a valid workspace under the portable root', () => {
    const workspaceRoot = path.join(root, 'cwm-workspace');
    writeSettings({ workspaceRoot, workspaceSetupComplete: true, ...updateSettings });

    expect(loadDesktopSettings()).toEqual({ workspaceRoot, workspaceSetupComplete: true, ...updateSettings });
  });
});
