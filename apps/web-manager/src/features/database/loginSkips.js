import { fetchDatabaseStartInfo } from './databaseCoreSlice';

// Bulk and service actions skip the databases the user isn't logged in to
// (the server checks again and sends them nothing). These helpers let a
// confirm dialog name them first, from a start-info read when it opens.

/** Every database start-info knows of — dblist and active-only — with its run, HA and login state. */
export function startInfoDatabases(info) {
  const active = info?.activelist?.active || [];
  const running = new Set(active.map((a) => a?.dbname));
  const ha = new Set(info?.haDbNames || []);
  const seen = new Set();
  const out = [];
  for (const entry of [...(info?.dblist?.dbs || []), ...active]) {
    if (!entry?.dbname || seen.has(entry.dbname)) continue;
    seen.add(entry.dbname);
    out.push({
      dbname: entry.dbname,
      running: running.has(entry.dbname),
      isHa: ha.has(entry.dbname),
      loggedIn: entry.isLoggedIn === true,
      loggedOut: entry.isLoggedOut === true,
    });
  }
  return out;
}

/** The `targets` (names) an action will skip for no login, split by why. */
export function loginSkipsOf(databases, targets) {
  const byName = new Map((databases || []).map((db) => [db.dbname, db]));
  const loggedOut = [];
  const notLoggedIn = [];
  for (const dbname of targets) {
    const db = byName.get(dbname);
    if (!db || db.loggedIn) continue;
    (db.loggedOut ? loggedOut : notLoggedIn).push(dbname);
  }
  return { loggedOut, notLoggedIn, count: loggedOut.length + notLoggedIn.length };
}

/** Reads the host's start-info afresh; resolves null when it can't (the server still skips). */
export const readStartInfoDatabases = (hostUid) => async (dispatch) => {
  try {
    return startInfoDatabases(await dispatch(fetchDatabaseStartInfo(hostUid)).unwrap());
  } catch {
    return null;
  }
};

/** The cubrid.conf `[service]` autostart list (`server=`), empty when `service=` leaves out server. */
export function autoStartServers(confLines) {
  let serviceEnabled = false;
  let servers = [];
  let inService = false;
  for (const raw of confLines || []) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[')) {
      inService = /^\[\s*service\s*\]/i.test(line);
      continue;
    }
    if (!inService) continue;
    const [key, ...rest] = line.split('=');
    const value = rest.join('=').trim().replace(/^["']|["']$/g, '');
    if (key.trim() === 'service') serviceEnabled = value.split(',').map((s) => s.trim().toLowerCase()).includes('server');
    if (key.trim() === 'server') servers = value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return serviceEnabled ? servers : [];
}
