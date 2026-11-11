import { toAppRouteUrl } from './app-window';
import { loadRoute } from './load-route';

function fakeWindow(currentUrl: string) {
  const listeners: Record<string, () => void> = {};
  return {
    loadURL: jest.fn(async () => undefined),
    webContents: {
      getURL: () => currentUrl,
      reload: jest.fn(() => listeners['did-finish-load']?.()),
      once: jest.fn((event: string, listener: () => void) => {
        listeners[event] = listener;
      }),
    },
  };
}

describe('loadRoute', () => {
  it('loads another route with loadURL', async () => {
    const window = fakeWindow(toAppRouteUrl(''));
    await loadRoute(window, 'desktop/workspace');
    expect(window.loadURL).toHaveBeenCalledWith(toAppRouteUrl('desktop/workspace'));
    expect(window.webContents.reload).not.toHaveBeenCalled();
  });

  it('reloads the route the window already shows, so the page reads the new state', async () => {
    const window = fakeWindow(toAppRouteUrl('desktop/workspace'));
    await loadRoute(window, 'desktop/workspace');
    expect(window.webContents.reload).toHaveBeenCalledTimes(1);
    expect(window.loadURL).not.toHaveBeenCalled();
  });
});
