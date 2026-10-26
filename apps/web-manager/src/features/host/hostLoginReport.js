// FailureTable props for a host batch login's failures (loginHostsBatch's
// `failed`, each `{ name, reason }`), for showStatusModal's `tables`.
// null when nothing failed.
export function hostLoginFailureTables(CM, failed) {
  if (!failed || failed.length === 0) return null;
  return [{
    title: CM.failureTableFailedTitle,
    nameLabel: CM.host,
    variant: 'failed',
    testId: 'login-failed-table',
    rows: failed.map((f) => ({ name: f.name, reasons: [{ reason: f.reason }] })),
  }];
}
