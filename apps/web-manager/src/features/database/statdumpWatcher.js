import { databaseApi } from './databaseApi';
import { dbKey } from './dbKey';

// The engine only accumulates statdump counters while at least one watcher
// is attached (perfmon_is_perf_tracking: n_watchers > 0), and CMS `statdump`
// is a one-shot that attaches and detaches immediately. So while a DB
// dashboard is open we keep a CMS-managed `cubrid statdump -i` watcher
// (start_statdump) running for that database.

// start_statdump is idempotent ("already running"), so it is re-issued on
// this period: that restores the watcher after CMS restarted (its watcher
// table is in memory) or after another client stopped it.
export const WATCHER_REFRESH_MS = 60 * 1000;

// CMS keeps a dead watcher's slot marked running (e.g. the child exited when
// the database restarted), and then answers every start with "already
// running". If the counters stop moving for this long, stop+start it — at
// most once per cooldown, since an idle database can also be frozen.
export const FROZEN_RESTART_MS = 3 * 60 * 1000;
export const RESTART_COOLDOWN_MS = 5 * 60 * 1000;

// The last release stops the watcher after this grace period, so closing and
// reopening a dashboard (or React StrictMode's effect replay) doesn't race a
// stop against the next start.
export const STOP_GRACE_MS = 2000;

const watchers = new Map(); // dbKey -> { count, timer, stopTimer, lastRestartAt }

const warn = (action, hostUid, dbname) => (err) => {
  console.warn(`[statdump watcher] ${action} failed for ${dbname} on ${hostUid}:`, err?.message || err);
};

const start = (api, hostUid, dbname) =>
  api.startStatDumpWatcher(hostUid, dbname).catch(warn('start', hostUid, dbname));

/**
 * Hold a watcher for host+db; ref-counted across dashboards in this app.
 * Returns the release function. The last release stops the watcher.
 *
 * Stopping is shared state on the CMS (one watcher per database for every
 * client), so another NCA still showing this database loses it until its
 * own next periodic start (≤ WATCHER_REFRESH_MS). That brief gap is
 * preferred over leaving a statdump process and server-side perf tracking
 * running indefinitely after everyone has left.
 */
export function acquireStatdumpWatcher(hostUid, dbname, api = databaseApi) {
  const key = dbKey(hostUid, dbname);
  let entry = watchers.get(key);
  if (entry) {
    entry.count += 1;
    clearTimeout(entry.stopTimer);
    entry.stopTimer = null;
  } else {
    entry = { count: 1, lastRestartAt: 0, timer: null, stopTimer: null };
    watchers.set(key, entry);
    start(api, hostUid, dbname);
    entry.timer = setInterval(() => start(api, hostUid, dbname), WATCHER_REFRESH_MS);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = watchers.get(key);
    if (!current) return;
    current.count -= 1;
    if (current.count > 0) return;
    current.stopTimer = setTimeout(() => {
      if (watchers.get(key) !== current || current.count > 0) return;
      clearInterval(current.timer);
      watchers.delete(key);
      api.stopStatDumpWatcher(hostUid, dbname).catch(warn('stop', hostUid, dbname));
    }, STOP_GRACE_MS);
  };
}

/**
 * Restart a held watcher whose counters have not moved for FROZEN_RESTART_MS
 * (see above). `unchangedSince` comes from the dashboard's statdump sample.
 * @returns {boolean} whether a restart was issued
 */
export function restartFrozenStatdumpWatcher(hostUid, dbname, unchangedSince, now = Date.now(), api = databaseApi) {
  const entry = watchers.get(dbKey(hostUid, dbname));
  if (!entry || entry.count === 0 || !unchangedSince) return false;
  if (now - unchangedSince < FROZEN_RESTART_MS) return false;
  if (now - entry.lastRestartAt < RESTART_COOLDOWN_MS) return false;
  entry.lastRestartAt = now;
  api.stopStatDumpWatcher(hostUid, dbname)
    .catch(() => undefined)
    .then(() => start(api, hostUid, dbname));
  return true;
}
