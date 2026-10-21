import { app, dialog, shell } from 'electron';
import { checkForUpdate as checkForUpdateCore, PackageType, UpdateCheckResult } from '@update-check';
import {
  dismissUpdateVersion,
  getDismissedUpdateVersion,
  getLastUpdateCheckAt,
  isCheckForUpdatesOnStartupEnabled,
  recordUpdateCheckTimestamp,
} from '../config/desktop-settings';
import { getMainWindow } from '../window/window-registry';

const BACKGROUND_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TRUSTED_DOWNLOAD_HOSTS = ['github.com', 'objects.githubusercontent.com'];

function resolvePackageType(): PackageType {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'desktop-mac-arm64' : 'desktop-mac-x64';
  }
  if (process.platform === 'win32') {
    return 'desktop-win-x64';
  }
  return 'desktop-linux-x64';
}

function isTrustedDownloadUrl(url: string): boolean {
  try {
    return TRUSTED_DOWNLOAD_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

function showMessageBox(
  options: Electron.MessageBoxOptions
): Promise<Electron.MessageBoxReturnValue> {
  const window = getMainWindow();
  return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);
}

async function runCheck(): Promise<UpdateCheckResult> {
  const result = await checkForUpdateCore({
    currentVersion: app.getVersion(),
    packageType: resolvePackageType(),
  });
  recordUpdateCheckTimestamp(result.status === 'update-available' ? result.latestVersion : undefined);
  return result;
}

async function showUpdateAvailableDialog(
  result: Extract<UpdateCheckResult, { status: 'update-available' }>,
  { allowDismiss }: { allowDismiss: boolean }
): Promise<void> {
  const buttons = allowDismiss ? ['다운로드 페이지 열기', '나중에'] : ['다운로드 페이지 열기', '닫기'];

  const { response } = await showMessageBox({
    type: 'info',
    buttons,
    defaultId: 0,
    message: `새 버전이 있습니다 (v${result.latestVersion})`,
    detail: '다운로드 페이지에서 설치 파일을 받아 업데이트하세요.',
  });

  if (response === 0) {
    const url = isTrustedDownloadUrl(result.downloadUrl) ? result.downloadUrl : result.releaseNotesUrl;
    await shell.openExternal(url);
  } else if (allowDismiss) {
    dismissUpdateVersion(result.latestVersion);
  }
}

/** Manual "Check for Updates..." menu action — always hits the network and always shows a result. */
export async function checkForUpdateManually(): Promise<void> {
  const result = await runCheck();

  if (result.status === 'up-to-date') {
    await showMessageBox({ message: `현재 최신 버전입니다 (v${app.getVersion()}).` });
    return;
  }

  if (result.status === 'update-available') {
    await showUpdateAvailableDialog(result, { allowDismiss: false });
    return;
  }

  await showMessageBox({
    type: 'warning',
    message: '업데이트 확인에 실패했습니다. 네트워크 연결을 확인해 주세요.',
  });
}

/**
 * Called once at startup. Silently does nothing unless it's actually due
 * (24h since last check) and the result is a non-dismissed update — never
 * surfaces errors or "up to date" to the user, since this wasn't requested.
 */
export async function checkForUpdateInBackgroundIfDue(): Promise<void> {
  if (!isCheckForUpdatesOnStartupEnabled()) {
    return;
  }

  const lastCheckAt = getLastUpdateCheckAt();
  const dueForCheck = !lastCheckAt || Date.now() - new Date(lastCheckAt).getTime() >= BACKGROUND_CHECK_INTERVAL_MS;
  if (!dueForCheck) {
    return;
  }

  const result = await runCheck().catch((): UpdateCheckResult => ({ status: 'error', reason: 'network' }));
  if (result.status !== 'update-available') {
    return;
  }
  if (getDismissedUpdateVersion() === result.latestVersion) {
    return;
  }

  await showUpdateAvailableDialog(result, { allowDismiss: true });
}
