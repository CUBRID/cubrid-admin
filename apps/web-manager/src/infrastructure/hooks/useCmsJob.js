import { useCallback, useEffect, useRef } from 'react';
import { cancelCmsJobPoll } from '../services/cmsJobRunner';
import { useCmsJobs } from '../context/CmsJobContext';

/**
 * Run a CMS background job: submit (202 + jobId) then poll until done.
 * Tracking, toasts, and the bottom-left panel are handled by CmsJobProvider.
 * sharedResult keeps the provider's result popup for foreground jobs too;
 * callers using it must close their operation dialog when the job settles.
 */
export function useCmsJob({ cancelOnUnmount = false, sharedResult = false } = {}) {
  const { runJob: contextRunJob, dismissJobResult } = useCmsJobs();
  const jobIdRef = useRef(null);
  // Tracks whether the component that owns this hook instance is still
  // mounted when the job settles — but these modals are always mounted and
  // just self-gate on `return null` when closed (see App.jsx), so this alone
  // never goes false while the app is open.
  const isMountedRef = useRef(true);

  // background() must only affect the specific runJob() call that's
  // currently showing loading UI — NOT any other still-in-flight call from
  // a job the user previously backgrounded and moved on from. These modals
  // are singletons reused for the next database the user opens the same
  // modal for, so a backgrounded job (e.g. addvoldb on "demodb") can still
  // be polling when the user opens the same modal again for a different
  // database ("test2") and starts a second runJob() call. A single shared
  // "backgrounded" boolean would get reset by that second call and corrupt
  // the first call's own result once IT settles later. So each runJob()
  // invocation gets its own flag object; currentFlagRef always points at
  // the most recent one, which is the only one background() can reach.
  const currentFlagRef = useRef(null);
  // Set the instant a specific invocation's job settles, and read by
  // wasBackgrounded() in the very next synchronous line after `await
  // runJob(...)` — safe because nothing else can run in between a promise
  // settling and its awaiter's next statement.
  const lastSettledBackgroundedRef = useRef(false);

  useEffect(
    () => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
        if (cancelOnUnmount && jobIdRef.current) {
          cancelCmsJobPoll(jobIdRef.current);
          jobIdRef.current = null;
        }
      };
    },
    [cancelOnUnmount]
  );

  const runJob = useCallback(
    async (submitFn, options = {}) => {
      const backgroundedFlag = { current: false };
      currentFlagRef.current = backgroundedFlag;

      let capturedJobId = null;
      const wrappedSubmit = async () => {
        const created = await submitFn();
        const jobId = created?.jobId;
        if (!jobId) {
          throw new Error('Server did not return a job id');
        }
        jobIdRef.current = jobId;
        capturedJobId = jobId;
        return created;
      };

      try {
        const result = await contextRunJob(wrappedSubmit, options);
        lastSettledBackgroundedRef.current = backgroundedFlag.current;
        if (!sharedResult && isMountedRef.current && !backgroundedFlag.current) dismissJobResult(capturedJobId);
        return result;
      } catch (err) {
        lastSettledBackgroundedRef.current = backgroundedFlag.current;
        if (!sharedResult && isMountedRef.current && !backgroundedFlag.current) dismissJobResult(capturedJobId);
        throw err;
      } finally {
        jobIdRef.current = null;
      }
    },
    [contextRunJob, dismissJobResult, sharedResult]
  );

  const cancel = useCallback(() => {
    if (jobIdRef.current) {
      cancelCmsJobPoll(jobIdRef.current);
      jobIdRef.current = null;
    }
  }, []);

  // Call from the modal's onBackground handler — marks the currently
  // in-flight job (the most recent runJob() call) so its completion isn't
  // suppressed from the global toast/JobResultModal.
  const background = useCallback(() => {
    if (currentFlagRef.current) currentFlagRef.current.current = true;
  }, []);

  // Callers must check this immediately after `await runJob(...)` settles,
  // before acting on the result (e.g. calling their own endSuccess()/
  // endError()) — see currentFlagRef's comment above for why a single
  // shared flag isn't enough. Without this check, a job that was
  // backgrounded (modal closed, job left running) still resolves this same
  // runJob() call later, and the modal would flip back to its success/error
  // view using whatever database is *currently* selected — not the one this
  // specific job actually ran against.
  const wasBackgrounded = useCallback(() => lastSettledBackgroundedRef.current, []);

  return { runJob, cancel, background, wasBackgrounded };
};
