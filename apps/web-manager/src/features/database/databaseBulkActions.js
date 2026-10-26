import { fetchDatabaseStartInfo, startDatabase, stopDatabase } from './databaseCoreSlice';

const errorText = (err) => (typeof err === 'string' ? err : err?.message || String(err));

// "Restart All Databases": stop then start exactly the given databases, one
// at a time, through the individual start/stop endpoints. Deliberately not
// the start-all/stop-all endpoints: those always act on every `ha_db_list`
// entry on an HA host regardless of the dbnames passed, so a restart would
// also start an HA database that was stopped on purpose. Each database's
// failure is caught and recorded instead of aborting the rest.
//
// A rejected stop doesn't prove the database is still running — the stop
// command itself may have succeeded with only the follow-up status lookup
// failing — so the active list is re-read once before deciding whom to
// start. Only a database confirmed still active is skipped; one confirmed
// stopped had its stop succeed after all; if the state can't be confirmed,
// it is started anyway so a restart never leaves a database down.
export async function restartDatabasesIndividually(dispatch, hostUid, dbnames) {
  let failed = [];
  for (const dbname of dbnames) {
    try {
      await dispatch(stopDatabase({ hostUid, dbname })).unwrap();
    } catch (err) {
      failed.push({ dbname, phase: 'stop', error: errorText(err) });
    }
  }
  const stillActive = failed.length > 0 ? await readActiveDbnames(dispatch, hostUid) : null;
  if (stillActive) {
    failed = failed.filter((f) => stillActive.has(f.dbname));
  }
  const toStart = dbnames.filter((d) => !stillActive?.has(d));
  for (const dbname of toStart) {
    try {
      await dispatch(startDatabase({ hostUid, dbname })).unwrap();
    } catch (err) {
      failed.push({ dbname, phase: 'start', error: errorText(err) });
    }
  }
  return { failed };
}

// Active dbnames per a fresh start-info read, or null if it can't be read
// (or comes back malformed) — unknown, not "nothing is running".
async function readActiveDbnames(dispatch, hostUid) {
  try {
    const info = await dispatch(fetchDatabaseStartInfo(hostUid)).unwrap();
    const active = info?.activelist?.active;
    if (!Array.isArray(active)) return null;
    const names = active.map((a) => (typeof a === 'string' ? a : a?.dbname));
    if (!names.every((n) => typeof n === 'string' && n.length > 0)) return null;
    return new Set(names);
  } catch (_) {
    return null;
  }
}

// Groups `{ dbname, phase, error }` failures by database (first-seen order)
// so one database failing in several phases is counted and listed once.
export function groupBulkFailures(failed) {
  const byDb = new Map();
  for (const { dbname, phase, error } of failed) {
    if (!byDb.has(dbname)) byDb.set(dbname, []);
    byDb.get(dbname).push({ phase, error });
  }
  return [...byDb].map(([dbname, reasons]) => ({ dbname, reasons }));
}

// Start All / Stop All result text: failures and skips are reported
// separately (a skip is not an error). `failedMsg` is the action's own
// "N database(s) failed to start/stop" label.
export function bulkOutcomeMessages(CM, result, failedMsg) {
  const failed = result?.failed || [];
  const skipped = result?.skipped || [];
  return {
    failedText: failed.length > 0
      ? failedMsg(failed.length) + CM.failedListSuffix(failed.map((f) => `${f.dbname} (${f.error})`).join(', '))
      : '',
    skippedText: skipped.length > 0
      ? CM.someDatabasesSkippedHaBulkMsg(skipped.length, skipped.map((s) => s.dbname).join(', '))
      : '',
  };
}
