import { useCallback, useEffect, useRef } from 'react';
import { cancelCmsJobPoll } from '../services/cmsJobRunner';
import { useCmsJobs } from '../hooks/useCmsJobs';

/**
 * Run a CMS background job: submit (202 + jobId) then poll until done.
 * Tracking, toasts, and the bottom-left panel are handled by CmsJobProvider.
 */
export function useCmsJob({ cancelOnUnmount = false } = {}) {
  const { runJob: contextRunJob } = useCmsJobs();
  const jobIdRef = useRef(null);

  useEffect(
    () => () => {
      if (cancelOnUnmount && jobIdRef.current) {
        cancelCmsJobPoll(jobIdRef.current);
        jobIdRef.current = null;
      }
    },
    [cancelOnUnmount]
  );

  const runJob = useCallback(
    async (submitFn, options = {}) => {
      const wrappedSubmit = async () => {
        const created = await submitFn();
        const jobId = created?.jobId;
        if (!jobId) {
          throw new Error('Server did not return a job id');
        }
        jobIdRef.current = jobId;
        return created;
      };

      try {
        return await contextRunJob(wrappedSubmit, options);
      } finally {
        jobIdRef.current = null;
      }
    },
    [contextRunJob]
  );

  const cancel = useCallback(() => {
    if (jobIdRef.current) {
      cancelCmsJobPoll(jobIdRef.current);
      jobIdRef.current = null;
    }
  }, []);

  return { runJob, cancel };
};
