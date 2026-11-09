jest.mock('../protocol/register-app-protocol', () => ({ setAppProtocolApiSocket: jest.fn() }));
jest.mock('../config/secrets', () => ({ loadOrCreateDesktopSecrets: () => ({ seed: 's', salt: 't' }) }));
jest.mock('../workspace/instance-lock', () => ({ acquireWorkspaceLock: jest.fn(), releaseWorkspaceLock: jest.fn() }));
jest.mock('../workspace/paths', () => ({ setWorkspacePathsInUse: jest.fn() }));
jest.mock('../workspace/workspace-paths', () => ({ ensureWorkspaceDirectories: jest.fn() }));
jest.mock('./api-process', () => ({ startApiServer: jest.fn(), stopApiServer: jest.fn() }));
jest.mock('./wait-for-api', () => ({ waitForApiReady: jest.fn() }));

import type { WorkspacePaths } from '../workspace/workspace-paths';

type Runtime = typeof import('./api-runtime');

const paths = (name: string) => ({ workspaceRoot: `/${name}`, dataDir: `/${name}/data`, socketPath: `/${name}/s.sock` }) as WorkspacePaths;

// A server process that ends when it is killed.
const fakeServer = (name: string) => {
  let exit: (code: number | null) => void = () => undefined;
  const exited = new Promise<number | null>((resolve) => { exit = resolve; });
  return { child: { name }, socketPath: '', apiBaseUrl: '', exited, stderrTail: () => '', exit };
};

describe('api-runtime on quit', () => {
  let runtime: Runtime;
  let servers: ReturnType<typeof fakeServer>[];
  let ready: Map<string, () => void>;
  let startApiServer: jest.Mock;
  let stopApiServer: jest.Mock;

  beforeEach(() => {
    // A fresh module each time: its state (running, starting, quitting) starts empty.
    jest.resetModules();
    /* eslint-disable @typescript-eslint/no-var-requires */
    ({ startApiServer, stopApiServer } = require('./api-process'));
    const { waitForApiReady } = require('./wait-for-api');
    servers = [];
    ready = new Map();
    startApiServer.mockImplementation((p: WorkspacePaths) => {
      const server = fakeServer(p.workspaceRoot);
      servers.push(server);
      return server;
    });
    stopApiServer.mockImplementation((child: { name: string }) => {
      servers.find((s) => s.child === child)?.exit(null);
    });
    // Ready when the test says so, or failed when the process ends first.
    (waitForApiReady as jest.Mock).mockImplementation((socketPath: string, exited: Promise<number | null>) =>
      new Promise<void>((resolve, reject) => {
        ready.set(socketPath, resolve);
        void exited.then(() => reject(new Error('server ended')));
      }));
    runtime = require('./api-runtime');
    /* eslint-enable @typescript-eslint/no-var-requires */
  });

  it('stops a server that is still starting (first launch) and starts none after the quit', async () => {
    const start = runtime.startApiForWorkspace(paths('ws'));
    await Promise.resolve();
    expect(servers).toHaveLength(1);

    await runtime.stopDesktopApiOnQuit();
    expect(stopApiServer).toHaveBeenCalledWith(servers[0].child, { force: true });
    await expect(start).rejects.toThrow('WORKSPACE_API_START_FAILED');
    expect(runtime.getApiProcess()).toBeNull();

    await expect(runtime.startApiForWorkspace(paths('ws'))).rejects.toThrow('WORKSPACE_API_START_FAILED');
    expect(servers).toHaveLength(1);
  });

  it('stops the new server of a workspace switch, and does not bring back the old one', async () => {
    const first = runtime.startApiForWorkspace(paths('old'));
    await Promise.resolve();
    ready.get('/old/s.sock')?.();
    await first;

    // The switch (handlers.ts changeWorkspace): stop the old, start the new.
    await runtime.stopDesktopApi();
    const next = runtime.startApiForWorkspace(paths('new'));
    await Promise.resolve();
    expect(servers.map((s) => s.child.name)).toEqual(['/old', '/new']);

    await runtime.stopDesktopApiOnQuit();
    expect(stopApiServer).toHaveBeenLastCalledWith(servers[1].child, { force: true });
    await expect(next).rejects.toThrow('WORKSPACE_API_START_FAILED');

    // ... whose failure then tries the previous workspace again: refused.
    await expect(runtime.startApiForWorkspace(paths('old'))).rejects.toThrow('WORKSPACE_API_START_FAILED');
    expect(servers).toHaveLength(2);
    expect(runtime.isDesktopApiQuitting()).toBe(true);
  });

  it('does not hand back a server that answered after a quit stopped it', async () => {
    stopApiServer.mockImplementation(() => undefined);
    const start = runtime.startApiForWorkspace(paths('ws'));
    await Promise.resolve();
    const quit = runtime.stopDesktopApiOnQuit();
    ready.get('/ws/s.sock')?.();
    await expect(start).rejects.toThrow('WORKSPACE_API_START_FAILED');
    expect(runtime.getApiProcess()).toBeNull();
    servers[0].exit(null);
    await quit;
  });

  it('stops the running server on quit', async () => {
    const start = runtime.startApiForWorkspace(paths('ws'));
    await Promise.resolve();
    ready.get('/ws/s.sock')?.();
    await start;
    await runtime.stopDesktopApiOnQuit();
    expect(stopApiServer).toHaveBeenCalledWith(servers[0].child, { force: true });
    expect(runtime.getApiProcess()).toBeNull();
  });
});
