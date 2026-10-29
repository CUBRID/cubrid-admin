import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { fetchDatabaseStartInfo, fetchDatabaseVolumes } from '../../database/databaseSlice';
import { fetchBrokerList } from '../../broker/brokerSlice';
import { dbKey } from '../../database/dbKey';

// Stable fallback reference — `activeDatabasesByHost[selectedHostUid] || []`
// would otherwise be a brand-new array every render for as long as this host
// has no cached entry yet (e.g. just-selected, before its first fetch
// resolves), and so would the useMemo below.
const EMPTY_LIST = [];

export default function MonitoringProvider({ children }) {
  const dispatch = useDispatch();
  const { preferences } = useSelector((state) => state.user, shallowEqual);
  const { selectedHostUid, authorizedHosts, reconnectQueue = EMPTY_LIST } = useSelector((state) => state.host, shallowEqual);
  const { activeDatabasesByHost, loggedInDatabases } = useSelector((state) => state.database, shallowEqual);
  // activeDatabasesByHost is keyed by hostUid — this provider only ever
  // polls the currently selected host, so read straight out of its slot
  // rather than a flat shared array a different, still in-flight host's
  // response could clobber.
  const activeDatabases = activeDatabasesByHost[selectedHostUid] || EMPTY_LIST;
  const { activeMainTab } = useSelector((state) => state.layout, shallowEqual);
  // A database stays active (running) after logout — logout only drops the
  // session — so polling volumes for every active db keeps re-fetching (and
  // the storage volume table kept showing) one the user already logged out of.
  const loggedInActiveDatabases = useMemo(
    () => activeDatabases.filter((db) => loggedInDatabases.includes(dbKey(selectedHostUid, db))),
    [activeDatabases, loggedInDatabases, selectedHostUid]
  );
  
  // Read by the timer instead of restarting it: a failed poll replaces the
  // database lists, and a restart polls again at once, so an unreachable host
  // was polled back to back with no interval.
  const loggedInActiveRef = useRef(loggedInActiveDatabases);
  loggedInActiveRef.current = loggedInActiveDatabases;
  const isAuthorized = Boolean(selectedHostUid && authorizedHosts.includes(selectedHostUid));

  // One poll of each kind per host at a time. A host's CMS requests run one
  // after another, so while a slow one holds it (e.g. lockdb on a database
  // with many locks) a tick every interval would pile up requests that then
  // all run back to back once it frees up.
  const inFlightRef = useRef(new Set());
  const pollOnce = useCallback((key, request) => {
    if (inFlightRef.current.has(key)) return;
    inFlightRef.current.add(key);
    Promise.resolve(dispatch(request)).finally(() => inFlightRef.current.delete(key));
  }, [dispatch]);

  const dashboardTimer = useRef(null);
  const brokerTimer = useRef(null);
  const lastActivityRef = useRef(Date.now());

  // Activity listeners to reset idle timer
  useEffect(() => {
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    activityEvents.forEach(event => document.addEventListener(event, handleActivity, { passive: true }));
    return () => activityEvents.forEach(event => document.removeEventListener(event, handleActivity));
  }, []);

  const MAX_IDLE_TIME = 10 * 60 * 1000; // 10 minutes
  // A host in reconnectQueue is waiting on ReconnectHostModal to resolve a
  // CMS session takeover; authorizedHosts still lists it (preserved so the
  // reconnect is seamless, see apiClient.js), so that check alone doesn't
  // pause polling here. Keep this host paused until the queue clears
  // instead of hammering it with requests it's already known to 401 on.
  // Derived as a boolean so the effects below only restart when THIS host
  // enters/leaves the queue — depending on the whole array would restart
  // both timers (and their immediate refresh()) whenever any other host did.
  const isPendingReconnect = Boolean(selectedHostUid && reconnectQueue.includes(selectedHostUid));
  const isMonitoringTab = activeMainTab?.startsWith('host:') || activeMainTab?.startsWith('db:');

  // Dashboard Interval Refresh (Databases & Volumes)
  useEffect(() => {
    if (dashboardTimer.current) {
      clearInterval(dashboardTimer.current);
      dashboardTimer.current = null;
    }

    const hostUid = selectedHostUid;
    const interval = preferences.dashboardInterval;

    if (isMonitoringTab && interval > 0 && isAuthorized && !isPendingReconnect) {
      const refresh = () => {
        if (Date.now() - lastActivityRef.current < MAX_IDLE_TIME) {
          pollOnce(`start-info:${hostUid}`, fetchDatabaseStartInfo({ hostUid, isBackground: true }));
          const loggedInActive = loggedInActiveRef.current;
          if (loggedInActive.length > 0) {
            pollOnce(`volumes:${hostUid}`, fetchDatabaseVolumes({ hostUid, activeDatabases: loggedInActive, isBackground: true }));
          }
        }
      };

      refresh();
      dashboardTimer.current = setInterval(refresh, interval * 1000);
    }

    return () => {
      if (dashboardTimer.current) clearInterval(dashboardTimer.current);
    };
  }, [dispatch, pollOnce, preferences.dashboardInterval, selectedHostUid, isAuthorized, isPendingReconnect, activeMainTab, isMonitoringTab]);

  // Broker Interval Refresh
  useEffect(() => {
    if (brokerTimer.current) {
      clearInterval(brokerTimer.current);
      brokerTimer.current = null;
    }

    const hostUid = selectedHostUid;
    const interval = preferences.brokerStatusInterval;

    if (isMonitoringTab && interval > 0 && isAuthorized && !isPendingReconnect) {
      const refresh = () => {
        if (Date.now() - lastActivityRef.current < MAX_IDLE_TIME) {
          pollOnce(`brokers:${hostUid}`, fetchBrokerList({ hostUid, isBackground: true }));
        }
      };

      refresh();
      brokerTimer.current = setInterval(refresh, interval * 1000);
    }

    return () => {
      if (brokerTimer.current) clearInterval(brokerTimer.current);
    };
  }, [dispatch, pollOnce, preferences.brokerStatusInterval, selectedHostUid, isAuthorized, isPendingReconnect, activeMainTab, isMonitoringTab]);

  return children;
}
