import type { WebContents } from 'electron';

/**
 * The desktop window has no browser back and forward: the mouse's back and
 * forward buttons (and anything else that walks the history, such as an
 * overscroll swipe) would move the app to an earlier screen. Only the current
 * page is kept in the history, so there is nowhere to go. Links, buttons,
 * tabs and the sidebar navigate as before.
 */
export function keepNoBackForwardHistory(webContents: WebContents): void {
  const drop = () => {
    if (webContents.isDestroyed()) return;
    const history = webContents.navigationHistory;
    if (history.canGoBack() || history.canGoForward()) {
      history.clear();
    }
  };
  webContents.on('did-navigate', drop);
  webContents.on('did-navigate-in-page', (_event, _url, isMainFrame) => {
    if (isMainFrame) drop();
  });
}
