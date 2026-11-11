import * as os from 'os';
import * as path from 'path';
import { app } from 'electron';

function isPackagedRuntime(): boolean {
  if (app.isPackaged) {
    return true;
  }

  // electron-builder dir output: .../MyApp.app/Contents/MacOS/MyApp
  // Guard: dev mode uses npx/npm electron whose execPath is inside node_modules — not packaged.
  if (process.execPath.includes('node_modules')) {
    return false;
  }

  return process.platform === 'darwin' && process.execPath.includes('.app/Contents/MacOS/');
}

/** Directory that contains the running binary (MacOS/, the install folder, etc.). */
export function getExecutableDir(): string {
  if (!isPackagedRuntime()) {
    return getRepoRoot();
  }

  return path.dirname(process.execPath);
}

function isInApplicationsFolder(bundlePath: string): boolean {
  return [path.join(path.sep, 'Applications'), path.join(os.homedir(), 'Applications')].some((folder) =>
    bundlePath.startsWith(`${folder}${path.sep}`)
  );
}

/**
 * The folder a portable build keeps its files in, or `null` for an installed build:
 * - Windows portable exe: the folder of the original exe (it runs from a temp folder);
 * - Linux AppImage: the folder of the AppImage file;
 * - macOS: the folder that contains the .app, unless the .app is under
 *   /Applications or ~/Applications (installed).
 * The Windows installer (NSIS) and the Linux rpm are installed.
 */
export function getPortableFolder(): string | null {
  if (process.platform === 'win32') {
    return process.env.PORTABLE_EXECUTABLE_DIR?.trim() || null;
  }

  if (process.platform === 'linux') {
    const appImage = process.env.APPIMAGE?.trim();
    return appImage ? path.dirname(appImage) : null;
  }

  if (process.platform === 'darwin') {
    const bundlePath = getAppBundlePath();
    return bundlePath && !isInApplicationsFolder(bundlePath) ? path.dirname(bundlePath) : null;
  }

  return null;
}

/**
 * Where `desktop-settings.json` and the default `cwm-workspace/` live:
 * CWM_PORTABLE_APP_ROOT if set; the repository in dev mode; beside a portable
 * build (getPortableFolder); for an installed build, the user's app data folder
 * (app.getPath('userData')), never the install folder.
 */
export function getDesktopDataRoot(): string {
  const override = process.env.CWM_PORTABLE_APP_ROOT?.trim();
  if (override) {
    return override;
  }

  if (!isPackagedRuntime()) {
    return getRepoRoot();
  }

  return getPortableFolder() ?? app.getPath('userData');
}

/** macOS `.app` bundle path when running a packaged build; otherwise `null`. */
export function getAppBundlePath(): string | null {
  if (!isPackagedRuntime() || process.platform !== 'darwin') {
    return null;
  }

  return path.resolve(getExecutableDir(), '..', '..');
}

export function isPathInsideAppBundle(resolvedPath: string): boolean {
  const bundlePath = getAppBundlePath();
  if (!bundlePath) {
    return false;
  }

  return (
    resolvedPath === bundlePath || resolvedPath.startsWith(`${bundlePath}${path.sep}`)
  );
}

export function getRepoRoot(): string {
  return path.resolve(__dirname, '..', '..', '..', '..');
}

export function isPortableRuntime(): boolean {
  return isPackagedRuntime();
}
