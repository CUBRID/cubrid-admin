import * as path from 'path';

/**
 * The folder the server keeps its files in (conf/, cwm-vault/, the storage
 * folder, ssl/, logs/, .env):
 *   - CWM_HOME, when set (the Linux and Windows installers set it to their data folder);
 *   - otherwise beside the executable, for the packaged server (the portable form);
 *   - otherwise `devDefault` (running from source).
 * CWM_CONF_PATH, STORAGE_PATH, CWM_SSL_DIR and LOG_DIR still override single paths.
 */
export function serverHome(devDefault: string): string {
  const home = process.env.CWM_HOME?.trim();
  if (home) {
    return path.resolve(home);
  }
  return (process as any).pkg ? path.dirname(process.execPath) : devDefault;
}
