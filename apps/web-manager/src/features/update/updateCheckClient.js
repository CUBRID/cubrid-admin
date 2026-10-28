import apiClient from '../../api/apiClient';

const TRUSTED_DOWNLOAD_HOSTS = ['github.com', 'objects.githubusercontent.com'];

export function isTrustedDownloadUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && TRUSTED_DOWNLOAD_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

const getDesktopBridge = () => (typeof window === 'undefined' ? undefined : window.desktopBridge);

/**
 * The desktop app asks its own main process (which knows the desktop
 * package type/version); a browser asks the server it was served from.
 * Both return the same { currentVersion, lastCheckedAt, result } shape.
 */
export async function fetchUpdateStatus() {
  const bridge = getDesktopBridge();
  const status = bridge?.getUpdateStatus
    ? await bridge.getUpdateStatus()
    : await apiClient.get('/version/check');

  if (!status || typeof status.result?.status !== 'string') {
    throw new Error('Malformed update status');
  }
  return {
    currentVersion: status.currentVersion,
    lastCheckedAt: status.lastCheckedAt ?? null,
    result: status.result,
  };
}

/** Desktop only: the startup notice (null when nothing should be shown). */
export async function fetchStartupUpdateNotice() {
  const bridge = getDesktopBridge();
  return bridge?.getStartupUpdateNotice ? bridge.getStartupUpdateNotice() : null;
}

/** Desktop only: remember that the user chose "Later" for this version. */
export async function dismissUpdate(version) {
  const bridge = getDesktopBridge();
  if (bridge?.dismissUpdate && version) {
    await bridge.dismissUpdate(version);
  }
}

/**
 * Opens a GitHub release/download URL outside the app. In Electron this
 * must go through the main process (shell.openExternal) — a renderer
 * window.open would just open another app window.
 */
export async function openUpdateUrl(url) {
  if (!isTrustedDownloadUrl(url)) {
    return false;
  }
  const bridge = getDesktopBridge();
  if (bridge?.openUpdateDownload) {
    return bridge.openUpdateDownload(url);
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
