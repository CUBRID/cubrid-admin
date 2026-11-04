import { fetchDatabaseStartInfo, startAllDatabases, stopAllDatabases } from './databaseCoreSlice';
import { HA_NODE_STEP } from '../host/haNodeStep';
import { failureText } from '../../infrastructure/errors/serverErrorText';

const errorText = (err) => (typeof err === 'string' ? err : err?.message || String(err));

// "Restart All Databases": bulk stop, then bulk start, of the same list —
// each phase isolates its own per-database failures (same endpoints and HA
// rule as Start/Stop All). Failures are tagged with their phase; a database
// skipped in both phases is listed once.
//
// If the stop request itself fails (e.g. the response was lost), the server
// may still have stopped some or all of them, so the stop failure is
// reported only for those a fresh status read shows still running, or for
// all of them if it can't be read. Only the databases that read shows as
// stopped are started again — startdb on a running database is an error
// ("already running"), not a no-op — so a restart never leaves a stopped
// database down and never reports a database twice.
export async function restartDatabasesInBulk(dispatch, hostUid, dbnames) {
  if (dbnames.length === 0) return { failed: [], skipped: [] };
  let stopResult;
  try {
    stopResult = await dispatch(stopAllDatabases({ hostUid, dbnames })).unwrap();
  } catch (err) {
    const stillActive = await readActiveDbnames(dispatch, hostUid);
    const error = errorText(err);
    stopResult = {
      failed: dbnames.filter((d) => !stillActive || stillActive.has(d)).map((dbname) => ({ dbname, error })),
      skipped: [],
    };
  }
  const activeAfterStop = await readActiveDbnames(dispatch, hostUid);
  const toStart = activeAfterStop ? dbnames.filter((d) => !activeAfterStop.has(d)) : dbnames;
  const startResult = toStart.length > 0
    ? await dispatch(startAllDatabases({ hostUid, dbnames: toStart })).unwrap()
    : { succeeded: [], failed: [], skipped: [] };
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

// Start/Stop/Restart All Databases on `dbnames`, the targets planned from the
// start-info read made when the confirm opened (planLoginCheckedAction).
export async function runAllDatabasesAction(dispatch, hostUid, action, dbnames) {
  if (action === 'restart') return restartDatabasesInBulk(dispatch, hostUid, dbnames);
  const thunk = action === 'start' ? startAllDatabases : stopAllDatabases;
  return dispatch(thunk({ hostUid, dbnames })).unwrap();
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
  for (const { dbname, ...failure } of failed) {
    if (!byDb.has(dbname)) byDb.set(dbname, []);
    byDb.get(dbname).push(failure);
  }
  return [...byDb].map(([dbname, reasons]) => ({ dbname, reasons }));
}

// Result dialog payload (showStatusModal) for Start/Stop/Restart All: a
// short headline plus tables — failures (grouped per database, with the
// stop/start phase for a restart) and skipped HA databases kept apart.
// null when every database succeeded.
export function bulkResultStatusModal(CM, {
  title, failedMsg, failed = [], skipped = [], showPhase = false,
  nameLabel = CM.database, skippedMsg = CM.someDatabasesSkippedMsg,
}) {
  const grouped = groupBulkFailures(failed || []);
  const skippedList = skipped || [];
  if (grouped.length === 0 && skippedList.length === 0) return null;
  const phaseLabel = { stop: CM.bulkRestartPhaseStop, start: CM.bulkRestartPhaseStart };
  const tables = [];
  if (grouped.length > 0) {
    tables.push({
      title: CM.failureTableFailedTitle,
      nameLabel,
      showPhase,
      variant: 'failed',
      testId: 'bulk-failed-table',
      rows: grouped.map(({ dbname, reasons }) => ({
        name: dbname === HA_NODE_STEP ? CM.haNodeStepName : dbname,
        reasons: reasons.map((r) => ({ phase: phaseLabel[r.phase] ?? r.phase, reason: failureText({ dbname, ...r }, CM) })),
      })),
    });
  }
  if (skippedList.length > 0) {
    tables.push({
      title: CM.failureTableSkippedTitle,
      nameLabel,
      variant: 'skipped',
      testId: 'bulk-skipped-table',
      rows: skippedList.map((sk) => ({ name: sk.dbname, reasons: [{ reason: CM.bulkSkipReasonLabel?.(sk.reason) ?? sk.reason }] })),
    });
  }
  return {
    type: grouped.length > 0 ? 'error' : 'info',
    title,
    message: [
      grouped.length > 0 ? failedMsg(grouped.length) : '',
      skippedList.length > 0 ? skippedMsg(skippedList.length) : '',
    ].filter(Boolean).join(' '),
    tables,
  };
}

// Skipped-databases table for a service start/stop/restart result. The
// server sent these nothing, so each is still as it was: `action` 'stop'
// leaves them running, 'start' leaves them stopped; a restart's `phase` says
// which step skipped it.
export function serviceSkippedTable(CM, skipped, action) {
  const state = (phase) => {
    if (phase === 'stop' || action === 'stop') return CM.skippedStillRunning;
    if (action === 'restart') return CM.skippedStoppedNotStarted;
    return CM.skippedNotStarted;
  };
  return {
    title: CM.failureTableSkippedTitle,
    nameLabel: CM.database,
    variant: 'skipped',
    testId: 'service-skipped-table',
    rows: (skipped || []).map(({ name, reason, phase }) => ({
      name,
      reasons: [{ reason: `${CM.bulkSkipReasonLabel?.(reason) ?? reason} · ${state(phase)}` }],
    })),
  };
}
