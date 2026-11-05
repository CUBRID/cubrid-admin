import { markBrokersRestarting, startBroker, stopBroker } from './brokerSlice';
import { refreshAfterBrokerAction } from './brokerSidebarActions';

export const MULTI_BROKER_ACTIONS = ['start', 'stop', 'restart'];

// The selected brokers an action applies to; the rest is shown as skipped.
export function splitBrokersByAction(action, brokers) {
  const targets = [];
  const skipped = [];
  for (const broker of brokers) {
    const on = broker.state === 'ON';
    if (action === 'start' ? !on : on) targets.push(broker);
    else skipped.push(broker);
  }
  return { targets, skipped };
}

const errorText = (err) => (typeof err === 'string' ? err : err?.message || String(err));

/**
 * Starts, stops or restarts brokers one after another (no retry); a failure
 * doesn't stop the rest. A restart is stop then start — CMS's broker_restart
 * restarts one CAS, not a broker — and a broker whose stop failed is not
 * started. The broker list is refreshed once at the end.
 *
 * @returns {Promise<{ succeeded: string[], failed: {dbname, error, phase?}[], skipped: [] }>}
 *   `dbname` holds the broker name, so the result dialog can list it.
 */
export async function runMultiBrokerAction(dispatch, { hostUid, action, names }) {
  const succeeded = [];
  const failed = [];
  if (action === 'restart') dispatch(markBrokersRestarting({ hostUid, names, restarting: true }));
  try {
    for (const brokerName of names) {
      const phase = action === 'restart' ? { stop: 'stop', start: 'start' } : {};
      try {
        if (action !== 'start') await dispatch(stopBroker({ hostUid, brokerName })).unwrap();
      } catch (err) {
        failed.push({ dbname: brokerName, error: errorText(err), phase: phase.stop });
        continue;
      }
      try {
        if (action !== 'stop') await dispatch(startBroker({ hostUid, brokerName })).unwrap();
        succeeded.push(brokerName);
      } catch (err) {
        failed.push({ dbname: brokerName, error: errorText(err), phase: phase.start });
      }
    }
  } finally {
    if (action === 'restart') dispatch(markBrokersRestarting({ hostUid, names, restarting: false }));
    dispatch(refreshAfterBrokerAction(hostUid));
  }
  return { succeeded, failed, skipped: [] };
}
