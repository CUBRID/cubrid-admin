import { startDatabase, stopDatabase } from './databaseCoreSlice';

const errorText = (err) => (typeof err === 'string' ? err : err?.message || String(err));

// "Restart All Databases": stop then start exactly the given databases, one
// at a time, through the individual start/stop endpoints. Deliberately not
// the start-all/stop-all endpoints: those always act on every `ha_db_list`
// entry on an HA host regardless of the dbnames passed, so a restart would
// also start an HA database that was stopped on purpose. Each database's
// failure is caught and recorded instead of aborting the rest; a database
// that failed to stop is not started again (it is still running).
export async function restartDatabasesIndividually(dispatch, hostUid, dbnames) {
  const failed = [];
  const stopped = [];
  for (const dbname of dbnames) {
    try {
      await dispatch(stopDatabase({ hostUid, dbname })).unwrap();
      stopped.push(dbname);
    } catch (err) {
      failed.push({ dbname, phase: 'stop', error: errorText(err) });
    }
  }
  for (const dbname of stopped) {
    try {
      await dispatch(startDatabase({ hostUid, dbname })).unwrap();
    } catch (err) {
      failed.push({ dbname, phase: 'start', error: errorText(err) });
    }
  }
  return { failed };
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
