import { startAllDatabases, stopAllDatabases } from './databaseCoreSlice';

// "Restart All Databases": bulk stop, then bulk start, of the same list —
// each phase isolates its own per-database failures (same endpoints and HA
// rule as Start/Stop All). Failures are tagged with their phase; an HA
// database skipped in both phases (non-admin CMS account) is listed once.
export async function restartDatabasesInBulk(dispatch, hostUid, dbnames) {
  if (dbnames.length === 0) return { failed: [], skipped: [] };
  const stopResult = await dispatch(stopAllDatabases({ hostUid, dbnames })).unwrap();
  const startResult = await dispatch(startAllDatabases({ hostUid, dbnames })).unwrap();
  const tag = (list, phase) => (list || []).map(({ dbname, error }) => ({ dbname, phase, error }));
  const skipped = new Map();
  [...(stopResult.skipped || []), ...(startResult.skipped || [])].forEach((s) => {
    if (!skipped.has(s.dbname)) skipped.set(s.dbname, s);
  });
  return {
    failed: [...tag(stopResult.failed, 'stop'), ...tag(startResult.failed, 'start')],
    skipped: [...skipped.values()],
  };
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
