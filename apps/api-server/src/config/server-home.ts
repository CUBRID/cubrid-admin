import * as path from 'path';
import { isStandaloneExecutable } from '../util/standalone-executable';

/**
 * The folder the server keeps its files in (conf/, cwm-vault/, the storage
 * folder, ssl/, logs/, .env):
 *   - CWM_HOME, when set (the Linux and Windows installers set it to their data folder);
 *   - otherwise beside the executable, for the single executable server (the portable form);
 *   - otherwise `devDefault` (running from source).
 * CWM_CONF_PATH, STORAGE_PATH, CWM_SSL_DIR and LOG_DIR still override single paths.
 */
export function serverHome(devDefault: string): string {
  const home = process.env.CWM_HOME?.trim();
  if (home) {
    return path.resolve(home);
  }
  return isStandaloneExecutable() ? path.dirname(process.execPath) : devDefault;
}

/** Where the rpm, the deb and install.sh put the executable; its service sets CWM_HOME. */
export const INSTALLED_PROGRAM_DIR = '/opt/cubrid-admin';

/**
 * The installed executable run by hand (without the service's CWM_HOME) would
 * create a second set of settings and data in /opt/cubrid-admin: refuse instead.
 */
export function refuseInstalledCopyWithoutHome(): void {
  if (process.env.CWM_HOME?.trim() || !isStandaloneExecutable()) {
    return;
  }
  if (path.dirname(process.execPath) === INSTALLED_PROGRAM_DIR) {
    throw new Error(
      'This is the installed CUBRID Admin Server: start it with "systemctl start cubrid-admin" ' +
        '(settings in /etc/cubrid-admin/cwm.conf), or set CWM_HOME to run it by hand.'
    );
  }
}
