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

// Result dialog payload (showStatusModal) for Start/Stop/Restart All: a
// short headline plus tables — failures (grouped per database, with the
// stop/start phase for a restart) and skipped HA databases kept apart.
// null when every database succeeded.
export function bulkResultStatusModal(CM, { title, failedMsg, failed = [], skipped = [], showPhase = false }) {
  const grouped = groupBulkFailures(failed || []);
  const skippedList = skipped || [];
  if (grouped.length === 0 && skippedList.length === 0) return null;
  const phaseLabel = { stop: CM.bulkRestartPhaseStop, start: CM.bulkRestartPhaseStart };
  const tables = [];
  if (grouped.length > 0) {
    tables.push({
      title: CM.failureTableFailedTitle,
      nameLabel: CM.database,
      showPhase,
      variant: 'failed',
      testId: 'bulk-failed-table',
      rows: grouped.map(({ dbname, reasons }) => ({
        name: dbname,
        reasons: reasons.map((r) => ({ phase: phaseLabel[r.phase] ?? r.phase, reason: r.error })),
      })),
    });
  }
  if (skippedList.length > 0) {
    tables.push({
      title: CM.failureTableSkippedTitle,
      nameLabel: CM.database,
      variant: 'skipped',
      testId: 'bulk-skipped-table',
      // The only skip reason the server reports (HA admin-only rule).
      rows: skippedList.map((sk) => ({ name: sk.dbname, reasons: [{ reason: CM.haBulkRequiresAdminReason }] })),
    });
  }
  return {
    type: grouped.length > 0 ? 'error' : 'info',
    title,
    message: [
      grouped.length > 0 ? failedMsg(grouped.length) : '',
      skippedList.length > 0 ? CM.someDatabasesSkippedMsg(skippedList.length) : '',
    ].filter(Boolean).join(' '),
    tables,
  };
}
