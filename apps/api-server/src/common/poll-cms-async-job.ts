import { HostService } from '@host';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { isInvalidTokenError } from './decorators/handle-cms-token-errors.decorator';
import {
  CMS_ASYNC_JOB_FIRST_POLL_INTERVAL_MS,
  CMS_ASYNC_JOB_POLL_INTERVAL_MS,
  getLongJobCmsTimeoutMs,
} from '../cms-job/cms-job.constants';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls CMS's `gettaskstatus` for a task already known to be (or to have been)
 * running until it reaches a terminal state. Shared by `BaseService.executeAsyncCmsJobRequest`
 * (polling right after submitting the job) and `CmsJobService`'s startup orphan
 * recovery (re-attaching to a job whose original poller died with the process,
 * using the CMS uuid persisted on the job record) — both cases reduce to "poll
 * this uuid until it's done," just with a different starting response.
 *
 * Keeps polling through an invalid-token response instead of giving up: CMS
 * keeps the async task running/tracked under its own uuid independent of our
 * token, so as long as *some* poll before the deadline uses a valid token
 * (e.g. after anyone logs back in to this host), the job's real outcome can
 * still be recovered instead of permanently losing track of a CMS task that
 * may still be fine.
 */
export async function pollCmsAsyncJob(
  deps: { hostService: HostService; cmsClient: CmsHttpsClientService },
  userId: string,
  hostUid: string,
  task: string,
  initialResponse: any,
  options?: { onUuid?: (uuid: string) => void | Promise<void>; deadlineMs?: number }
): Promise<{ response: any; polls: number }> {
  let response = initialResponse;
  const timeoutMs = options?.deadlineMs ?? getLongJobCmsTimeoutMs();
  const deadline = Date.now() + timeoutMs;

  // Tracked separately from `response` (not read off it directly) because an
  // invalid-token response has no `uuid` field of its own — losing track of
  // it there would leave the next retry with nothing to ask `gettaskstatus`
  // about, even though CMS is still holding the actual task open.
  let currentUuid: unknown = response?.uuid;
  let uuidReported = false;
  const reportUuidIfNew = async () => {
    if (uuidReported || !currentUuid || !options?.onUuid) return;
    uuidReported = true;
    await options.onUuid(String(currentUuid));
  };
  await reportUuidIfNew();

  let polls = 0;
  while (response?.['job-status'] === 'running' || isInvalidTokenError(response)) {
    if (Date.now() > deadline) {
      throw new Error(`CMS async job for task "${task}" did not finish within ${timeoutMs}ms`);
    }
    await sleep(polls === 0 ? CMS_ASYNC_JOB_FIRST_POLL_INTERVAL_MS : CMS_ASYNC_JOB_POLL_INTERVAL_MS);
    polls += 1;
    // Re-read the host's token on every poll instead of caching it: CMS ties
    // a single token per dbmt user, so a relogin to this host anywhere else
    // while a long job (hours) is still polling would otherwise invalidate
    // whatever token was captured earlier and break tracking of a CMS job
    // that's actually still running fine.
    const host = await deps.hostService.findHostInternal(userId, hostUid);
    const url = `https://${host.address}:${host.port}/cm_api`;
    response = await deps.cmsClient.postAuthenticated<
      { task: string; token: string; uuid: unknown },
      any
    >(url, { task: 'gettaskstatus', token: host.token || '', uuid: currentUuid });
    if (response?.uuid) currentUuid = response.uuid;
    await reportUuidIfNew();
  }

  return { response, polls };
}
