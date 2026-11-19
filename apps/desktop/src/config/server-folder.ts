import * as fs from 'fs';
import * as path from 'path';

// The server executable as the server packages name it (zip, tar.gz,
// installers), and the Windows service wrapper the server setup installs beside it.
const SERVER_EXECUTABLES = new Set([
  'cubrid-admin.exe',
  'cubrid-admin-service.exe',
  'cubrid-admin',
  'cubrid-admin-linux',
  'cubrid-admin-linux-arm64',
  'cubrid-admin-linux-el7',
  'cubrid-admin-macos',
  'cubrid-admin-macos-arm64',
]);

const isFile = (p: string) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};
const isDirectory = (p: string) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/**
 * Whether `root` is a CUBRID Admin Server folder: an unpacked server package, or
 * the data folder of an installed server (CWM_HOME) once it has started. A
 * workspace there would share the server's conf/cwm.conf, ssl/ and logs/. Told
 * by what only the server makes or ships (load-runtime-env.ts,
 * scripts/assemble-package.mjs):
 * - cwm-vault/ (the server's keys; the desktop app keeps its own in data/);
 * - a server executable (a file, named as the packages name it) together with
 *   the package's cwm.conf.sample (in conf/, or beside it in the install folder).
 * A desktop workspace (data/secrets.json) is never one, whatever else it holds;
 * nor is a folder that only holds a server executable (Downloads) or a folder
 * named cubrid-admin (a clone of the repository).
 */
export function isServerFolder(root: string): boolean {
  if (isFile(path.join(root, 'data', 'secrets.json'))) {
    return false;
  }
  if (isDirectory(path.join(root, 'cwm-vault'))) {
    return true;
  }
  const hasSample = isFile(path.join(root, 'conf', 'cwm.conf.sample')) || isFile(path.join(root, 'cwm.conf.sample'));
  if (!hasSample) {
    return false;
  }
  let names: string[];
  try {
    names = fs.readdirSync(root);
  } catch {
    return false;
  }
  return names.some((name) => SERVER_EXECUTABLES.has(name.toLowerCase()) && isFile(path.join(root, name)));
}
