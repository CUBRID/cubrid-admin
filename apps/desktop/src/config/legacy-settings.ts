import * as fs from 'fs';
import * as path from 'path';
import { DesktopSettings, readDesktopSettingsFile } from './desktop-settings';
import { getDesktopDataRoot, getLegacyDataRoot } from './portable-root';

const SETTINGS_FILE = 'desktop-settings.json';
const DEFAULT_WORKSPACE = 'cwm-workspace';

export type LegacyAdoption = {
  /** The 0.1.0 settings file that was read (left as it is). */
  from: string;
  /** The settings file written in the current place. */
  to: string;
  workspaceRoot: string;
};

const hasWorkspace = (settings: DesktopSettings): boolean =>
  settings.workspaceSetupComplete === true || Boolean(settings.workspaceRoot?.trim());

function readIfThere(filePath: string): DesktopSettings | null {
  return fs.existsSync(filePath) ? readDesktopSettingsFile(filePath) : null;
}

/**
 * 0.1.0 kept desktop-settings.json and the default cwm-workspace/ beside the
 * app (the folder that contains the .app, or the executable); 0.2.0 keeps them
 * in the user's app data folder when the app is installed (e.g. in
 * /Applications). An app updated in place would then start without its
 * workspace. When no workspace is set up in the current place yet and the 0.1.0
 * place has one, its settings are written to the current place, with
 * workspaceRoot pointing at that workspace (its own workspaceRoot, or the
 * default cwm-workspace/ beside the app). The workspace folder is not moved and
 * the 0.1.0 settings file is left as it is. Settings already in the current
 * place other than the workspace (update check times) are kept.
 *
 * Returns what was done, or null when there was nothing to do. A 0.1.0 file that
 * cannot be read is left alone (logged), and the app starts as without it.
 */
export function adoptLegacyDesktopSettings(
  currentRoot: string = getDesktopDataRoot(),
  legacyRoot: string | null = getLegacyDataRoot()
): LegacyAdoption | null {
  if (!legacyRoot || path.resolve(legacyRoot) === path.resolve(currentRoot)) {
    return null;
  }

  const from = path.join(legacyRoot, SETTINGS_FILE);
  const to = path.join(currentRoot, SETTINGS_FILE);
  let legacy: DesktopSettings | null;
  let current: DesktopSettings | null;
  try {
    legacy = readIfThere(from);
    current = readIfThere(to);
  } catch (error) {
    console.warn('[desktop] 0.1.0 settings not used:', (error as Error).message);
    return null;
  }
  if (!legacy || !hasWorkspace(legacy) || (current && hasWorkspace(current))) {
    return null;
  }

  const legacyDefault = path.join(legacyRoot, DEFAULT_WORKSPACE);
  const workspaceRoot = legacy.workspaceRoot?.trim() || (fs.existsSync(legacyDefault) ? legacyDefault : '');
  if (!workspaceRoot) {
    return null;
  }

  const settings: DesktopSettings = { ...legacy, ...current, workspaceRoot: path.resolve(workspaceRoot) };
  if (legacy.workspaceSetupComplete === true) {
    settings.workspaceSetupComplete = true;
  }
  fs.mkdirSync(currentRoot, { recursive: true });
  fs.writeFileSync(to, JSON.stringify(settings, null, 2), { encoding: 'utf8', mode: 0o600 });
  return { from, to, workspaceRoot: settings.workspaceRoot as string };
}
