// CMS reports a CAS as IDLE, BUSY, CLIENT WAIT, CLOSE WAIT or RESTART
// (cm_broker_admin.c). CLIENT WAIT and CLOSE WAIT are busy too: a client
// holds the CAS (the engine's own busy state, broker_monitor.c
// get_status_string). RESTART is neither idle nor busy.

/** Free for the next client. */
export const isCasIdle = (status) => status === 'IDLE';

/** Held by a client. */
export const isCasBusy = (status) => status === 'BUSY' || status === 'CLIENT WAIT' || status === 'CLOSE WAIT';

/**
 * The CASes' queries per second added up (each CAS's rate from its own
 * counter, fetchDashboardCAS). Null until some CAS has a rate.
 */
export function totalCasQps(brokersCAS) {
  const rates = (brokersCAS || []).map((cas) => cas?.qps).filter((qps) => typeof qps === 'number');
  return rates.length > 0 ? rates.reduce((sum, qps) => sum + qps, 0) : null;
}
