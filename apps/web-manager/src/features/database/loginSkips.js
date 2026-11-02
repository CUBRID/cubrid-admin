import { parseConfText } from '@api-interfaces';
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

/** What a service start brings up: the autostart list and the HA databases, those not running. */
export function serviceStartTargets(databases, autoStart) {
  return (databases || []).filter((db) => !db.running && (db.isHa || autoStart.has(db.dbname))).map((db) => db.dbname);
}

/**
 * The databases a service restart skips for no login, by step: running ones
 * are not stopped and keep running; stopped ones the start would bring up
 * stay stopped.
 */
export function restartLoginSkips(databases, autoStart) {
  const names = (skips) => [...skips.loggedOut, ...skips.notLoggedIn];
  const running = (databases || []).filter((db) => db.running).map((db) => db.dbname);
  return {
    keepsRunning: names(loginSkipsOf(databases, running)),
    notStarted: names(loginSkipsOf(databases, serviceStartTargets(databases, autoStart))),
  };
}

/** Reads the host's start-info afresh; resolves null when it can't (the server still skips). */
export const readStartInfoDatabases = (hostUid) => async (dispatch) => {
  try {
    return startInfoDatabases(await dispatch(fetchDatabaseStartInfo(hostUid)).unwrap());
  } catch {
    return null;
  }
};

/**
 * The cubrid.conf `[service]` autostart list (the last `server=`), empty when
 * `service=` leaves out server. Read with the engine's own parsing rules
 * (key case, trailing comments, continued lines); the list splits on spaces,
 * commas and colons as util_service.c does.
 */
export function autoStartServers(confLines) {
  const service = parseConfText(confLines || []).sections.find((section) => section.name === 'service');
  const last = (key) => [...(service?.entries || [])].reverse().find((entry) => entry.key.toLowerCase() === key)?.value;
  const list = (value) => (value || '').replace(/^["']|["']$/g, '').split(/[\s,:]+/).filter(Boolean);
  if (!list(last('service')).map((s) => s.toLowerCase()).includes('server')) return [];
  return list(last('server'));
}
