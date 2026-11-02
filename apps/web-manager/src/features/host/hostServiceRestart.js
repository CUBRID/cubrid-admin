import { formatServiceFailures, refreshHaInfo } from './hostSlice';
import { databaseApi } from '../database/databaseApi';
import { fetchDatabaseStartInfo } from '../database/databaseCoreSlice';
import { fetchBrokerList } from '../broker/brokerSlice';

const errorText = (err) => err?.response?.data?.message || (typeof err === 'string' ? err : err?.message || String(err));

/**
 * Restart a host's whole service with one request: the server holds the
 * host's databases while it stops the service and starts it, which brings
 * up only the autostart list and the HA databases (see the api-server's
 * restartWholeService). Afterwards the host's lists are read again.
 *
 * @returns {Promise<{ problems: string[], skipped: {name, reason, phase}[], leftStopped: string[] }>}
 *   `skipped`: databases the user isn't logged in to, sent nothing.
 *   `leftStopped`: databases that were running and are stopped now because
 *   they are not in the autostart list.
 */
export const restartHostService = (hostUid) => async (dispatch) => {
  try {
    const { stopFailed = [], startFailed = [], skipped = [], leftStopped = [] } = await databaseApi.restartWholeService(hostUid);
    const problems = [
      stopFailed.length > 0 ? formatServiceFailures('stop service', stopFailed) : '',
      startFailed.length > 0 ? formatServiceFailures('start service', startFailed) : '',
    ].filter(Boolean);
    return { problems, skipped, leftStopped };
  } catch (err) {
    return { problems: [errorText(err)], skipped: [], leftStopped: [] };
  } finally {
    dispatch(fetchDatabaseStartInfo(hostUid));
    dispatch(fetchBrokerList(hostUid));
    dispatch(refreshHaInfo(hostUid));
  }
};
