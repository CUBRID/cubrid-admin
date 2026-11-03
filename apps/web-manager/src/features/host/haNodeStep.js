// Name of the one result entry for a whole-service start or stop's HA step:
// the api-server sends one dbname-less ha_start/ha_stop for the node there
// (database-lifecycle.service.ts HA_NODE_STEP).
export const HA_NODE_STEP = 'HA databases (heartbeat)';
