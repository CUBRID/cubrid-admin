import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { hostKey } from '../host/hostKey';

/**
 * A broker being restarted keeps showing ON, the state it had, until the
 * restart ends: between the stop and the start CMS reports it OFF (or another
 * passing state), which flashed in its status badge and dot. Restarts are
 * marked in brokerSlice's restartingBrokers, by hostKey(hostUid, name).
 */
export function withRestartsShownOn(brokers, restartingBrokers, hostUid) {
  if (!brokers?.length || !restartingBrokers || Object.keys(restartingBrokers).length === 0) return brokers;
  return brokers.map((broker) => (
    restartingBrokers[hostKey(hostUid, broker.name)] ? { ...broker, state: 'ON' } : broker
  ));
}

export function useShownBrokers(hostUid, brokers) {
  const restartingBrokers = useSelector((state) => state.broker.restartingBrokers);
  return useMemo(() => withRestartsShownOn(brokers, restartingBrokers, hostUid), [brokers, restartingBrokers, hostUid]);
}
