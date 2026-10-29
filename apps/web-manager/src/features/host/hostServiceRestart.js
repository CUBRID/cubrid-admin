import { startService, stopService } from './hostSlice';
import { fetchDatabaseStartInfo, runSelectedDatabasesAction } from '../database/databaseCoreSlice';

const errorText = (err) => (typeof err === 'string' ? err : err?.message || String(err));
const activeNames = (info) => new Set(
  (info?.activelist?.active || []).map((a) => (typeof a === 'string' ? a : a?.dbname)).filter(Boolean)
);

/**
 * Restart a host's whole service: stop it, start it, then start again the
 * databases that were running before but aren't now — a service start only
 * brings up the `server=` autostart list and HA databases. The start is
 * attempted even if the stop reported failures (part of it did stop).
 *
 * @returns {Promise<{ problems: string[], notRestarted: {dbname, error}[] }>}
 */
export const restartServiceKeepingDatabases = (hostUid) => async (dispatch, getState) => {
  const wasRunning = [...(getState().database.activeDatabasesByHost?.[hostUid] || [])];
  const problems = [];
  try {
    await dispatch(stopService(hostUid)).unwrap();
  } catch (err) {
    problems.push(errorText(err));
  }
  try {
    await dispatch(startService(hostUid)).unwrap();
  } catch (err) {
    problems.push(errorText(err));
  }

  let notRestarted = [];
  try {
    const info = await dispatch(fetchDatabaseStartInfo(hostUid)).unwrap();
    const running = activeNames(info);
    const toStart = wasRunning.filter((dbname) => !running.has(dbname));
    if (toStart.length > 0) {
      const result = await dispatch(runSelectedDatabasesAction({ hostUid, action: 'start', dbnames: toStart })).unwrap();
      notRestarted = result.failed || [];
      if (result.succeeded?.length) dispatch(fetchDatabaseStartInfo(hostUid));
    }
  } catch (err) {
    notRestarted = wasRunning.map((dbname) => ({ dbname, error: errorText(err) }));
  }
  return { problems, notRestarted };
};
