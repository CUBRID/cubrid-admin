// The workspace switch handlers, with Electron and the server runtime replaced.
const handlers = new Map<string, (...args: unknown[]) => unknown>();
jest.mock('electron', () => ({
  app: { getPath: () => '/tmp', getVersion: () => '0.0.0' },
  dialog: {},
  shell: {},
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler), on: jest.fn() },
}));
jest.mock('../api/active-jobs');
jest.mock('../api/api-runtime');
jest.mock('../config/desktop-settings');
jest.mock('../config/portable-root');
jest.mock('../product-version');
jest.mock('../menu/application-menu');
jest.mock('../workspace/paths');
jest.mock('../workspace/workspace-archive');
jest.mock('../workspace/workspace-import');
jest.mock('../workspace/workspace-paths');
jest.mock('../workspace/workspace-setup');
jest.mock('../api/start-status');
jest.mock('../window/dialog-paths');
jest.mock('../window/app-window');
jest.mock('../window/window-registry');
jest.mock('../window/quit-flow');
// A factory, so the real module (and the built @update-check lib it imports) is never loaded.
jest.mock('../update/check-for-update', () => ({
  dismissUpdate: jest.fn(),
  getStartupUpdateNotice: jest.fn(),
  getUpdateStatus: jest.fn(),
  openUpdateDownload: jest.fn(),
}));
jest.mock('../workspace/workspace-check', () => ({
  ...jest.requireActual('../workspace/workspace-check'),
  checkWorkspaceRoot: jest.fn(async (root: string) => ({ workspaceRoot: root, dataDir: `${root}/data`, socketPath: `${root}/s.sock` })),
}));

import * as runtime from '../api/api-runtime';
import { notifyWorkspaceSetupComplete } from '../workspace/workspace-setup';
import { getWorkspacePaths } from '../workspace/paths';
import { registerDesktopIpcHandlers } from './handlers';

const isStarting = runtime.isDesktopApiStarting as jest.Mock;

beforeAll(() => registerDesktopIpcHandlers());

beforeEach(() => {
  jest.clearAllMocks();
  isStarting.mockReturnValue(false);
  (runtime.getRunningWorkspacePaths as jest.Mock).mockReturnValue(null);
  (runtime.stopDesktopApi as jest.Mock).mockResolvedValue(undefined);
  (runtime.startApiForWorkspace as jest.Mock).mockResolvedValue({});
  (getWorkspacePaths as jest.Mock).mockReturnValue({ workspaceRoot: '/current' });
});

describe('while a server start is in progress', () => {
  it('refuses a workspace switch and leaves the start alone', async () => {
    isStarting.mockReturnValue(true);
    await expect(handlers.get('desktop:set-workspace-root')?.({}, '/imported')).rejects.toThrow('WORKSPACE_API_STARTING');
    expect(runtime.stopDesktopApi).not.toHaveBeenCalled();
    expect(runtime.startApiForWorkspace).not.toHaveBeenCalled();
  });

  it('refuses to finish the workspace setup', async () => {
    isStarting.mockReturnValue(true);
    await expect(handlers.get('desktop:finish-workspace-setup')?.({}, '/imported')).rejects.toThrow('WORKSPACE_API_STARTING');
    expect(notifyWorkspaceSetupComplete).not.toHaveBeenCalled();
  });
});

describe('with no start in progress', () => {
  it('switches the workspace', async () => {
    await expect(handlers.get('desktop:set-workspace-root')?.({}, '/imported')).resolves.toEqual({ ok: true });
    expect(runtime.stopDesktopApi).toHaveBeenCalled();
    expect(runtime.startApiForWorkspace).toHaveBeenCalledWith(expect.objectContaining({ workspaceRoot: '/imported' }));
  });

  it('finishes the workspace setup', async () => {
    await expect(handlers.get('desktop:finish-workspace-setup')?.({}, '/imported')).resolves.toEqual({ ok: true });
    expect(notifyWorkspaceSetupComplete).toHaveBeenCalled();
  });
});
