import apiClient from '../../api/apiClient';

const ACCEPTED = (status) => status === 202 || (status >= 200 && status < 300);

const JOB_LIFECYCLE_STATUSES = new Set(['queued', 'running', 'succeeded', 'failed']);

/**
 * Resolve job lifecycle status after apiClient envelope unwrap.
 */
export function resolveCmsJobStatus(job) {
  if (!job || typeof job !== 'object') return null;

  const lifecycle =
    (typeof job.jobStatus === 'string' && job.jobStatus) ||
    (typeof job.status === 'string' && JOB_LIFECYCLE_STATUSES.has(job.status) ? job.status : null);

  if (lifecycle && JOB_LIFECYCLE_STATUSES.has(lifecycle)) {
    return lifecycle;
  }

  if (job.finishedAt) {
    return job.error ? 'failed' : 'succeeded';
  }

  return null;
}

export function formatCmsJobError(job) {
  if (job?.error?.message) return job.error.message;
  return 'Job failed';
}

/** Align with api-server CMS long job timeout (default 12h). */
export const CMS_JOB_LONG_TIMEOUT_MS = 12 * 60 * 60 * 1000;

/** Submit returns 202 immediately — 30s is generous for a queue enqueue. */
const JOB_SUBMIT_TIMEOUT_MS = 30_000;
/** Per status poll; each GET /jobs/:id should return quickly. */
const JOB_POLL_TIMEOUT_MS = 120_000;

const submitJob = (url, payload) =>
  apiClient.post(url, payload, {
    validateStatus: ACCEPTED,
    timeout: JOB_SUBMIT_TIMEOUT_MS,
  });

export const databaseJobApi = {
  getJob: async (jobId) => {
    const job = await apiClient.get(`/jobs/${jobId}`, { timeout: JOB_POLL_TIMEOUT_MS });
    const resolved = resolveCmsJobStatus(job);
    return resolved ? { ...job, jobStatus: resolved } : job;
  },

  listActive: () => apiClient.get('/jobs/active', { timeout: JOB_POLL_TIMEOUT_MS }),

  listRecent: () => apiClient.get('/jobs/recent', { timeout: JOB_POLL_TIMEOUT_MS }),

  submitUnload: (hostUid, dbname, payload) =>
    submitJob(`/${hostUid}/database/unload/${encodeURIComponent(dbname)}`, payload),

  submitLoad: (hostUid, dbname, payload) =>
    submitJob(`/${hostUid}/database/load/${encodeURIComponent(dbname)}`, payload),

  submitCreate: (hostUid, payload) =>
    submitJob(`/${hostUid}/database/create`, payload),

  submitOptimize: (hostUid, dbname, payload) =>
    submitJob(`/${hostUid}/database/optimize/${encodeURIComponent(dbname)}`, payload),

  submitCheck: (hostUid, dbname, payload) =>
    submitJob(`/${hostUid}/database/check/${encodeURIComponent(dbname)}`, payload),

  submitCompact: (hostUid, dbname, payload) =>
    submitJob(`/${hostUid}/database/compact/${encodeURIComponent(dbname)}`, payload),

  submitCopy: (hostUid, payload) =>
    submitJob(`/${hostUid}/database/copy`, payload),

  submitAddVol: (hostUid, dbname, payload) =>
    submitJob(`/${hostUid}/database/add-vol/${encodeURIComponent(dbname)}`, payload),

  submitRename: (hostUid, dbname, payload) =>
    submitJob(`/${hostUid}/database/rename/${encodeURIComponent(dbname)}`, payload),

  submitBackup: (hostUid, dbname, payload) =>
    submitJob(`/${hostUid}/database/backup-db/${encodeURIComponent(dbname)}`, payload),

  submitRestore: (hostUid, dbname, payload) =>
    submitJob(`/${hostUid}/database/restore-db/${encodeURIComponent(dbname)}`, payload),
};

const POLL_MAX_RETRIES = 3;
const POLL_MIN_INTERVAL_MS = 2_000;
const POLL_MAX_INTERVAL_MS = 30_000;

/**
 * Compute next poll interval using exponential back-off based on elapsed time.
 * Starts at POLL_MIN_INTERVAL_MS and doubles every ~5 minutes up to POLL_MAX_INTERVAL_MS.
 */
function adaptiveInterval(startedAt) {
  const elapsed = Date.now() - startedAt;
  const steps = Math.floor(elapsed / (5 * 60 * 1000));
  const interval = POLL_MIN_INTERVAL_MS * Math.pow(2, steps);
  return Math.min(interval, POLL_MAX_INTERVAL_MS);
}

/**
 * Poll until job reaches succeeded or failed.
 * - Interval adapts: starts at 2s, backs off to 30s over time.
 * - Transient network errors are retried up to POLL_MAX_RETRIES times before
 *   the poll is rejected.
 * @returns {{ promise: Promise<object>, cancel: () => void }}
 */
export function pollCmsJob(jobId, { onUpdate } = {}) {
  let cancelled = false;
  let timerId = null;
  let consecutiveErrors = 0;
  let lastKnownJob = null;
  const pollStartedAt = Date.now();

  const cancel = () => {
    cancelled = true;
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const promise = new Promise((resolve, reject) => {
    const finish = (fn, value) => {
      cancel();
      fn(value);
    };

    const tick = async () => {
      if (cancelled) return;
      try {
        const job = await databaseJobApi.getJob(jobId);
        if (cancelled) return;
        lastKnownJob = job;
        consecutiveErrors = 0;
        if (onUpdate) {
          try {
            onUpdate(job);
          } catch {
            // Consumer unmounted (e.g. modal closed) — keep polling.
          }
        }

        const status = resolveCmsJobStatus(job);
        if (status === 'succeeded') {
          finish(resolve, job);
          return;
        }
        if (status === 'failed') {
          const terminalErr = new Error(formatCmsJobError(job));
          terminalErr.jobTerminalFailure = true;
          terminalErr.job = job;
          finish(reject, terminalErr);
          return;
        }

        timerId = setTimeout(tick, adaptiveInterval(pollStartedAt));
      } catch (err) {
        consecutiveErrors += 1;
        if (consecutiveErrors >= POLL_MAX_RETRIES) {
          const statusError = new Error(err?.message || String(err));
          statusError.jobStatusUnavailable = true;
          statusError.jobId = jobId;
          statusError.lastKnownJob = lastKnownJob;
          finish(reject, statusError);
          return;
        }
        // Transient error — retry after normal interval.
        timerId = setTimeout(tick, adaptiveInterval(pollStartedAt));
      }
    };
    tick();
  });

  return { promise, cancel };
}
