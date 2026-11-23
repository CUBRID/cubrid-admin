const handlers = new Map<string, (...args: unknown[]) => unknown>();
jest.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => '/unused', getVersion: () => '0.0.0' },
  dialog: {},
  shell: {},
  ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn), on: jest.fn() },
}));
jest.mock('../config/legacy-settings', () => ({ getPreviousWorkspaceOffer: jest.fn() }));
jest.mock('../api/api-runtime', () => ({}));
jest.mock('../api/active-jobs', () => ({}));
jest.mock('../menu/application-menu', () => ({}));
jest.mock('../window/app-window', () => ({}));
jest.mock('../window/quit-flow', () => ({}));
jest.mock('../window/window-registry', () => ({}));
jest.mock('../update/check-for-update', () => ({}));

import { getPreviousWorkspaceOffer } from '../config/legacy-settings';
import { registerDesktopIpcHandlers } from './handlers';

describe("IPC 'desktop:get-previous-workspace'", () => {
  beforeAll(() => registerDesktopIpcHandlers());

  it('answers with the workspace offered on the workspace page', async () => {
    (getPreviousWorkspaceOffer as jest.Mock).mockReturnValue({ workspaceRoot: '/X/cwm-workspace', settingsFolder: '/X' });
    await expect(Promise.resolve(handlers.get('desktop:get-previous-workspace')?.({}))).resolves.toEqual({ workspaceRoot: '/X/cwm-workspace', settingsFolder: '/X' });
  });

  it('answers null when nothing is offered', async () => {
    (getPreviousWorkspaceOffer as jest.Mock).mockReturnValue(null);
    await expect(Promise.resolve(handlers.get('desktop:get-previous-workspace')?.({}))).resolves.toBeNull();
  });
});
