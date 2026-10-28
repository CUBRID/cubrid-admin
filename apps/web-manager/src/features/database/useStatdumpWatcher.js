import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { acquireStatdumpWatcher, restartFrozenStatdumpWatcher } from './statdumpWatcher';

/**
 * Keeps a statdump watcher attached to host+db while the calling dashboard
 * is mounted (DB dashboard tabs stay mounted while hidden, so this spans the
 * tab's lifetime), and restarts it when the performance counters stopped
 * moving. See statdumpWatcher.js.
 *
 * @param {object|undefined} perfSample the dashboard entry's statdump sample
 */
export function useStatdumpWatcher(hostUid, dbname, perfSample) {
  const isAuthorized = useSelector((state) => Boolean(hostUid) && state.host.authorizedHosts.includes(hostUid));

  useEffect(() => {
    if (!isAuthorized || !dbname) return undefined;
    return acquireStatdumpWatcher(hostUid, dbname);
  }, [isAuthorized, hostUid, dbname]);

  const sampleTime = perfSample?.time;
  const unchangedSince = perfSample?.unchangedSince;
  useEffect(() => {
    if (!isAuthorized || !dbname || !sampleTime) return;
    restartFrozenStatdumpWatcher(hostUid, dbname, unchangedSince, sampleTime);
  }, [isAuthorized, hostUid, dbname, sampleTime, unchangedSince]);
}
