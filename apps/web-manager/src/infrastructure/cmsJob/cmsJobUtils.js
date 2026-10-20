import { resolveCmsJobStatus } from '../../features/database/databaseJobApi';

/** A failed status request cannot establish that an accepted command failed. */
export function getCmsJobErrorResult(error, lastKnownJob = {}, previewJob = {}) {
  const job = { ...previewJob, ...lastKnownJob, ...error?.lastKnownJob, ...error?.job };
  const confirmedFailure = resolveCmsJobStatus(error?.job) === 'failed';
  const outcomeUnknown = !confirmedFailure && Boolean(error?.jobStatusUnavailable || job.jobId);
  return {
    ...job,
    jobId: job.jobId ?? error?.jobId,
    maintenanceSummary: job.maintenanceSummary ?? previewJob.maintenanceSummary,
    jobStatus: outcomeUnknown ? (resolveCmsJobStatus(job) || 'queued') : 'failed',
    outcomeUnknown,
    error: confirmedFailure && job.error ? job.error : { message: error?.message || (typeof error === 'string' ? error : undefined) },
  };
}

export function normalizeTrackedJob(serverJob, fallback = {}) {
  const jobStatus =
    resolveCmsJobStatus(serverJob) ||
    fallback.jobStatus ||
    'queued';

  return {
    jobId: serverJob?.jobId ?? fallback.jobId,
    type: serverJob?.type ?? fallback.type,
    dbname: serverJob?.dbname ?? fallback.dbname ?? '',
    hostUid: serverJob?.hostUid ?? fallback.hostUid ?? '',
    jobStatus,
    // An authoritative server snapshot clears a previous connection warning.
    outcomeUnknown: serverJob?.outcomeUnknown ?? false,
    createdAt: serverJob?.createdAt ?? fallback.createdAt ?? new Date().toISOString(),
    startedAt: serverJob?.startedAt,
    finishedAt: serverJob?.finishedAt,
    maintenanceSummary: serverJob?.maintenanceSummary ?? fallback.maintenanceSummary,
    error: serverJob?.error ?? fallback.error,
    result: serverJob?.result,
    dismissed: fallback.dismissed ?? false,
  };
}

export function enqueueUniqueJobResult(results, result) {
  if (results.some((existing) => existing.jobId === result.jobId)) return results;
  return [...results, result];
}
