/** Default max wait for CMS long-running tasks (unload/load/create/…). */
export const CMS_JOB_LONG_TIMEOUT_HOURS_DEFAULT = 12;

/** Delay between `gettaskstatus` polls while a CMS async job is still running. */
export const CMS_ASYNC_JOB_POLL_INTERVAL_MS = 3000;

/**
 * Delay before the FIRST `gettaskstatus` poll. Kept short so operations that finish
 * almost immediately (e.g. addvoldb) aren't stuck paying a full poll-interval's worth
 * of latency for no reason — CMS itself returns `job-status:"running"` right away now
 * that every request sends `async:"yes"`, even for work that would have completed well
 * within CMS's own http-timeout window under the old synchronous-wait behavior.
 */
export const CMS_ASYNC_JOB_FIRST_POLL_INTERVAL_MS = 500;

/** Cap on how many jobs `GET /jobs/recent` returns, matching the frontend's MAX_TRACKED. */
export const CMS_JOB_RECENT_LIST_LIMIT = 50;

export function getLongJobCmsTimeoutMs(): number {
  const hours = Number(
    process.env.CMS_JOB_LONG_TIMEOUT_HOURS ?? CMS_JOB_LONG_TIMEOUT_HOURS_DEFAULT
  );
  if (!Number.isFinite(hours) || hours <= 0) {
    return CMS_JOB_LONG_TIMEOUT_HOURS_DEFAULT * 60 * 60 * 1000;
  }
  return hours * 60 * 60 * 1000;
}
