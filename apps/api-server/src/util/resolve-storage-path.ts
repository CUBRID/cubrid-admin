import * as path from 'path';
import { serverHome } from '../config/server-home';

/**
 * Determines the appropriate storage path based on the execution environment.
 * CWM_HOME when set (installers); the single executable uses its own directory;
 * otherwise (development mode) the project's root directory.
 *
 * @returns The absolute path to the storage directory.
 * @category Utilities
 * @since 1.0.0
 */
export function getStoragePath() {
  // Packaged executables are meant to be launchable from any working
  // directory (e.g. `nohup ./cwm-linux &` from $HOME) — resolving a relative
  // STORAGE_PATH against process.cwd() would then silently pick a different
  // directory every time depending on where it was started from, making
  // previously-stored users/hosts disappear. Anchor relative paths to the
  // executable's own directory (CWM_HOME for the installers), matching the no-override
  // default below; only a genuinely absolute STORAGE_PATH is taken as-is.
  const baseDir = serverHome(path.resolve(__dirname, '..', '..'));

  const configuredPath = process.env.STORAGE_PATH?.trim();
  if (configuredPath) {
    return path.isAbsolute(configuredPath) ? configuredPath : path.resolve(baseDir, configuredPath);
  }

  return path.join(baseDir, 'storage');
}

/**
 * Resolves the absolute path for a user-specific file within the storage directory.
 *
 * @param filename - The name of the user's file.
 * @returns The absolute path to the user's file.
 * @category Utilities
 * @since 1.0.0
 */
export function resolveUserFilePath(filename: string) {
  const storageDir = getStoragePath();
  return path.join(storageDir, filename);
}
