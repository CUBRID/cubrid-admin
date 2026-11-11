import * as fs from 'fs';
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
 * Whether a file can really be created in `folder`: creates and deletes a probe
 * file. fs.access(W_OK) is not enough, because on Windows it ignores ACLs and
 * the read-only attribute of folders (Program Files, a read-only share).
 */
export function isWritableFolder(folder: string): boolean {
  const probe = path.join(folder, `.cubrid-admin-write-test-${process.pid}-${Date.now()}`);
  try {
    fs.closeSync(fs.openSync(probe, 'wx'));
  } catch {
    return false;
  }
  try {
    fs.unlinkSync(probe);
  } catch {
    // Created but not removable: the folder is still writable.
  }
  return true;
}

/**
 * A downloaded .app that macOS runs from a random read-only copy (App
 * Translocation), or one started from a read-only place such as a mounted dmg:
 * nothing can be kept beside it.
 */
function cannotKeepFilesBeside(bundlePath: string): boolean {
  return bundlePath.includes(`${path.sep}AppTranslocation${path.sep}`) || !isWritableFolder(path.dirname(bundlePath));
}

/**
 * The folder a portable build keeps its files in, or `null` for an installed build:
 * - Windows portable exe: the folder of the original exe (it runs from a temp folder);
 * - Linux AppImage: the folder of the AppImage file;
 *   (either only when that folder is writable)
 * - macOS: the folder that contains the .app, unless the .app is under
 *   /Applications or ~/Applications (installed), or runs translocated or read-only.
 * The Windows installer (NSIS) and the Linux rpm are installed.
 */
export function getPortableFolder(): string | null {
  // A Windows portable exe or an AppImage in a folder it cannot write to
  // (read-only share, a CD, Program Files) keeps its files in userData instead.
  if (process.platform === 'win32') {
    const folder = process.env.PORTABLE_EXECUTABLE_DIR?.trim();
    return folder && isWritableFolder(folder) ? folder : null;
  }

  if (process.platform === 'linux') {
    const appImage = process.env.APPIMAGE?.trim();
    return appImage && isWritableFolder(path.dirname(appImage)) ? path.dirname(appImage) : null;
  }

  if (process.platform === 'darwin') {
    const bundlePath = getAppBundlePath();
    if (!bundlePath || isInApplicationsFolder(bundlePath) || cannotKeepFilesBeside(bundlePath)) {
      return null;
    }
    return path.dirname(bundlePath);
  }

  return null;
}

/**
 * Where `desktop-settings.json` and the default `cwm-workspace/` live:
 * CWM_PORTABLE_APP_ROOT if set; the repository in dev mode; beside a portable
 * build (getPortableFolder); otherwise (installed, or a macOS .app that cannot
 * keep files beside it) the user's app data folder (app.getPath('userData'),
 * named after the product: .../CUBRID Admin), never the install folder.
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
