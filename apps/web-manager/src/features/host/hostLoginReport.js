// Result dialog payload (showStatusModal) for a host batch login — Sidebar
// "Login All" / "Login Selected" and Hosts → Import → "Login All". One
// dialog for the whole batch: a short headline plus one Host | Result |
// Reason | HA follow-up table. HA modals deferred by loginHostsBatch's
// collect mode are offered per host from the HA follow-up column (see
// StatusModal) instead of popping up one after another mid-batch.
//
// `batch` is loginHostsBatch's result; `leadMessages` are extra headline
// sentences the caller puts first (e.g. the import flow's password saves).
// Returns null when there is nothing to report.
export function hostLoginResultStatusModal(CM, { title, batch, leadMessages = [] }) {
  const results = batch?.results || [];
  const successCount = batch?.successCount || 0;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const followUpCount = results.filter((r) => r.followUp).length;
  const attempted = results.some((r) => r.status !== 'skipped');

  const message = [
    ...leadMessages,
    attempted ? CM.connectedHostsMsg(successCount) : '',
    failedCount > 0 ? CM.hostsFailedToLoginMsg(failedCount) : '',
    followUpCount > 0 ? CM.haFollowUpsPendingMsg(followUpCount) : '',
  ].filter(Boolean).join(' ');
  if (!message) return null;

  // Only worth a table when something needs attention.
  const needsTable = results.some((r) => r.status === 'failed' || r.followUp);
  const resultLabel = {
    connected: CM.hostLoginResultConnected,
    failed: CM.hostLoginResultFailed,
    skipped: CM.hostLoginResultSkipped,
  };
  let type = 'success';
  if (failedCount > 0 && successCount === 0) type = 'error';
  else if (failedCount > 0 || followUpCount > 0) type = 'info';

  return {
    type,
    title,
    message,
    tables: needsTable ? [{
      title: CM.hostLoginResultsTitle,
      nameLabel: CM.host,
      showResult: true,
      haFollowUps: true,
      variant: failedCount > 0 ? 'failed' : 'neutral',
      testId: 'login-result-table',
      rows: results.map((r) => ({
        uid: r.uid,
        name: r.name,
        result: resultLabel[r.status] ?? r.status,
        reasons: r.reason ? [{ reason: r.reason }] : [],
        followUp: r.followUp || null,
      })),
    }] : null,
  };
}

// Hosts → Import → "Login All": the same consolidated batch result, led by
// the password-save outcome; any save failure (or nothing saved) is an error.
export function importLoginAllStatusModal(CM, { savedCount, passwordSaveFailed = [], batch }) {
  const leadMessages = [];
  if (savedCount > 0) leadMessages.push(CM.passwordSavedCountMsg(savedCount));
  if (passwordSaveFailed.length > 0) leadMessages.push(CM.passwordNotSavedMsg(passwordSaveFailed.join(', ')));
  const report = hostLoginResultStatusModal(CM, { title: CM.loginAll, batch, leadMessages });
  if (!report) return null;
  const loginFailedOnly = (batch?.failed?.length ?? 0) > 0 && (batch?.successCount ?? 0) === 0;
  if (savedCount === 0 || passwordSaveFailed.length > 0 || loginFailedOnly) report.type = 'error';
  return report;
}
