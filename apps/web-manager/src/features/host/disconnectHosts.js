import { revokeHostLogin, forgetHostSession, setSelectedHost } from './hostSlice';
import { closeHostTabs } from '../layout/layoutSlice';
import { resetDatabaseState } from '../database/databaseCoreSlice';
import { resetBrokerState } from '../broker/brokerSlice';
import { clearHostSummary } from '../server/globalMonitoringSlice';

/** The hosts of `uids` that are connected; the others have nothing to log out of. */
export const connectedHostUids = (uids, authorizedHosts) => (uids || []).filter((uid) => (authorizedHosts || []).includes(uid));

/**
 * Disconnects each host as the host menu's Disconnect does: ends the
 * client's session for it, tells the server, closes its tabs, and clears the
 * sidebar if it was the selected host.
 */
export function disconnectHosts(dispatch, uids, selectedHostUid) {
  uids.forEach((hostUid) => {
    dispatch(revokeHostLogin(hostUid));
    dispatch(forgetHostSession(hostUid));
    dispatch(closeHostTabs(hostUid));
    if (selectedHostUid === hostUid) {
      dispatch(setSelectedHost(null));
      dispatch(resetDatabaseState(hostUid));
      dispatch(resetBrokerState(hostUid));
    }
    dispatch(clearHostSummary(hostUid));
  });
}
