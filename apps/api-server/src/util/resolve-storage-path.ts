import * as path from 'path';
import { isStandaloneExecutable } from './standalone-executable';

/**
 * Determines the appropriate storage path based on the execution environment.
 * If running as the single executable, it uses the executable's directory.
 * Otherwise (development mode), it uses the project's root directory.
 *
 * @returns The absolute path to the storage directory.
 * @category Utilities
 * @since 1.0.0
 */
export function getStoragePath() {
  const isStandalone = isStandaloneExecutable();
  // Packaged executables are meant to be launchable from any working
  // directory (e.g. `nohup ./cwm-linux &` from $HOME) — resolving a relative
  // STORAGE_PATH against process.cwd() would then silently pick a different
  // directory every time depending on where it was started from, making
  // previously-stored users/hosts disappear. Anchor relative paths to the
  // executable's own directory instead, matching the no-override default
  // below; only a genuinely absolute STORAGE_PATH is taken as-is.
  const baseDir = isStandalone ? path.dirname(process.execPath) : path.resolve(__dirname, '..', '..');

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
