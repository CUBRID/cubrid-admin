import { useCallback, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { loginToHostWithSideEffects, fetchHostEnv, openEditHostModal, setSelectedHost } from './hostSlice';
import { resetDatabaseState, fetchDatabaseStartInfo } from '../database/databaseCoreSlice';
import { resetBrokerState, fetchBrokerList } from '../broker/brokerSlice';
import { setActiveMainTab } from '../layout/layoutSlice';
import { fetchHaHeartbeatOnly } from '../server/monitoringSlice';

/**
 * Logs into a host (if not already authorized) then opens its dashboard tab.
 * For an already-authorized host this never logs in — it just switches the
 * active tab and refetches — so it's safe to call reactively on a plain
 * single-click focus change (ServerListItem does this) as well as an
 * explicit gesture (double-click, row-open). For a not-yet-authorized host,
 * only call this from an explicit gesture: it triggers login, which a mere
 * focus change should never do.
 */
export function useHostActivation() {
  const dispatch = useDispatch();
  const { authorizedHosts, selectedHostUid, haInfo } = useSelector((state) => state.host, shallowEqual);
  const loginInProgressRef = useRef(false);

  // Sidebar's per-database HA gates (Load/Rename/Restore/Delete Database)
  // read state.monitoring.hostsData[hostUid].haHeartbeat, but nothing was
  // fetching it unless the Server Dashboard tab happened to be open — so
  // right-clicking a database straight from the tree saw no heartbeat data
  // and never disabled those items. Kick this off as soon as the host is
  // known to be HA (haInfo is set at login and persisted across sessions),
  // so it's populated well before the user reaches a context menu.
  const primeHaHeartbeat = useCallback((uid) => {
    if (haInfo[uid]?.isHA) {
      dispatch(fetchHaHeartbeatOnly(uid));
    }
  }, [dispatch, haInfo]);

  const activateHost = useCallback((uid) => {
    if (!uid) return;
    if (loginInProgressRef.current) return;

    if (authorizedHosts.includes(uid)) {
      // Only wipe the client's dbmt-login belief (loggedInDatabases) and
      // broker state when this is an actual switch to a *different* host —
      // refocusing the host you're already on (tab-away-and-back, a second
      // single-click) must not throw away a login that's still perfectly
      // valid server-side, or the lock icon in the tree would falsely flip
      // back to "not logged in" on every refocus.
      const isSwitchingHost = uid !== selectedHostUid;
      dispatch(setSelectedHost(uid));
      if (isSwitchingHost) {
        dispatch(resetDatabaseState(selectedHostUid));
        dispatch(resetBrokerState(selectedHostUid));
      }
      dispatch(setActiveMainTab('host:' + uid));
      dispatch(fetchDatabaseStartInfo(uid));
      dispatch(fetchBrokerList(uid));
      dispatch(fetchHostEnv(uid));
      primeHaHeartbeat(uid);
      return;
    }

    loginInProgressRef.current = true;
    dispatch(loginToHostWithSideEffects(uid))
      .unwrap()
      .then(() => {
        dispatch(setSelectedHost(uid));
        dispatch(resetDatabaseState(selectedHostUid));
        dispatch(resetBrokerState(selectedHostUid));
        dispatch(setActiveMainTab('host:' + uid));
        dispatch(fetchDatabaseStartInfo(uid));
        dispatch(fetchBrokerList(uid));
        dispatch(fetchHostEnv(uid));
        primeHaHeartbeat(uid);
      })
      .catch((err) => {
        console.error('Failed to log into host:', err);
        // Likely a bad/missing password (or other stale connection detail) —
        // open the Edit Host modal so the user can fix it right away instead
        // of just seeing a dead-end error.
        dispatch(openEditHostModal(uid));
      })
      .finally(() => {
        loginInProgressRef.current = false;
      });
  }, [dispatch, authorizedHosts, selectedHostUid, primeHaHeartbeat]);

  return activateHost;
}
