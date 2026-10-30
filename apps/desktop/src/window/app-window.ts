import { BrowserWindow, shell } from 'electron';
import * as path from 'path';

/** Hash routes keep asset URLs rooted at index.html (./assets/...). */
export function toAppRouteUrl(routePath: string): string {
  const normalized = routePath.replace(/^\/+/, '');
  return `app://./index.html#/${normalized}`;
}

function isExternalWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

// openExternal rejects when the OS has no browser for the URL or refuses to
// start one; nothing else would report that.
function openInBrowser(url: string): void {
  shell.openExternal(url).catch((error) => {
    console.error('[desktop] failed to open link in browser', { url, error });
  });
}

/**
 * Web links (Help menu, login footer, release pages) open in the user's
 * default browser. The app never opens a second Electron window, and its
 * own window never navigates away from app://.
 */
function routeExternalLinksToBrowser(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) {
      openInBrowser(url);
    }
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('app://')) {
      return;
    }
    event.preventDefault();
    if (isExternalWebUrl(url)) {
      openInBrowser(url);
    }
  });
}

export function createAppWindow(apiBaseUrl?: string): BrowserWindow {
  const preloadPath = path.join(__dirname, '..', 'preload.js');
  const additionalArguments = apiBaseUrl ? [`--cwm-api-base-url=${apiBaseUrl}`] : [];

  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments,
    },
  });
  routeExternalLinksToBrowser(window);
  return window;
}
