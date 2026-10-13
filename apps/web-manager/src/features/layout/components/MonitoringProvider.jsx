import { useEffect, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { fetchDatabaseStartInfo, fetchDatabaseVolumes } from '../../database/databaseSlice';
import { fetchBrokerList } from '../../broker/brokerSlice';

export default function MonitoringProvider({ children }) {
  const dispatch = useDispatch();
  const { preferences } = useSelector((state) => state.user, shallowEqual);
  const { selectedHostUid, authorizedHosts } = useSelector((state) => state.host, shallowEqual);
  const { activeDatabasesByHost } = useSelector((state) => state.database, shallowEqual);
  // activeDatabasesByHost is keyed by hostUid — this provider only ever
  // polls the currently selected host, so read straight out of its slot
  // rather than a flat shared array a different, still in-flight host's
  // response could clobber.
  const activeDatabases = activeDatabasesByHost[selectedHostUid] || [];
  const { activeMainTab } = useSelector((state) => state.layout, shallowEqual);
  
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
          if (activeDatabases.length > 0) {
            dispatch(fetchDatabaseVolumes({ hostUid, activeDatabases, isBackground: true }));
          }
        }
      };

      refresh();
      dashboardTimer.current = setInterval(refresh, interval * 1000);
    }

    return () => {
      if (dashboardTimer.current) clearInterval(dashboardTimer.current);
    };
  }, [dispatch, preferences.dashboardInterval, selectedHostUid, authorizedHosts, activeDatabases, activeMainTab, isMonitoringTab]);

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
