import { useEffect, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { fetchDatabaseStartInfo, fetchDatabaseVolumes } from '../../database/databaseSlice';
import { fetchBrokerList } from '../../broker/brokerSlice';
import { dbKey } from '../../database/dbKey';

export default function MonitoringProvider({ children }) {
  const dispatch = useDispatch();
  const { preferences } = useSelector((state) => state.user, shallowEqual);
  const { selectedHostUid, authorizedHosts } = useSelector((state) => state.host, shallowEqual);
  const { activeDatabases, loggedInDatabases } = useSelector((state) => state.database, shallowEqual);
  const { activeMainTab } = useSelector((state) => state.layout, shallowEqual);
  // A database stays active (running) after logout — logout only drops the
  // session — so polling volumes for every active db keeps re-fetching (and
  // the storage volume table kept showing) one the user already logged out of.
  const loggedInActiveDatabases = activeDatabases.filter((db) => loggedInDatabases.includes(dbKey(selectedHostUid, db)));
  
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
  const isMonitoringTab = activeMainTab?.startsWith('host:') || activeMainTab?.startsWith('db:');

  // Dashboard Interval Refresh (Databases & Volumes)
  useEffect(() => {
    if (dashboardTimer.current) {
      clearInterval(dashboardTimer.current);
      dashboardTimer.current = null;
    }

    const hostUid = selectedHostUid;
    const interval = preferences.dashboardInterval;

    if (isMonitoringTab && interval > 0 && hostUid && authorizedHosts.includes(hostUid)) {
      const refresh = () => {
        if (Date.now() - lastActivityRef.current < MAX_IDLE_TIME) {
          dispatch(fetchDatabaseStartInfo({ hostUid, isBackground: true }));
          if (loggedInActiveDatabases.length > 0) {
            dispatch(fetchDatabaseVolumes({ hostUid, activeDatabases: loggedInActiveDatabases, isBackground: true }));
          }
        }
      };

      refresh();
      dashboardTimer.current = setInterval(refresh, interval * 1000);
    }

    return () => {
      if (dashboardTimer.current) clearInterval(dashboardTimer.current);
    };
  }, [dispatch, preferences.dashboardInterval, selectedHostUid, authorizedHosts, activeDatabases, loggedInActiveDatabases, activeMainTab, isMonitoringTab]);

  // Broker Interval Refresh
  useEffect(() => {
    if (brokerTimer.current) {
      clearInterval(brokerTimer.current);
      brokerTimer.current = null;
    }

    const hostUid = selectedHostUid;
    const interval = preferences.brokerStatusInterval;

    if (isMonitoringTab && interval > 0 && hostUid && authorizedHosts.includes(hostUid)) {
      const refresh = () => {
        if (Date.now() - lastActivityRef.current < MAX_IDLE_TIME) {
          dispatch(fetchBrokerList({ hostUid, isBackground: true }));
        }
      };

      refresh();
      brokerTimer.current = setInterval(refresh, interval * 1000);
    }

    return () => {
      if (brokerTimer.current) clearInterval(brokerTimer.current);
    };
  }, [dispatch, preferences.brokerStatusInterval, selectedHostUid, authorizedHosts, activeMainTab, isMonitoringTab]);

  return children;
}
