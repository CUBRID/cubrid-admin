import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { closeTab } from './layoutSlice';
import { databaseLoginLost } from '../database/databaseCoreSlice';
import { dbKey } from '../database/dbKey';

// Tabs that show one database and keep sending its per-db requests while
// open (dashboard polls, statdump watcher, space/volume info, its logs).
const DB_TAB_PREFIXES = ['db:', 'db_space:', 'vol_category:', 'vol_info:', 'all_db_logs:'];

/** The (hostUid, dbname) a per-database tab belongs to, or null. */
export function dbTabScope(tabId) {
  if (!DB_TAB_PREFIXES.some((prefix) => tabId.startsWith(prefix))) return null;
  // A legacy `db:<dbname>` id carries no host, so it can't be checked.
  const [, hostUid, dbname] = tabId.split(':');
  return hostUid && dbname ? { hostUid, dbname } : null;
}

/**
 * Keeps per-database views in line with the database login, mounted once
 * with the main layout:
 *
 * - closes a database's tabs once it is not logged in (logout, an expired
 *   login cleared by MISSING_DB_CREDENTIALS, or start-info reporting it),
 *   so they stop sending requests the server would refuse;
 * - raises databaseLoginLost for each database that leaves
 *   loggedInDatabases, so cached per-db lists from the old login are dropped.
 *
 * A tab is only closed once start-info has been applied for its host since
 * the database state was last reset. Disconnecting one host resets the
 * database state of every host (see store.js), which empties every host's
 * logins until its next start-info restores them; closing on that would
 * close other hosts' tabs that are still logged in.
 */
export function useLoggedOutDbCleanup() {
  const dispatch = useDispatch();
  const openTabs = useSelector((state) => state.layout.openTabs);
  const loggedInDatabases = useSelector((state) => state.database.loggedInDatabases);
  const appliedLiveSeqByHost = useSelector((state) => state.database.appliedLiveSeqByHost);

  const appliedLiveSeqRef = useRef(appliedLiveSeqByHost);
  appliedLiveSeqRef.current = appliedLiveSeqByHost;
  const prevLoggedIn = useRef(loggedInDatabases);
  useEffect(() => {
    const prev = prevLoggedIn.current;
    prevLoggedIn.current = loggedInDatabases;
    prev.filter((key) => !loggedInDatabases.includes(key)).forEach((key) => {
      // A dbname never contains ':', so the last one separates the two.
      const sep = key.lastIndexOf(':');
      const hostUid = key.slice(0, sep);
      // Not for a host whose state was just reset (another host's
      // disconnect resets them all): its next start-info restores the
      // logins, and dropping its caches now would only make them read again.
      if (appliedLiveSeqRef.current[hostUid] === undefined) return;
      dispatch(databaseLoginLost({ hostUid, dbname: key.slice(sep + 1) }));
    });
  }, [dispatch, loggedInDatabases]);

  useEffect(() => {
    openTabs.forEach((tabId) => {
      const scope = dbTabScope(tabId);
      if (!scope || appliedLiveSeqByHost[scope.hostUid] === undefined) return;
      if (!loggedInDatabases.includes(dbKey(scope.hostUid, scope.dbname))) dispatch(closeTab(tabId));
    });
  }, [dispatch, openTabs, loggedInDatabases, appliedLiveSeqByHost]);
}
