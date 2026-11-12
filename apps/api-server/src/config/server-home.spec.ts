import * as path from 'path';
import { refuseInstalledCopyWithoutHome, serverHome } from './server-home';
import { isStandaloneExecutable } from '../util/standalone-executable';
import { getStoragePath } from '../util/resolve-storage-path';
import { getLogPath } from '../util/resolve-log-path';

jest.mock('../util/standalone-executable', () => ({ isStandaloneExecutable: jest.fn(() => false) }));

describe('serverHome', () => {
  const keys = ['CWM_HOME', 'STORAGE_PATH', 'LOG_DIR'];
  let saved: Record<string, string | undefined>;
  const realExecPath = process.execPath;

  beforeEach(() => {
    saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    keys.forEach((key) => delete process.env[key]);
  });

  afterEach(() => {
    jest.mocked(isStandaloneExecutable).mockReturnValue(false);
    Object.defineProperty(process, 'execPath', { value: realExecPath });
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  function runAsPackaged(execPath: string): void {
    jest.mocked(isStandaloneExecutable).mockReturnValue(true);
    Object.defineProperty(process, 'execPath', { value: execPath });
  }

  it('uses CWM_HOME when set (installers), before the executable folder', () => {
    runAsPackaged('/opt/cubrid-admin/cubrid-admin');
    process.env.CWM_HOME = '/var/lib/cubrid-admin';
    expect(serverHome('/dev')).toBe('/var/lib/cubrid-admin');
  });

  it('uses the executable folder for the packaged server (portable)', () => {
    runAsPackaged('/home/me/cubrid-admin/cubrid-admin-linux');
    expect(serverHome('/dev')).toBe('/home/me/cubrid-admin');
  });

  it('uses the given folder when running from source', () => {
    expect(serverHome('/repo')).toBe('/repo');
  });

  it('puts storage and logs under CWM_HOME, and a relative STORAGE_PATH is taken from it', () => {
    runAsPackaged('/opt/cubrid-admin/cubrid-admin');
    process.env.CWM_HOME = '/var/lib/cubrid-admin';
    expect(getStoragePath()).toBe(path.join('/var/lib/cubrid-admin', 'storage'));
    expect(getLogPath()).toBe(path.join('/var/lib/cubrid-admin', 'logs'));
    process.env.STORAGE_PATH = './data';
    expect(getStoragePath()).toBe(path.join('/var/lib/cubrid-admin', 'data'));
  });

  it('refuses the installed executable run by hand without CWM_HOME', () => {
    runAsPackaged('/opt/cubrid-admin/cubrid-admin');
    expect(() => refuseInstalledCopyWithoutHome()).toThrow(/systemctl start cubrid-admin/);
    process.env.CWM_HOME = '/var/lib/cubrid-admin';
    expect(() => refuseInstalledCopyWithoutHome()).not.toThrow();
  });

  it('lets a portable executable elsewhere run without CWM_HOME', () => {
    runAsPackaged('/home/me/cubrid-admin/cubrid-admin-linux');
    expect(() => refuseInstalledCopyWithoutHome()).not.toThrow();
  });

  it('keeps LOG_DIR and an absolute STORAGE_PATH as they are', () => {
    process.env.CWM_HOME = '/var/lib/cubrid-admin';
    process.env.LOG_DIR = '/var/log/cubrid-admin';
    process.env.STORAGE_PATH = '/srv/data';
    expect(getLogPath()).toBe('/var/log/cubrid-admin');
    expect(getStoragePath()).toBe('/srv/data');
  });
});
