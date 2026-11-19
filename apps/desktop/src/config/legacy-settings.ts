import * as fs from 'fs';
import * as path from 'path';
import { DesktopSettings, needsWorkspaceSetup, readDesktopSettingsFile } from './desktop-settings';
import { findPreviousWorkspace, type PreviousWorkspace } from './last-workspace';
import { getDesktopDataRoot, getLegacyDataRoot, isPathInsideAppBundle, isPathInsideInstallFolder } from './portable-root';
import { isServerFolder } from './server-folder';

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
 * The workspace 0.1.0 used: its own workspaceRoot, or the default cwm-workspace/
 * beside the app. A workspaceRoot inside the app bundle counts as none (the
 * current app would drop it). Empty when there is no such folder.
 */
function legacyWorkspaceRoot(legacy: DesktopSettings, legacyRoot: string): string {
  const chosen = legacy.workspaceRoot?.trim() ? path.resolve(legacy.workspaceRoot.trim()) : '';
  if (chosen && !isPathInsideAppBundle(chosen)) {
    return chosen;
  }
  const fallback = path.join(legacyRoot, DEFAULT_WORKSPACE);
  return fs.existsSync(fallback) ? fallback : '';
}

/**
 * 0.1.0 kept desktop-settings.json and the default cwm-workspace/ beside the
 * app (the folder that contains the .app, or the executable); 0.2.0 keeps them
 * in the user's app data folder when the app is installed (e.g. in
 * /Applications). An app updated in place would then start without its
 * workspace. When no workspace is set up in the current place yet and the 0.1.0
 * place has one, its settings are written to the current place, with
 * workspaceRoot pointing at that workspace. The workspace folder is not moved
 * and the 0.1.0 settings file is left as it is. Settings already in the current
 * place other than the workspace (update check times) are kept.
 *
 * Not done for a workspace in the Windows install folder: the installer's next
 * update or uninstall would remove it; the user is asked for a workspace instead
 * (and may not pick that one). A file that cannot be read or written only logs,
 * and the app starts as without it. Returns what was done, or null.
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
  try {
    legacy = readIfThere(from);
  } catch (error) {
    console.warn('[desktop] 0.1.0 settings not used:', (error as Error).message);
    return null;
  }
  if (!legacy || !hasWorkspace(legacy)) {
    return null;
  }
  let current: DesktopSettings | null;
  try {
    current = readIfThere(to);
  } catch (error) {
    console.warn('[desktop] 0.1.0 settings not copied: the current settings file cannot be read:', (error as Error).message);
    return null;
  }
  if (current && hasWorkspace(current)) {
    return null;
  }

  const workspaceRoot = legacyWorkspaceRoot(legacy, legacyRoot);
  if (!workspaceRoot) {
    return null;
  }
  if (isPathInsideInstallFolder(workspaceRoot)) {
    console.warn(`[desktop] 0.1.0 workspace ${workspaceRoot} not used: it is in the install folder, which an update or uninstall removes`);
    return null;
  }
  if (isServerFolder(workspaceRoot)) {
    console.warn(`[desktop] 0.1.0 workspace ${workspaceRoot} not used: it is a CUBRID Admin Server folder`);
    return null;
  }

  const settings: DesktopSettings = { ...legacy, ...current, workspaceRoot };
  if (legacy.workspaceSetupComplete === true) {
    settings.workspaceSetupComplete = true;
  }
  try {
    fs.mkdirSync(currentRoot, { recursive: true });
    fs.writeFileSync(to, JSON.stringify(settings, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    console.warn(`[desktop] 0.1.0 settings not copied to ${to}:`, (error as Error).message);
    return null;
  }
  return { from, to, workspaceRoot };
}

export type DesktopStartup = {
  adopted: LegacyAdoption | null;
  requiresSetup: boolean;
  /** Offered on the workspace page (never used without the user's choice). */
  previous: PreviousWorkspace | null;
};

let previousOffer: PreviousWorkspace | null = null;

/**
 * At launch, before anything else reads the settings: the 0.1.0 settings are
 * taken over first; then, when a workspace still has to be chosen and nothing
 * was taken over, the workspace used last (by any copy of the app) is kept to
 * offer on the workspace page.
 */
export function prepareDesktopStartup(): DesktopStartup {
  const adopted = adoptLegacyDesktopSettings();
  const requiresSetup = needsWorkspaceSetup();
  previousOffer = requiresSetup && !adopted ? findPreviousWorkspace() : null;
  return { adopted, requiresSetup, previous: previousOffer };
}

/** The workspace offered on the workspace page, while a workspace has to be chosen. */
export function getPreviousWorkspaceOffer(): PreviousWorkspace | null {
  return previousOffer && needsWorkspaceSetup() ? previousOffer : null;
}
