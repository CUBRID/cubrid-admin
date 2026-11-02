import { formatServiceFailures, refreshHaInfo } from './hostSlice';
import { databaseApi } from '../database/databaseApi';
import { fetchDatabaseStartInfo } from '../database/databaseCoreSlice';
import { fetchBrokerList } from '../broker/brokerSlice';

const errorText = (err) => err?.response?.data?.message || (typeof err === 'string' ? err : err?.message || String(err));

/**
 * Restart a host's whole service with one request: the server holds the
 * host's databases while it stops the service, starts it, and starts again
 * the databases that were running before (see the api-server's
 * restartWholeService). Afterwards the host's lists are read again.
 *
 * @returns {Promise<{ problems: string[], notRestarted: {dbname, error}[] }>}
 */
export const restartServiceKeepingDatabases = (hostUid) => async (dispatch) => {
  try {
    const { stopFailed = [], startFailed = [], notRestarted = [] } = await databaseApi.restartWholeService(hostUid);
    const problems = [
      stopFailed.length > 0 ? formatServiceFailures('stop service', stopFailed) : '',
      startFailed.length > 0 ? formatServiceFailures('start service', startFailed) : '',
    ].filter(Boolean);
    return { problems, notRestarted };
  } catch (err) {
    return { problems: [errorText(err)], notRestarted: [] };
  } finally {
    dispatch(fetchDatabaseStartInfo(hostUid));
    dispatch(fetchBrokerList(hostUid));
    dispatch(refreshHaInfo(hostUid));
  }
};
