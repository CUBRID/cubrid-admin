import { app, shell } from 'electron';
import {
  checkForUpdate,
  isTrustedDownloadUrl,
  PackageType,
  resolveUpdateRepo,
  UpdateCheckResult,
  UpdateStatus,
} from '@update-check';
import {
  dismissUpdateVersion,
  getDismissedUpdateVersion,
  getLastUpdateCheckAt,
  isCheckForUpdatesOnStartupEnabled,
  recordUpdateCheckTimestamp,
} from '../config/desktop-settings';

const STARTUP_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

let inFlight: Promise<UpdateStatus> | null = null;

function resolvePackageType(): PackageType {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'desktop-mac-arm64' : 'desktop-mac-x64';
  }
  if (process.platform === 'win32') {
    return 'desktop-win-x64';
  }
  return 'desktop-linux-x64';
}

async function runCheck(): Promise<UpdateStatus> {
  const result = await checkForUpdate({
    currentVersion: app.getVersion(),
    packageType: resolvePackageType(),
    repo: resolveUpdateRepo(process.env.CWM_UPDATE_CHECK_REPO),
  }).catch((): UpdateCheckResult => ({ status: 'error', reason: 'network' }));

  const checkedAt = new Date().toISOString();
  try {
    recordUpdateCheckTimestamp(result.status === 'update-available' ? result.latestVersion : undefined);
  } catch (error) {
    // A read-only portable folder must not turn a successful check into a failure.
    console.warn('[desktop] could not persist update-check timestamp:', error);
  }

  return { currentVersion: app.getVersion(), lastCheckedAt: checkedAt, result };
}

/**
 * Runs a fresh check (de-duplicated across concurrent callers). Never
 * rejects — on a closed network this resolves to `{ status: 'error' }`.
 */
export function getUpdateStatus(): Promise<UpdateStatus> {
  if (!inFlight) {
    inFlight = runCheck().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/**
 * Startup notice the renderer asks for once on load: returns a status only
 * when the user hasn't opted out, a check is due (24h since the last one),
 * and that check found an update the user hasn't already dismissed.
 * Everything else — including errors — resolves to null so nothing is shown.
 */
export async function getStartupUpdateNotice(): Promise<UpdateStatus | null> {
  try {
    if (!isCheckForUpdatesOnStartupEnabled()) {
      return null;
    }
    const lastCheckAt = getLastUpdateCheckAt();
    const lastCheckMs = lastCheckAt ? new Date(lastCheckAt).getTime() : Number.NaN;
    if (Number.isFinite(lastCheckMs) && Date.now() - lastCheckMs < STARTUP_CHECK_INTERVAL_MS) {
      return null;
    }

    const status = await getUpdateStatus();
    if (status.result.status !== 'update-available') {
      return null;
    }
    if (getDismissedUpdateVersion() === status.result.latestVersion) {
      return null;
    }
    return status;
  } catch (error) {
    console.warn('[desktop] startup update check skipped:', error);
    return null;
  }
}

export function dismissUpdate(version: unknown): void {
  if (typeof version !== 'string' || version.length === 0 || version.length > 64) {
    return;
  }
  dismissUpdateVersion(version);
}

/** Opens a release/download URL in the system browser — only GitHub https URLs. */
export async function openUpdateDownload(url: unknown): Promise<boolean> {
  if (typeof url !== 'string' || !isTrustedDownloadUrl(url)) {
    return false;
  }
  await shell.openExternal(url);
  return true;
}
