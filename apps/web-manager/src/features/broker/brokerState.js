/**
 * A broker's state as CMS's getbrokersinfo gives it: ON, OFF or SUSPENDED.
 * With the whole broker service stopped, CMS lists each broker without any
 * state field (only name, port and the like), so a missing or empty state is
 * OFF. Every reader of a broker's state goes through these.
 *
 * SUSPENDED: CMS maps the engine's FLAG_SUSPEND to it
 * (cm_common/cm_broker_admin.c), but the engine sets a broker's flag only to
 * ON or OFF today, so it does not show up in practice. Should it, the broker
 * process is up: it counts as running everywhere (stop and restart, not
 * start) and shows in orange, apart from ON.
 */
export const BROKER_OFF = 'OFF';
export const BROKER_SUSPENDED = 'SUSPENDED';

export function brokerStateOf(broker) {
  const raw = broker?.state ?? broker?.status;
  const state = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return state || BROKER_OFF;
}

export const isBrokerOn = (broker) => brokerStateOf(broker) === 'ON';

/** ON or SUSPENDED: the broker process is up. */
export const isBrokerRunning = (broker) => {
  const state = brokerStateOf(broker);
  return state === 'ON' || state === BROKER_SUSPENDED;
};

/** StatusBadge variant: green ON, orange SUSPENDED, red OFF. */
export const brokerStateVariant = (broker) => {
  const state = brokerStateOf(broker);
  if (state === 'ON') return 'emerald';
  return state === BROKER_SUSPENDED ? 'amber' : 'rose';
};

/** StatusIndicator status for the navigator dot: on, suspended (orange) or off. */
export const brokerDotStatus = (broker) => {
  const state = brokerStateOf(broker);
  if (state === 'ON') return 'on';
  return state === BROKER_SUSPENDED ? 'suspended' : 'off';
};
