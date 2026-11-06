/**
 * A broker's state as CMS's getbrokersinfo gives it: ON, OFF or SUSPENDED.
 * With the whole broker service stopped, CMS lists each broker without any
 * state field (only name, port and the like), so a missing or empty state is
 * OFF. Every reader of a broker's state goes through these.
 */
export const BROKER_OFF = 'OFF';

export function brokerStateOf(broker) {
  const raw = broker?.state ?? broker?.status;
  const state = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return state || BROKER_OFF;
}

export const isBrokerOn = (broker) => brokerStateOf(broker) === 'ON';

/** ON or SUSPENDED: the broker process is up. */
export const isBrokerRunning = (broker) => {
  const state = brokerStateOf(broker);
  return state === 'ON' || state === 'SUSPENDED';
};
