import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { acquireStatdumpWatcher, restartFrozenStatdumpWatcher } from './statdumpWatcher';
import { dbKey } from './dbKey';

/**
 * Keeps a statdump watcher attached to host+db while the calling dashboard
 * is mounted (DB dashboard tabs stay mounted while hidden, so this spans the
 * tab's lifetime), and restarts it when the performance counters stopped
 * moving. See statdumpWatcher.js.
 *
 * Only while the database is logged in: the watcher is a per-db request the
 * server refuses without a DB login, so a logout (or an expired login)
 * releases it.
 *
 * @param {object|undefined} perfSample the dashboard entry's statdump sample
 */
export function useStatdumpWatcher(hostUid, dbname, perfSample) {
  const isAuthorized = useSelector((state) => Boolean(hostUid) && state.host.authorizedHosts.includes(hostUid));
  const isLoggedIn = useSelector((state) => Boolean(hostUid && dbname) && state.database.loggedInDatabases.includes(dbKey(hostUid, dbname)));
  const canWatch = isAuthorized && isLoggedIn;

  useEffect(() => {
    if (!canWatch) return undefined;
    return acquireStatdumpWatcher(hostUid, dbname);
  }, [canWatch, hostUid, dbname]);

  const sampleTime = perfSample?.time;
  const unchangedSince = perfSample?.unchangedSince;
  useEffect(() => {
    if (!canWatch || !sampleTime) return;
    restartFrozenStatdumpWatcher(hostUid, dbname, unchangedSince, sampleTime);
  }, [canWatch, hostUid, dbname, sampleTime, unchangedSince]);
}
