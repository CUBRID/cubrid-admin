/**
 * True in the desktop (Electron) app, which has no app login: its server
 * acts as the one desktop user (DesktopUserGuard). False in a browser.
 */
export function isDesktopApp() {
  if (typeof window === 'undefined') {
    return false;
  }
  return (
    window.location.protocol === 'app:' ||
    window.desktopConfig?.isDesktop === true ||
    Boolean(window.desktopBridge)
  );
}
