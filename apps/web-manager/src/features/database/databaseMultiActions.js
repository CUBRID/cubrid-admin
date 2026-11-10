import { dbKey } from './dbKey';
import { getCM, getStoredLocale } from '../../constants/useCM';
import {
  deleteDatabaseProfile,
  loginDatabase,
  logoutDatabase,
  registerDatabase,
  runSelectedDatabasesAction,
} from './databaseCoreSlice';

export const MULTI_DB_ACTIONS = ['start', 'stop', 'restart', 'login', 'logout', 'forgetCredentials'];

export const MULTI_DB_ACTION_ICONS = {
  start: 'play_circle',
  stop: 'stop_circle',
  restart: 'restart_alt',
  login: 'login',
  logout: 'logout',
  forgetCredentials: 'key_off',
};

// One row per database of a host, with what the multi-select actions need.
// Reads the navigator lists the database tree shows, so a selection made in
// the tree is counted and judged running or stopped as the tree shows it.
// The server decides start/stop/restart again under its lock.
export function databaseSelectionRows(state, hostUid) {
  const db = state.database;
  const active = new Set(db.navigatorActiveDatabasesByHost?.[hostUid] || []);
  const ha = new Set(db.haDbNamesByHost?.[hostUid] || []);
  const loggedIn = new Set(db.loggedInDatabases || []);
  return (db.navigatorDatabasesByHost?.[hostUid] || []).map((entry) => ({
    dbname: entry.dbname,
    running: active.has(entry.dbname),
    loggedIn: loggedIn.has(dbKey(hostUid, entry.dbname)),
    loggedOut: entry.isLoggedOut === true,
    hasProfile: entry.isProfileExists === true,
    isHa: ha.has(entry.dbname),
  }));
}

const applies = {
  start: (row) => !row.running,
  stop: (row) => row.running,
  restart: (row) => row.running,
  login: (row) => !row.loggedIn,
  logout: (row) => row.loggedIn,
  forgetCredentials: (row) => row.hasProfile,
};

// The selected rows an action applies to; the rest is shown as skipped.
export function splitByAction(action, rows) {
  const targets = [];
  const skipped = [];
  for (const row of rows) {
    if (applies[action](row)) targets.push(row);
    else skipped.push(row);
  }
  return { targets, skipped };
}

const errorText = (err) => (typeof err === 'string' ? err : err?.message || String(err));

// Runs one per-database thunk after another (no retry); a failure doesn't
// stop the rest.
async function eachInTurn(rows, run) {
  const succeeded = [];
  const failed = [];
  const skipped = [];
  for (const row of rows) {
    try {
      const outcome = await run(row);
      if (outcome?.skip) skipped.push({ dbname: row.dbname, reason: outcome.skip });
      else succeeded.push(row.dbname);
    } catch (err) {
      failed.push({ dbname: row.dbname, error: errorText(err) });
    }
  }
  return { succeeded, failed, skipped };
}

/**
 * Runs a multi-select action on `rows` (already filtered by splitByAction).
 * Start/stop/restart go to the server in one request; login, logout and
 * forgetting credentials call the per-database endpoints in turn. A login
 * uses the database's saved credentials, or for those without, its entry in
 * `credentials` ({ [dbname]: { id, password, save } }). With `save` the
 * entered credentials are stored as the database's profile after the login
 * succeeds, as the single login dialog does; a profile is never used to log
 * in on its own.
 *
 * @returns {Promise<{ succeeded: string[], failed: {dbname, error, phase?}[], skipped: {dbname, reason}[] }>}
 */
export async function runMultiDatabaseAction(dispatch, CM, { hostUid, action, rows, credentials }) {
  if (rows.length === 0) return { succeeded: [], failed: [], skipped: [] };
  const dbnames = rows.map((row) => row.dbname);
  switch (action) {
    case 'start':
    case 'stop':
    case 'restart': {
      const result = await dispatch(runSelectedDatabasesAction({ hostUid, action, dbnames })).unwrap();
      return { succeeded: result.succeeded || [], failed: result.failed || [], skipped: result.skipped || [] };
    }
    case 'login':
      return eachInTurn(rows, async (row) => {
        if (row.hasProfile) {
          await dispatch(loginDatabase({ hostUid, dbname: row.dbname })).unwrap();
          return null;
        }
        const entered = credentials?.[row.dbname];
        if (!entered?.id) return { skip: CM.noSavedCredentialsReason };
        const payload = { id: entered.id, password: entered.password || '' };
        await dispatch(loginDatabase({ hostUid, dbname: row.dbname, payload })).unwrap();
        if (entered.save) {
          try {
            await dispatch(registerDatabase({ hostUid, dbname: row.dbname, payload })).unwrap();
          } catch {
            // Logged in; only the profile is missing.
            throw new Error(CM.credentialsNotSavedMessage);
          }
        }
        return null;
      });
    case 'logout':
      return eachInTurn(rows, async (row) => {
        await dispatch(logoutDatabase({ hostUid, dbname: row.dbname })).unwrap();
      });
    case 'forgetCredentials':
      return eachInTurn(rows, async (row) => {
        await dispatch(deleteDatabaseProfile({ hostUid, dbname: row.dbname })).unwrap();
      });
    default:
      throw new Error(getCM(getStoredLocale()).unknownActionMsg(action));
  }
}
