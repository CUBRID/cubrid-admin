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
 * Broker start/stop thunks only refresh the shared brokersByHost slice — the
 * dashboard/status tabs (Brokers.jsx, BrokerStatus.jsx) keep their own local
 * state via usePollingRefresh and never read that slice, so without this
 * they'd keep showing the pre-action PID/status until their next poll tick.
 *
 * Only nudges the active tab when it is one of this host's broker tabs: a
 * blanket active-tab refresh would also reload an unrelated config editor
 * tab and silently discard its unsaved edits (the F5 path confirms first,
 * this one can't).
 */
export const refreshActiveBrokerTab = (hostUid) => (dispatch, getState) => {
  const tabId = getState().layout.activeMainTab;
  if (isBrokerTabOfHost(tabId, hostUid)) {
    dispatch(triggerRefreshActiveTab(tabId));
  }
};

// The wrappers below reject with the underlying thunk's error so Sidebar's
// existing try/catch keeps showing it; the tab is only refreshed on success.

export const startAllBrokersAndRefresh = (hostUid) => async (dispatch) => {
  await dispatch(startAllBrokers(hostUid)).unwrap();
  dispatch(refreshActiveBrokerTab(hostUid));
};

export const stopAllBrokersAndRefresh = (hostUid) => async (dispatch) => {
  await dispatch(stopAllBrokers(hostUid)).unwrap();
  dispatch(refreshActiveBrokerTab(hostUid));
};

export const restartAllBrokersAndRefresh = (hostUid) => async (dispatch) => {
  await dispatch(stopAllBrokers(hostUid)).unwrap();
  await dispatch(startAllBrokers(hostUid)).unwrap();
  dispatch(refreshActiveBrokerTab(hostUid));
};

export const startBrokerAndRefresh = ({ hostUid, brokerName }) => async (dispatch) => {
  await dispatch(startBroker({ hostUid, brokerName })).unwrap();
  dispatch(fetchBrokerList(hostUid));
  dispatch(refreshActiveBrokerTab(hostUid));
};

export const stopBrokerAndRefresh = ({ hostUid, brokerName }) => async (dispatch) => {
  await dispatch(stopBroker({ hostUid, brokerName })).unwrap();
  dispatch(fetchBrokerList(hostUid));
  dispatch(refreshActiveBrokerTab(hostUid));
};
