import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { databaseJobApi } from '../../features/database/databaseJobApi';
import { runCmsJobInBackground, isCmsJobPolling, cancelAllCmsJobPolls } from '../services/cmsJobRunner';
import { JobResultModal } from '../cmsJob/JobResultModal';
import { isTerminalCmsJobStatus } from '../cmsJob/cmsJobLabels';
import { normalizeTrackedJob } from '../cmsJob/cmsJobUtils';

import { CmsJobContext } from './cmsJobContextValue';

const MAX_TRACKED = 50;

function sortJobs(a, b) {
  const ta = a.createdAt || '';
  const tb = b.createdAt || '';
  return tb.localeCompare(ta);
}

export function CmsJobProvider({ children }) {
  const { isAuthenticated } = useSelector((state) => state.auth, shallowEqual);
  const [jobs, setJobs] = useState([]);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [jobResults, setJobResults] = useState([]);
  const trackingRef = useRef(new Set());
  // Incremented on logout so in-flight continuations that already have a terminal
  // result cannot enqueue a JobResultModal for the next session.
  const sessionRef = useRef(0);

  const upsertJob = useCallback((jobId, patch) => {
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j.jobId === jobId);
      const next =
        idx >= 0
          ? { ...prev[idx], ...patch, jobId }
          : { jobId, dismissed: false, ...patch };
      const list = idx >= 0 ? prev.map((j, i) => (i === idx ? next : j)) : [next, ...prev];
      return list.sort(sortJobs).slice(0, MAX_TRACKED);
    });
  }, []);

  const notifyTerminal = useCallback(
    (job, { notify, successMessage, errorMessage }, session) => {
      if (notify === false) return;
      if (job.jobStatus !== 'succeeded' && job.jobStatus !== 'failed') return;
      if (session !== sessionRef.current) return;
      setJobResults((prev) => [
        ...prev,
        {
          type: job.type,
          dbname: job.dbname,
          status: job.jobStatus,
          error: job.error,
          successMessage,
          errorMessage,
        },
      ]);
    },
    []
  );

  const startTracking = useCallback(
    async (jobId, options = {}) => {
      if (!jobId) {
        throw new Error('Job id is required');
      }
      const session = sessionRef.current;

      if (trackingRef.current.has(jobId) || isCmsJobPolling(jobId)) {
        return runCmsJobInBackground(jobId, {
          onUpdate: (serverJob) => {
            const normalized = normalizeTrackedJob(serverJob);
            upsertJob(jobId, normalized);
            if (options.onProgress) options.onProgress(serverJob);
          },
        });
      }

      trackingRef.current.add(jobId);
      const {
        onProgress,
        notify = true,
        successMessage,
        errorMessage,
        initialJob,
      } = options;

      const onUpdate = (serverJob) => {
        const normalized = normalizeTrackedJob(serverJob);
        upsertJob(jobId, normalized);
        if (onProgress) {
          try {
            onProgress(serverJob);
          } catch {
            // Modal closed — background tracking continues.
          }
        }
      };

      if (initialJob) {
        onUpdate(initialJob);
      } else {
        try {
          const snapshot = await databaseJobApi.getJob(jobId);
          onUpdate(snapshot);
        } catch {
          upsertJob(jobId, { jobStatus: 'queued' });
        }
      }

      const pollPromise = runCmsJobInBackground(jobId, { onUpdate });

      try {
        const result = await pollPromise;
        const final = normalizeTrackedJob(result);
        upsertJob(jobId, final);
        notifyTerminal(final, { notify, successMessage, errorMessage }, session);
        return result;
      } catch (err) {
        // Cancelled polls (logout / unmount) are not job failures — skip UI update and toast.
        if (err?.cancelled) {
          throw err;
        }
        setJobs((prev) => {
          const cur = prev.find((j) => j.jobId === jobId);
          const failed = normalizeTrackedJob(
            { ...(cur || {}), jobId, jobStatus: 'failed', error: { message: err?.message } },
            cur || {}
          );
          notifyTerminal(failed, { notify, successMessage, errorMessage }, session);
          return prev.map((j) => (j.jobId === jobId ? { ...j, ...failed } : j));
        });
        throw err;
      } finally {
        trackingRef.current.delete(jobId);
      }
    },
    [notifyTerminal, upsertJob]
  );

  const trackJob = useCallback(
    (jobId, options) => startTracking(jobId, options),
    [startTracking]
  );

  const runJob = useCallback(
    async (submitFn, options = {}) => {
      const created = await submitFn();
      const jobId = created?.jobId;
      if (!jobId) {
        throw new Error('Server did not return a job id');
      }
      return startTracking(jobId, options);
    },
    [startTracking]
  );

  const dismissJob = useCallback((jobId) => {
    setJobs((prev) =>
      prev.map((j) => (j.jobId === jobId ? { ...j, dismissed: true } : j))
    );
  }, []);

  const clearCompleted = useCallback(() => {
    setJobs((prev) => prev.filter((j) => !isTerminalCmsJobStatus(j.jobStatus)));
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      sessionRef.current += 1;
      cancelAllCmsJobPolls();
      setJobs([]);
      setJobResults([]);
      trackingRef.current.clear();
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const active = await databaseJobApi.listActive();
        if (cancelled) return;
        for (const job of active) {
          const status = normalizeTrackedJob(job).jobStatus;
          if (!isTerminalCmsJobStatus(status)) {
            upsertJob(job.jobId, normalizeTrackedJob(job));
            startTracking(job.jobId, {
              notify: true,
              initialJob: job,
            }).catch(() => {});
          }
        }
      } catch {
        // ignore — user may not have active jobs endpoint yet
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, startTracking, upsertJob]);

  const visibleJobs = useMemo(
    () => jobs.filter((j) => !j.dismissed),
    [jobs]
  );

  const activeCount = useMemo(
    () =>
      visibleJobs.filter(
        (j) => j.jobStatus === 'queued' || j.jobStatus === 'running'
      ).length,
    [visibleJobs]
  );

  useEffect(() => {
    if (activeCount > 0) {
      setPanelExpanded(true);
    }
  }, [activeCount]);

  const value = useMemo(
    () => ({
      jobs: visibleJobs,
      allJobs: jobs,
      activeCount,
      panelExpanded,
      setPanelExpanded,
      runJob,
      trackJob,
      dismissJob,
      clearCompleted,
    }),
    [
      visibleJobs,
      jobs,
      activeCount,
      panelExpanded,
      runJob,
      trackJob,
      dismissJob,
      clearCompleted,
    ]
  );

  return (
    <CmsJobContext.Provider value={value}>
      {children}
      {jobResults.length > 0 && (
        <JobResultModal
          result={jobResults[0]}
          onClose={() => setJobResults((prev) => prev.slice(1))}
        />
      )}
    </CmsJobContext.Provider>
  );
}
