import type { BrowserWindow, Input, WebContents } from 'electron';

export type ZoomAction = 'in' | 'out' | 'reset';

// One step of Electron's own zoomIn/zoomOut menu roles.
const ZOOM_STEP = 0.5;

/**
 * The zoom a key press asks for, read the way Chrome reads it: Ctrl (Cmd on
 * macOS) with `=`/`+` or the numeric keypad `+` zooms in, with `-` or the
 * keypad `-` zooms out, with `0` or the keypad `0` resets. Electron's menu
 * roles only bind `+` (Shift+= on most layouts), so `Ctrl+=` and the keypad
 * did nothing.
 */
export function zoomActionForInput(
  input: Pick<Input, 'type' | 'control' | 'meta' | 'alt' | 'code'>
): ZoomAction | null {
  if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return null;
  switch (input.code) {
    case 'Equal':
    case 'NumpadAdd':
      return 'in';
    case 'Minus':
    case 'NumpadSubtract':
      return 'out';
    case 'Digit0':
    case 'Numpad0':
      return 'reset';
    default:
      return null;
  }
}

export function applyZoom(
  webContents: Pick<WebContents, 'getZoomLevel' | 'setZoomLevel'>,
  action: ZoomAction
): void {
  if (action === 'reset') {
    webContents.setZoomLevel(0);
    return;
  }
  webContents.setZoomLevel(webContents.getZoomLevel() + (action === 'in' ? ZOOM_STEP : -ZOOM_STEP));
}

/**
 * Zoom from the keyboard and from Ctrl (Cmd) + mouse wheel. The key handler
 * runs before the page and the menu see the key, so a menu accelerator for
 * the same key cannot zoom a second time. Chromium reports a wheel zoom
 * request (`zoom-changed`) and leaves the zoom itself to the app.
 */
export function installZoomShortcuts(window: BrowserWindow): void {
  const { webContents } = window;
  webContents.on('before-input-event', (event, input) => {
    const action = zoomActionForInput(input);
    if (!action) return;
    event.preventDefault();
    applyZoom(webContents, action);
  });
  webContents.on('zoom-changed', (_event, direction) => {
    applyZoom(webContents, direction === 'in' ? 'in' : 'out');
  });
}
