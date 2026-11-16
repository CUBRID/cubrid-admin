import { toAppRouteUrl } from './app-window';

type RouteWindow = {
  loadURL(url: string): Promise<void>;
  webContents: {
    getURL(): string;
    reload(): void;
    once(event: 'did-finish-load' | 'did-fail-load', listener: () => void): unknown;
  };
};

/**
 * Shows an app route. When the window already shows it, loadURL would only be
 * an in-page navigation and the page would not read the app's new state (for
 * example a server start that failed during workspace setup), so it reloads.
 */
export async function loadRoute(window: RouteWindow, routePath: string): Promise<void> {
  const url = toAppRouteUrl(routePath);
  if (window.webContents.getURL() !== url) {
    await window.loadURL(url);
    return;
  }
  await new Promise<void>((resolve) => {
    window.webContents.once('did-finish-load', resolve);
    window.webContents.once('did-fail-load', resolve);
    window.webContents.reload();
  });
}
