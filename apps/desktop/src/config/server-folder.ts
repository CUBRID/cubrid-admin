import * as fs from 'fs';
import * as path from 'path';

// The server executable of the server packages (zip, tar.gz, installers), and
// the Windows service wrapper the server setup installs beside it.
const SERVER_EXECUTABLES = /^cubrid-admin(\.exe|-service\.exe|-linux.*|-macos.*)?$/i;

const exists = (p: string) => fs.existsSync(p);

/**
 * Whether `root` is a CUBRID Admin Server folder (an unpacked server package, or
 * the data folder of an installed server, CWM_HOME). A workspace there would
 * share the server's conf/cwm.conf, ssl/ and logs/. Told by what only the
 * server makes or ships (load-runtime-env.ts, scripts/assemble-package.mjs):
 * - cwm-vault/ (the server's keys; the desktop app keeps its own in data/);
 * - the server executable beside it;
 * - conf/cwm.conf.sample or conf/cwm.conf.reference.md (in the server packages);
 * - conf/cwm.conf without data/ (an installed server's data folder before its
 *   first start; a desktop workspace has data/).
 * An empty folder and a desktop workspace are not.
 */
export function isServerFolder(root: string): boolean {
  if (exists(path.join(root, 'cwm-vault'))) {
    return true;
  }
  let names: string[];
  try {
    names = fs.readdirSync(root);
  } catch {
    return false;
  }
  if (names.some((name) => SERVER_EXECUTABLES.test(name))) {
    return true;
  }
  const conf = path.join(root, 'conf');
  if (exists(path.join(conf, 'cwm.conf.sample')) || exists(path.join(conf, 'cwm.conf.reference.md'))) {
    return true;
  }
  return exists(path.join(conf, 'cwm.conf')) && !exists(path.join(root, 'data'));
}
