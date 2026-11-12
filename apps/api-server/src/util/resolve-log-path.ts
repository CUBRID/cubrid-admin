import * as path from 'path';
import { serverHome } from '../config/server-home';

/**
 * Determines the appropriate log directory based on the execution environment.
 * LOG_DIR when set; otherwise logs/ in CWM_HOME (installers), beside the single
 * executable, or in the project's root directory (development mode).
 * Mirrors `resolve-storage-path.ts`'s executable/dev fallback logic.
 *
 * @returns The absolute path to the log directory.
 * @category Utilities
 * @since 1.0.0
 */
export function getLogPath(): string {
  const configuredPath = process.env.LOG_DIR?.trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  // CWM_HOME (installers), beside the executable (portable) or the project (source).
  return path.join(serverHome(path.resolve(__dirname, '..', '..')), 'logs');
}
