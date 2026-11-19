import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Electron names userData after the packed productName (electron-builder.config.cjs).
const USER_DATA = '/Users/me/Library/Application Support/CUBRID Admin';
const mockApp = { isPackaged: true, getPath: jest.fn((name: string) => (name === 'userData' ? USER_DATA : `/other/${name}`)) };
jest.mock('electron', () => ({ app: mockApp }));
// ~/Applications for the 0.1.0 place test (a TS namespace import copies the module object, so no spyOn).
const realHomedir = jest.requireActual('os').homedir;
const mockHomedir = jest.fn(() => realHomedir());
jest.mock('os', () => ({ ...jest.requireActual('os'), homedir: () => mockHomedir() }));

import {
  getDesktopDataRoot,
  getLegacyDataRoot,
  getPortableFolder,
  isPathInsideInstallFolder,
  isWritableFolder,
} from './portable-root';

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

  describe('Windows and Linux portable', () => {
    let folder: string;

    beforeEach(() => {
      folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-portable-'));
    });

    afterEach(() => {
      fs.chmodSync(folder, 0o755);
      fs.rmSync(folder, { recursive: true, force: true });
    });

    it('Windows portable exe: the folder of the original exe, not the temp folder it runs from', () => {
      runAs('win32', 'C:\\Users\\me\\AppData\\Local\\Temp\\2abc\\CUBRID Admin.exe', { PORTABLE_EXECUTABLE_DIR: folder });
      expect(getPortableFolder()).toBe(folder);
      expect(getDesktopDataRoot()).toBe(folder);
    });

    it('Windows portable exe in a read-only folder: the user data folder', () => {
      fs.chmodSync(folder, 0o555);
      runAs('win32', 'C:\\Users\\me\\AppData\\Local\\Temp\\2abc\\CUBRID Admin.exe', { PORTABLE_EXECUTABLE_DIR: folder });
      expect(getPortableFolder()).toBeNull();
      expect(getDesktopDataRoot()).toBe(USER_DATA);
    });

    it('AppImage: the folder of the AppImage file', () => {
      runAs('linux', '/tmp/.mount_CUBRIDxyz/cubrid-admin-desktop', { APPIMAGE: path.join(folder, 'CUBRID-Admin.AppImage') });
      expect(getPortableFolder()).toBe(folder);
      expect(getDesktopDataRoot()).toBe(folder);
    });

    it('AppImage in a read-only folder: the user data folder', () => {
      fs.chmodSync(folder, 0o555);
      runAs('linux', '/tmp/.mount_CUBRIDxyz/cubrid-admin-desktop', { APPIMAGE: path.join(folder, 'CUBRID-Admin.AppImage') });
      expect(getPortableFolder()).toBeNull();
      expect(getDesktopDataRoot()).toBe(USER_DATA);
    });
  });

  describe('write probe', () => {
    let folder: string;

    beforeEach(() => {
      folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-probe-'));
    });

    afterEach(() => {
      fs.chmodSync(folder, 0o755);
      fs.rmSync(folder, { recursive: true, force: true });
    });

    it('creates a file to decide, and leaves nothing behind', () => {
      expect(isWritableFolder(folder)).toBe(true);
      expect(fs.readdirSync(folder)).toEqual([]);
    });

    it('is false for a folder where no file can be created', () => {
      fs.chmodSync(folder, 0o555);
      expect(isWritableFolder(folder)).toBe(false);
    });

    it('is false for a missing folder', () => {
      expect(isWritableFolder(path.join(folder, 'missing'))).toBe(false);
    });
  });

  describe('installed', () => {
    it('Windows (NSIS): the user data folder, not the install folder', () => {
      runAs('win32', 'C:\\Users\\me\\AppData\\Local\\Programs\\CUBRID Admin\\CUBRID Admin.exe');
      expect(getPortableFolder()).toBeNull();
      expect(getDesktopDataRoot()).toBe(USER_DATA);
    });

    it('Linux (rpm or deb): the user data folder, not the install folder', () => {
      runAs('linux', '/opt/CUBRID Admin/cubrid-admin-desktop');
      expect(getPortableFolder()).toBeNull();
      expect(getDesktopDataRoot()).toBe(USER_DATA);
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
      expect(getDesktopDataRoot()).toBe(USER_DATA);
    });

    describe('outside Applications', () => {
      let parent: string;

      beforeEach(() => {
        parent = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-portable-'));
      });

      afterEach(() => {
        fs.chmodSync(parent, 0o755);
        fs.rmSync(parent, { recursive: true, force: true });
      });

      it('portable in a writable folder: the folder that contains the .app', () => {
        const bundle = path.join(parent, 'CUBRID Admin.app');
        runAs('darwin', `${bundle}/Contents/MacOS/CUBRID Admin`);
        expect(getPortableFolder()).toBe(parent);
        expect(getDesktopDataRoot()).toBe(parent);
        expect(mockApp.getPath).not.toHaveBeenCalled();
      });

      it('a folder whose name only starts with Applications is not Applications', () => {
        const home = process.env.HOME;
        process.env.HOME = parent; // ~/Applications is then <parent>/Applications
        try {
          const folder = path.join(parent, 'ApplicationsOld');
          fs.mkdirSync(folder);
          runAs('darwin', `${folder}/CUBRID Admin.app/Contents/MacOS/CUBRID Admin`);
          expect(getPortableFolder()).toBe(folder);
        } finally {
          process.env.HOME = home;
        }
      });

      it('translocated by macOS (a downloaded .app run in place): the user data folder', () => {
        const translocated = path.join(parent, 'AppTranslocation', '5F3A9C2E', 'd');
        fs.mkdirSync(translocated, { recursive: true });
        runAs('darwin', `${translocated}/CUBRID Admin.app/Contents/MacOS/CUBRID Admin`);
        expect(getPortableFolder()).toBeNull();
        expect(getDesktopDataRoot()).toBe(USER_DATA);
      });

      it('in a read-only folder (e.g. the mounted dmg): the user data folder', () => {
        fs.chmodSync(parent, 0o555);
        runAs('darwin', `${parent}/CUBRID Admin.app/Contents/MacOS/CUBRID Admin`);
        expect(getPortableFolder()).toBeNull();
        expect(getDesktopDataRoot()).toBe(USER_DATA);
      });
    });
  });

  // Where 0.1.0 kept desktop-settings.json: beside the .app or the executable.
  describe('0.1.0 settings place', () => {
    let parent: string;

    beforeEach(() => {
      parent = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-legacy-root-'));
    });

    afterEach(() => {
      mockHomedir.mockImplementation(() => realHomedir());
      fs.chmodSync(parent, 0o755);
      fs.rmSync(parent, { recursive: true, force: true });
    });

    it('macOS in Applications: the Applications folder (0.2 uses the user data folder)', () => {
      mockHomedir.mockImplementation(() => parent); // ~/Applications is then <parent>/Applications
      const applications = path.join(parent, 'Applications');
      fs.mkdirSync(applications);
      runAs('darwin', `${applications}/CUBRID Admin.app/Contents/MacOS/CUBRID Admin`);
      expect(getDesktopDataRoot()).toBe(USER_DATA);
      expect(getLegacyDataRoot()).toBe(applications);
    });

    it('macOS in a downloads folder: none, 0.2 keeps its files there too', () => {
      runAs('darwin', `${parent}/CUBRID Admin.app/Contents/MacOS/CUBRID Admin`);
      expect(getLegacyDataRoot()).toBeNull();
    });

    it('macOS translocated: none (not the place the user put the app)', () => {
      const translocated = path.join(parent, 'AppTranslocation', '5F3A9C2E', 'd');
      fs.mkdirSync(translocated, { recursive: true });
      runAs('darwin', `${translocated}/CUBRID Admin.app/Contents/MacOS/CUBRID Admin`);
      expect(getLegacyDataRoot()).toBeNull();
    });

    it('macOS run from a read-only place (the mounted dmg): none', () => {
      fs.chmodSync(parent, 0o555);
      runAs('darwin', `${parent}/CUBRID Admin.app/Contents/MacOS/CUBRID Admin`);
      expect(getLegacyDataRoot()).toBeNull();
    });

    it('Windows installed (NSIS): the install folder', () => {
      runAs('win32', '/install/CUBRID Admin/CUBRID Admin.exe');
      expect(getLegacyDataRoot()).toBe('/install/CUBRID Admin');
    });

    it('Windows portable exe: none (it runs from a temp folder)', () => {
      runAs('win32', '/temp/2abc/CUBRID Admin.exe', { PORTABLE_EXECUTABLE_DIR: parent });
      expect(getLegacyDataRoot()).toBeNull();
    });

    it('AppImage: none (it runs from its mount folder)', () => {
      runAs('linux', '/tmp/.mount_CUBRIDxyz/cubrid-admin-desktop', { APPIMAGE: path.join(parent, 'CUBRID-Admin.AppImage') });
      expect(getLegacyDataRoot()).toBeNull();
    });

    it('Linux rpm or deb: the install folder', () => {
      runAs('linux', '/opt/cubrid-admin-desktop/cubrid-admin-desktop');
      expect(getLegacyDataRoot()).toBe('/opt/cubrid-admin-desktop');
    });

    it('none with CWM_PORTABLE_APP_ROOT or in dev mode', () => {
      runAs('win32', '/install/CUBRID Admin/CUBRID Admin.exe', { CWM_PORTABLE_APP_ROOT: '/chosen' });
      expect(getLegacyDataRoot()).toBeNull();
      mockApp.isPackaged = false;
      runAs('darwin', '/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
      expect(getLegacyDataRoot()).toBeNull();
    });
  });

  describe('Windows install folder', () => {
    it('installed (NSIS): the folder and everything under it', () => {
      runAs('win32', '/install/CUBRID Admin/CUBRID Admin.exe');
      expect(isPathInsideInstallFolder('/install/CUBRID Admin')).toBe(true);
      expect(isPathInsideInstallFolder('/install/CUBRID Admin/cwm-workspace')).toBe(true);
      expect(isPathInsideInstallFolder('/install/CUBRID Admin2/cwm-workspace')).toBe(false);
      expect(isPathInsideInstallFolder('/data/cwm-workspace')).toBe(false);
    });

    it('compares Windows paths without case, as Windows does', () => {
      runAs('win32', 'C:\\Users\\Me\\AppData\\Local\\Programs\\CUBRID Admin\\CUBRID Admin.exe');
      expect(isPathInsideInstallFolder('c:\\users\\me\\appdata\\local\\programs\\cubrid admin\\cwm-workspace')).toBe(true);
      expect(isPathInsideInstallFolder('C:\\USERS\\ME\\APPDATA\\LOCAL\\PROGRAMS\\CUBRID ADMIN')).toBe(true);
      expect(isPathInsideInstallFolder('C:\\Users\\Me\\AppData\\Local\\Programs\\CUBRID Admin2\\ws')).toBe(false);
      expect(isPathInsideInstallFolder('D:\\Users\\Me\\AppData\\Local\\Programs\\CUBRID Admin\\ws')).toBe(false);
    });

    it('none for a Windows portable exe, macOS, Linux and dev mode', () => {
      runAs('win32', '/temp/2abc/CUBRID Admin.exe', { PORTABLE_EXECUTABLE_DIR: '/tools' });
      expect(isPathInsideInstallFolder('/temp/2abc/cwm-workspace')).toBe(false);
      runAs('linux', '/opt/cubrid-admin-desktop/cubrid-admin-desktop');
      expect(isPathInsideInstallFolder('/opt/cubrid-admin-desktop/cwm-workspace')).toBe(false);
      runAs('darwin', '/Applications/CUBRID Admin.app/Contents/MacOS/CUBRID Admin');
      expect(isPathInsideInstallFolder('/Applications/cwm-workspace')).toBe(false);
      mockApp.isPackaged = false;
      runAs('win32', '/install/CUBRID Admin/CUBRID Admin.exe');
      expect(isPathInsideInstallFolder('/install/CUBRID Admin/cwm-workspace')).toBe(false);
    });
  });
});
