import { useEffect, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { fetchDatabaseStartInfo } from '../../database/databaseSlice';
import { useAnyModalOpen } from '../../../infrastructure/hooks/useAnyModalOpen';

// Stable fallback reference for a store without reconnectQueue.
const EMPTY_LIST = [];

// While a database dashboard tab is in front, reads the selected host's
// start-info at the dashboard interval: it carries each database's login
// state, so the sidebar padlocks and the dashboard's "login gone" handling
// follow the server (see syncLoggedInFromStartInfo). Nothing else is polled
// here: a screen reads what it shows itself (usePollingRefresh), and reading
// volumes or the broker list for every database here fed no screen.
export default function MonitoringProvider({ children }) {
  const dispatch = useDispatch();
  const { preferences } = useSelector((state) => state.user, shallowEqual);
  const { selectedHostUid, authorizedHosts, reconnectQueue = EMPTY_LIST } = useSelector((state) => state.host, shallowEqual);
  const { activeMainTab } = useSelector((state) => state.layout, shallowEqual);
  const isAuthorized = Boolean(selectedHostUid && authorizedHosts.includes(selectedHostUid));

  // A tick that finds a read of the same kind still in flight for the host
  // shares it (see createSharedReads) instead of queueing another behind it,
  // so a slow request can't make polls pile up.
  const dashboardTimer = useRef(null);
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
  // Derived as a boolean so the effect below only restarts when THIS host
  // enters/leaves the queue — depending on the whole array would restart
  // the timer (and its immediate refresh()) whenever any other host did.
  const isPendingReconnect = Boolean(selectedHostUid && reconnectQueue.includes(selectedHostUid));
  // Nothing behind an open modal can be read, so the timer stops and restarts
  // (with an immediate refresh) when it closes.
  const anyModalOpen = useAnyModalOpen();
  // A host dashboard refreshes its own databases and brokers (ServerContent)
  // at the dashboard interval; polling them here too sent each request twice
  // per interval.
  const isMonitoringTab = activeMainTab?.startsWith('db:') && !anyModalOpen;

  // Dashboard Interval Refresh (database start-info)
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
          dispatch(fetchDatabaseStartInfo({ hostUid, isBackground: true }));
        }
      };

      refresh();
      dashboardTimer.current = setInterval(refresh, interval * 1000);
    }

    return () => {
      if (dashboardTimer.current) clearInterval(dashboardTimer.current);
    };
  }, [dispatch, preferences.dashboardInterval, selectedHostUid, isAuthorized, isPendingReconnect, activeMainTab, isMonitoringTab]);

  return children;
}
