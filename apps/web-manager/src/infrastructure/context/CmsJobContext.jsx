import React, {
  createContext,
  useCallback,
  useContext,
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

export const CmsJobContext = createContext(null);

const MAX_TRACKED = 50;
const MAX_DISMISSED = 200;
const DISMISSED_STORAGE_KEY = 'cubrid.dismissedCmsJobIds';

function readDismissedJobIds() {
  try {
    const stored = JSON.parse(localStorage.getItem(DISMISSED_STORAGE_KEY) || '[]');
    return new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function persistDismissedJobIds(ids) {
  try {
    const bounded = [...ids].slice(-MAX_DISMISSED);
    localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(bounded));
    return new Set(bounded);
  } catch {
    return ids;
  }
}

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
  // The API intentionally returns recently-finished jobs after reconnect so
  // users can see work that completed while the browser was closed. Keep the
  // user's explicit X/Clear choice separately so those jobs are not restored
  // into the tray on every reload.
  const dismissedJobIdsRef = useRef(readDismissedJobIds());
  // Incremented on logout so in-flight continuations that already have a terminal
  // result cannot enqueue a JobResultModal for the next session.
  const sessionRef = useRef(0);

  const upsertJob = useCallback((jobId, patch) => {
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j.jobId === jobId);
      const next =
        idx >= 0
          ? { ...prev[idx], ...patch, jobId }
          : { jobId, dismissed: dismissedJobIdsRef.current.has(jobId), ...patch };
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
          jobId: job.jobId,
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

  // Lets a caller that's still mounted and showing its own result (via
  // useCmsJob's runJob) suppress the global toast for that same job, so the
  // two don't both appear for one completion. If the caller already
  // unmounted (e.g. user clicked "continue in background"), this never gets
  // called and the global toast remains the only notification.
  const dismissJobResult = useCallback((jobId) => {
    if (!jobId) return;
    setJobResults((prev) => prev.filter((r) => r.jobId !== jobId));
  }, []);

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
    dismissedJobIdsRef.current.add(jobId);
    dismissedJobIdsRef.current = persistDismissedJobIds(dismissedJobIdsRef.current);
    setJobs((prev) => prev.flatMap((job) => {
      if (job.jobId !== jobId) return [job];
      // Finished jobs no longer need to occupy the bounded live-tracking list.
      // Keep only the persisted dismissal id so a recent-history restore does
      // not bring the item back after a reload.
      if (isTerminalCmsJobStatus(job.jobStatus)) return [];
      return [{ ...job, dismissed: true }];
    }));
  }, []);

  const clearCompleted = useCallback(() => {
    setJobs((prev) => {
      for (const job of prev) {
        if (isTerminalCmsJobStatus(job.jobStatus)) {
          dismissedJobIdsRef.current.add(job.jobId);
        }
      }
      dismissedJobIdsRef.current = persistDismissedJobIds(dismissedJobIdsRef.current);
      // Removing terminal rows prevents dismissed history from consuming the
      // MAX_TRACKED allowance and displacing a still-running older job.
      return prev.filter((job) => !isTerminalCmsJobStatus(job.jobStatus));
    });
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
        // Restore recent history so users can see work that finished while the
        // browser was closed. Explicitly dismissed ids remain hidden.
        const recent = await databaseJobApi.listRecent();
        if (cancelled) return;
        for (const job of recent) {
          if (dismissedJobIdsRef.current.has(job.jobId)) continue;
          const normalized = normalizeTrackedJob(job);
          upsertJob(job.jobId, normalized);
          if (!isTerminalCmsJobStatus(normalized.jobStatus)) {
            startTracking(job.jobId, {
              notify: true,
              initialJob: job,
            }).catch(() => undefined);
          }
        }
      } catch {
        // ignore — user may not have the jobs endpoint yet
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
      dismissJobResult,
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
      dismissJobResult,
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

export function useCmsJobs() {
  const ctx = useContext(CmsJobContext);
  if (!ctx) {
    throw new Error('useCmsJobs must be used within CmsJobProvider');
  }
  return ctx;
}
