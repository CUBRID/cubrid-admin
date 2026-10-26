import {
  fetchBrokerList,
  startBroker,
  stopBroker,
  startAllBrokers,
  stopAllBrokers,
} from './brokerSlice';
import { triggerRefreshActiveTab } from '../layout/layoutSlice';

/** True for the broker dashboard (`brokers_status:`) and per-broker status
 * (`broker_status:`) tabs of this host. */
export function isBrokerTabOfHost(tabId, hostUid) {
  if (!tabId || !hostUid) return false;
  return tabId === `brokers_status:${hostUid}` || tabId.startsWith(`broker_status:${hostUid}:`);
}

/**
 * Run once after every sidebar broker action. The start/stop thunks don't
 * refetch the broker list themselves, so each action costs exactly one list
 * fetch: CMS serves one host's requests one at a time, and every extra
 * fetch queues ahead of the one that actually updates the view.
 *
 * - This host's broker list tab (Brokers.jsx) keeps its own local list via
 *   usePollingRefresh, so just refresh it; its own fetch also updates the
 *   shared brokersByHost / sidebar tree.
 * - Anywhere else, fetch the list with `afterAction` (shown even if a host
 *   dashboard poll starts while it is in flight, see brokerSlice), and also
 *   refresh this host's broker status tab if that is the active one.
 *
 * Only this host's broker tabs are ever refreshed: a blanket active-tab
 * refresh would also reload an unrelated config editor tab and silently
 * discard its unsaved edits (the F5 path confirms first, this one can't).
 */
export const refreshAfterBrokerAction = (hostUid) => (dispatch, getState) => {
  const tabId = getState().layout.activeMainTab;
  if (tabId === `brokers_status:${hostUid}`) {
    dispatch(triggerRefreshActiveTab(tabId));
    return;
  }
  dispatch(fetchBrokerList({ hostUid, afterAction: true }));
  if (isBrokerTabOfHost(tabId, hostUid)) {
    dispatch(triggerRefreshActiveTab(tabId));
  }
};

// The wrappers below reject with the underlying thunk's error so Sidebar's
// existing try/catch keeps showing it; the views are only refreshed once
// something actually changed.

export const startAllBrokersAndRefresh = (hostUid) => async (dispatch) => {
  await dispatch(startAllBrokers(hostUid)).unwrap();
  dispatch(refreshAfterBrokerAction(hostUid));
};

export const stopAllBrokersAndRefresh = (hostUid) => async (dispatch) => {
  await dispatch(stopAllBrokers(hostUid)).unwrap();
  dispatch(refreshAfterBrokerAction(hostUid));
};

export const restartAllBrokersAndRefresh = (hostUid) => async (dispatch) => {
  await dispatch(stopAllBrokers(hostUid)).unwrap();
  try {
    await dispatch(startAllBrokers(hostUid)).unwrap();
  } finally {
    // Also after a failed start: the brokers really are stopped now.
    dispatch(refreshAfterBrokerAction(hostUid));
  }
};

export const startBrokerAndRefresh = ({ hostUid, brokerName }) => async (dispatch) => {
  await dispatch(startBroker({ hostUid, brokerName })).unwrap();
  dispatch(refreshAfterBrokerAction(hostUid));
};

export const stopBrokerAndRefresh = ({ hostUid, brokerName }) => async (dispatch) => {
  await dispatch(stopBroker({ hostUid, brokerName })).unwrap();
  dispatch(refreshAfterBrokerAction(hostUid));
};
