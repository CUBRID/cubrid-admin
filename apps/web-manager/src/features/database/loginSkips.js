import { autoStartDatabases, parseConfText } from '@api-interfaces';
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

// ha_mode values the engine reads as off; absent means off too.
const HA_MODE_OFF = new Set(['', 'off', 'no', 'n', 'false', '0']);

/**
 * Whether cubrid.conf makes the host an HA node for a service action:
 * `[common]` `ha_mode` is not off (on, replica). The api-server decides the
 * same way (getServiceHaDbNames); the engine refuses `cubrid heartbeat` with
 * ha_mode off.
 */
export function haModeOn(confLines) {
  const common = parseConfText(confLines || []).sections.find((section) => section.name === 'common');
  const value = [...(common?.entries || [])].reverse().find((entry) => entry.key.toLowerCase() === 'ha_mode')?.value;
  return !HA_MODE_OFF.has((value || '').trim().toLowerCase());
}

/**
 * start-info databases as a service action sees them: an `ha_db_list`
 * database is HA only on an HA node; elsewhere it is a plain database
 * (login-checked, started by the autostart list).
 */
export function serviceDatabases(databases, haNode) {
  if (haNode) return databases || [];
  return (databases || []).map((db) => (db.isHa ? { ...db, isHa: false } : db));
}

/**
 * The non-HA databases a service start brings up: the stopped ones in the
 * autostart list. HA databases go up with one node-wide ha_start, whatever
 * the logins, so a service action never skips them.
 */
export function serviceStartTargets(databases, autoStart) {
  return (databases || []).filter((db) => !db.isHa && !db.running && autoStart.has(db.dbname)).map((db) => db.dbname);
}

/** The running non-HA databases a service stop takes down one by one. */
export function serviceStopTargets(databases) {
  return (databases || []).filter((db) => !db.isHa && db.running).map((db) => db.dbname);
}

/**
 * The databases a service restart skips for no login, by step: running ones
 * are not stopped and keep running; stopped ones the start would bring up
 * stay stopped. HA databases are never skipped (see serviceStartTargets).
 */
export function restartLoginSkips(databases, autoStart) {
  const names = (skips) => [...skips.loggedOut, ...skips.notLoggedIn];
  const running = serviceStopTargets(databases);
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

export const runningDbNames = (databases) => databases.filter((db) => db.running).map((db) => db.dbname);
export const stoppedDbNames = (databases) => databases.filter((db) => !db.running).map((db) => db.dbname);

/**
 * Plans a bulk or service action from a fresh start-info read, made as its
 * confirm opens. The targets come from that read, so the action runs on what
 * the host has now, never on lists rendered earlier (they can be empty by
 * then, after a failed poll or a host reset). Resolves `{ outcome }` of
 * 'readFailed', 'noTargets' or 'allSkipped' (with blockWhenAllSkipped, every
 * target would be skipped for no login) when there is nothing to confirm,
 * else `{ outcome: 'confirm', targets, skips }`.
 */
export const planLoginCheckedAction = (hostUid, pickTargets, { blockWhenAllSkipped = true } = {}) => async (dispatch) => {
  const databases = await dispatch(readStartInfoDatabases(hostUid));
  if (!databases) return { outcome: 'readFailed' };
  const targets = pickTargets(databases);
  if (targets.length === 0) return { outcome: 'noTargets' };
  const skips = loginSkipsOf(databases, targets);
  if (blockWhenAllSkipped && skips.count === targets.length) return { outcome: 'allSkipped' };
  return { outcome: 'confirm', targets, skips };
};

/**
 * The cubrid.conf `[service]` autostart list (the last `server=`), empty when
 * `service=` leaves out server, read as the engine reads it (autoStartDatabases).
 */
export function autoStartServers(confLines) {
  return autoStartDatabases(confLines || []);
}
