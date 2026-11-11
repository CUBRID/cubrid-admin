import * as os from 'os';
import * as path from 'path';

const mockApp = { isPackaged: true, getPath: jest.fn((name: string) => `/user-data/${name}`) };
jest.mock('electron', () => ({ app: mockApp }));

import { getDesktopDataRoot, getPortableFolder } from './portable-root';

const ENV_KEYS = ['CWM_PORTABLE_APP_ROOT', 'PORTABLE_EXECUTABLE_DIR', 'APPIMAGE'] as const;
const realPlatform = process.platform;
const realExecPath = process.execPath;

function runAs(platform: NodeJS.Platform, execPath: string, env: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}): void {
  Object.defineProperty(process, 'platform', { value: platform });
  Object.defineProperty(process, 'execPath', { value: execPath });
  for (const key of ENV_KEYS) {
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
}

describe('desktop data root', () => {
  const saved: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
  });

  beforeEach(() => {
    mockApp.isPackaged = true;
    mockApp.getPath.mockClear();
  });

  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform });
    Object.defineProperty(process, 'execPath', { value: realExecPath });
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('uses CWM_PORTABLE_APP_ROOT first, for any build', () => {
    runAs('win32', 'C:\\Program Files\\CUBRID Admin\\CUBRID Admin.exe', { CWM_PORTABLE_APP_ROOT: '/chosen', PORTABLE_EXECUTABLE_DIR: 'D:\\tools' });
    expect(getDesktopDataRoot()).toBe('/chosen');
  });

  it('uses the repository in dev mode', () => {
    mockApp.isPackaged = false;
    runAs('darwin', '/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
    expect(getDesktopDataRoot()).toBe(path.resolve(__dirname, '..', '..', '..', '..'));
    expect(mockApp.getPath).not.toHaveBeenCalled();
  });

  describe('Windows', () => {
    it('portable exe: the folder of the original exe, not the temp folder it runs from', () => {
      runAs('win32', 'C:\\Users\\me\\AppData\\Local\\Temp\\2abc\\CUBRID Admin.exe', { PORTABLE_EXECUTABLE_DIR: 'D:\\tools\\cubrid' });
      expect(getPortableFolder()).toBe('D:\\tools\\cubrid');
      expect(getDesktopDataRoot()).toBe('D:\\tools\\cubrid');
    });

    it('installed (NSIS): the user data folder, not the install folder', () => {
      runAs('win32', 'C:\\Users\\me\\AppData\\Local\\Programs\\CUBRID Admin\\CUBRID Admin.exe');
      expect(getPortableFolder()).toBeNull();
      expect(getDesktopDataRoot()).toBe('/user-data/userData');
    });
  });

  describe('Linux', () => {
    it('AppImage: the folder of the AppImage file', () => {
      runAs('linux', '/tmp/.mount_CUBRIDxyz/cubrid-admin-desktop', { APPIMAGE: '/home/me/apps/CUBRID-Admin.AppImage' });
      expect(getPortableFolder()).toBe('/home/me/apps');
      expect(getDesktopDataRoot()).toBe('/home/me/apps');
    });

    it('installed (rpm): the user data folder, not the install folder', () => {
      runAs('linux', '/opt/CUBRID Admin/cubrid-admin-desktop');
      expect(getPortableFolder()).toBeNull();
      expect(getDesktopDataRoot()).toBe('/user-data/userData');
    });
  });

  describe('macOS', () => {
    it.each([
      ['/Applications', '/Applications/CUBRID Admin.app'],
      ['a folder under /Applications', '/Applications/Tools/CUBRID Admin.app'],
      ['~/Applications', path.join(os.homedir(), 'Applications', 'CUBRID Admin.app')],
    ])('installed in %s: the user data folder', (_where, bundle) => {
      runAs('darwin', `${bundle}/Contents/MacOS/CUBRID Admin`);
      expect(getPortableFolder()).toBeNull();
      expect(getDesktopDataRoot()).toBe('/user-data/userData');
    });

    it.each([
      ['Downloads', path.join(os.homedir(), 'Downloads', 'CUBRID Admin.app')],
      ['a folder whose name only starts with Applications', '/ApplicationsOld/CUBRID Admin.app'],
    ])('portable in %s: the folder that contains the .app', (_where, bundle) => {
      runAs('darwin', `${bundle}/Contents/MacOS/CUBRID Admin`);
      expect(getPortableFolder()).toBe(path.dirname(bundle));
      expect(getDesktopDataRoot()).toBe(path.dirname(bundle));
      expect(mockApp.getPath).not.toHaveBeenCalled();
    });
  });
});
