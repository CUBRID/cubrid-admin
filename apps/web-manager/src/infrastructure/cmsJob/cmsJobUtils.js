import { resolveCmsJobStatus } from '../../features/database/databaseJobApi';

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
    createdAt: serverJob?.createdAt ?? fallback.createdAt ?? new Date().toISOString(),
    startedAt: serverJob?.startedAt,
    finishedAt: serverJob?.finishedAt,
    maintenanceSummary: serverJob?.maintenanceSummary ?? fallback.maintenanceSummary,
    error: serverJob?.error ?? fallback.error,
    result: serverJob?.result,
    dismissed: fallback.dismissed ?? false,
  };
}
