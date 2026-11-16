jest.mock('../protocol/origin', () => ({ resolveDesktopAllowedOrigin: () => 'app://cubrid-admin,app://' }));
jest.mock('../workspace/paths', () => ({ getApiServerDir: jest.fn(), getApiServerEntry: jest.fn() }));

import * as path from 'path';
import { apiServerEnv } from './api-process';
import { resolveWorkspacePaths } from '../workspace/workspace-paths';

describe('apiServerEnv', () => {
  const workspace = path.resolve('/tmp/ws-test');
  const env = apiServerEnv(resolveWorkspacePaths(workspace), { seed: 's', salt: 't' }, { PATH: '/bin', CWM_HOME: '/opt/x', LOG_DIR: '/opt/x/logs' });
  const inWorkspace = (value: string | undefined) => !!value && (value === workspace || value.startsWith(`${workspace}${path.sep}`));

  it('keeps every folder the server writes to in the workspace', () => {
    expect(inWorkspace(env.LOG_DIR)).toBe(true);
    expect(env.LOG_DIR).toBe(path.join(workspace, 'logs'));
    expect(inWorkspace(env.STORAGE_PATH)).toBe(true);
    expect(inWorkspace(env.CWM_SSL_DIR)).toBe(true);
    expect(inWorkspace(env.CWM_CONF_PATH)).toBe(true);
  });

  it('runs the server as the desktop server, with no CWM_HOME of its own', () => {
    expect(env.CWM_HOME).toBeUndefined();
    expect(env.CWM_DESKTOP).toBe('1');
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1');
    expect(env.SEED).toBe('s');
    expect(env.SALT).toBe('t');
    expect(env.PATH).toBe('/bin');
  });
});
