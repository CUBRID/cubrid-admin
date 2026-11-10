import { fetchDatabaseStartInfo } from './databaseCoreSlice';
import { fetchDatabaseSpaceInfo } from './databaseMonitoringSlice';
import { dbKey } from './dbKey';

/**
 * The navigator's Refresh on the database list (or on one database): reads
 * the host's start-info, then the volumes of each database whose Space
 * folder already shows them. Start-info alone left those volumes as they
 * were, e.g. without one just added. Only a running database the user is
 * logged in to (by the start-info just read) is read; a Space folder never
 * opened stays unread.
 */
export const refreshNavigatorDatabases = (hostUid, { dbname } = {}) => async (dispatch, getState) => {
  if (!hostUid) return;
  await dispatch(fetchDatabaseStartInfo(hostUid));
  const state = getState();
  const loggedIn = state.database?.loggedInDatabases ?? [];
  const active = state.database?.navigatorActiveDatabasesByHost?.[hostUid] ?? [];
  const shown = state.databaseMonitoring?.spaceInfo ?? {};
  (dbname ? [dbname] : active)
    .filter((name) => {
      const key = dbKey(hostUid, name);
      return active.includes(name) && loggedIn.includes(key) && shown[key];
    })
    .forEach((name) => dispatch(fetchDatabaseSpaceInfo({ hostUid, dbname: name })));
};
