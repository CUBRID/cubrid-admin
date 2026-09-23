import React, { useEffect, useState } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { Icon } from '../../components/ds/foundation/Icon';
import { Typography } from '../../components/ds/foundation/Typography';
import { Modal } from '../../components/ds/layout/Modal';
import { useCM } from '../../constants/useCM';
import { stripHaRoleTagFromAlias } from '../../features/host/hostGroupUtils';
import {
  getCmsJobTypeLabel,
  getCmsJobStatusLabel,
  isTerminalCmsJobStatus,
} from './cmsJobLabels';

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function useElapsedTime(startedAt, active) {
  const [elapsed, setElapsed] = useState(() =>
    startedAt ? Date.now() - Date.parse(startedAt) : 0
  );
  useEffect(() => {
    if (!active || !startedAt) return;
    const id = setInterval(() => {
      setElapsed(Date.now() - Date.parse(startedAt));
    }, 1000);
    return () => clearInterval(id);
  }, [active, startedAt]);
  return elapsed;
}

function StatusBadge({ status, CM }) {
  const base = 'text-11 font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full';
  if (status === 'succeeded') {
    return (
      <span className={`${base} bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300`}>
        {getCmsJobStatusLabel(status, CM)}
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className={`${base} bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300`}>
        {getCmsJobStatusLabel(status, CM)}
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span className={`${base} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200`}>
        {getCmsJobStatusLabel(status, CM)}
      </span>
    );
  }
  return (
    <span className={`${base} bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300`}>
      {getCmsJobStatusLabel(status, CM)}
    </span>
  );
}

function formatTimestamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function DetailRow({ label, value, mono = false }) {
  return (
    <>
      <span className="text-13 text-slate-400 dark:text-slate-500">{label}</span>
      <span className={`text-14 text-slate-700 dark:text-slate-200 truncate ${mono ? 'font-mono tabular-nums' : ''}`}>
        {value ?? '—'}
      </span>
    </>
  );
}

function JobDetailModal({ job, CM, hostLabel, onClose }) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={getCmsJobTypeLabel(job.type, CM)}
      icon="pending_actions"
      maxWidth="480px"
      testId="job-detail"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-2 items-center">
          <DetailRow label={CM.server} value={hostLabel} />
          <DetailRow label={CM.database} value={job.dbname} />
          <span className="text-13 text-slate-400 dark:text-slate-500">{CM.status}</span>
          <div><StatusBadge status={job.jobStatus} CM={CM} /></div>
          <DetailRow label={CM.created} value={formatTimestamp(job.createdAt)} mono />
          {job.startedAt && <DetailRow label={CM.started} value={formatTimestamp(job.startedAt)} mono />}
          {job.finishedAt && <DetailRow label={CM.finished} value={formatTimestamp(job.finishedAt)} mono />}
        </div>
        {job.error?.message && (
          <div>
            <div className="text-13 text-slate-400 dark:text-slate-500 mb-1">{CM.error}</div>
            <pre className="whitespace-pre-wrap break-all bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg px-2.5 py-2 font-mono text-13 max-h-40 overflow-y-auto">
              {job.error.message}
            </pre>
          </div>
        )}
        {job.result != null && (
          <div>
            <div className="text-13 text-slate-400 dark:text-slate-500 mb-1">{CM.result}</div>
            <pre className="whitespace-pre-wrap break-all bg-slate-100 dark:bg-white/5 rounded-lg px-2.5 py-2 font-mono text-13 max-h-40 overflow-y-auto">
              {typeof job.result === 'string' ? job.result : JSON.stringify(job.result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </Modal>
  );
}

function JobRow({ job, CM, hostLabel, onSelect, onDismiss }) {
  const isActive = job.jobStatus === 'queued' || job.jobStatus === 'running';
  const op = getCmsJobTypeLabel(job.type, CM);
  const anchorAt = job.startedAt || job.createdAt;
  const elapsed = useElapsedTime(anchorAt, isActive);

  return (
    <li className="border-b border-slate-100 dark:border-white/5 last:border-0">
      <div
        className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-slate-100/60 dark:hover:bg-white/5"
        onClick={() => onSelect(job.jobId)}
      >
        <div className="mt-0.5 shrink-0">
          {isActive ? (
            <Icon name="sync" className="text-amber-500 animate-spin" size="sm" weight={300} />
          ) : job.jobStatus === 'succeeded' ? (
            <Icon name="check_circle" className="text-green-500" size="sm" weight={300} />
          ) : (
            <Icon name="error" className="text-red-500" size="sm" weight={300} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <Typography variant="p" className="text-14 font-medium text-slate-800 dark:text-slate-100 truncate">
            {op}
          </Typography>
          <Typography variant="p" className="text-12 text-slate-500 dark:text-slate-400 truncate">
            {job.dbname ? (hostLabel ? `${job.dbname}(${hostLabel})` : job.dbname) : '—'}
          </Typography>
          {isActive && anchorAt && (
            <Typography variant="p" className="text-12 text-amber-600 dark:text-amber-400 tabular-nums">
              {formatElapsed(elapsed)}
            </Typography>
          )}
          {job.jobStatus === 'failed' && job.error?.message && (
            <Typography variant="p" className="text-12 text-red-600 dark:text-red-400 mt-0.5 line-clamp-2">
              {job.error.message}
            </Typography>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <StatusBadge status={job.jobStatus} CM={CM} />
          {isTerminalCmsJobStatus(job.jobStatus) && (
            <button
              type="button"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
              onClick={(e) => { e.stopPropagation(); onDismiss(job.jobId); }}
              aria-label={CM.close}
            >
              <Icon name="close" size="sm" weight={300} />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Background jobs strip — rendered at the bottom of the sidebar navigator.
 */
export function BackgroundJobsPanel({
  jobs,
  activeCount,
  expanded,
  onToggleExpanded,
  onDismiss,
  onClearCompleted,
}) {
  const CM = useCM();
  const { hosts } = useSelector((state) => state.host, shallowEqual);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const hasCompleted = jobs.some((j) => isTerminalCmsJobStatus(j.jobStatus));
  const selectedJob = jobs.find((j) => j.jobId === selectedJobId) || null;

  if (jobs.length === 0) {
    return null;
  }

  const hostLabelFor = (hostUid) => {
    const host = hosts.find((h) => h.uid === hostUid);
    if (!host) return null;
    return stripHaRoleTagFromAlias(host.alias || host.id) || host.id;
  };

  return (
    <section
      className="flex-none w-full border-t border-slate-200 dark:border-white/5 bg-slate-50/90 dark:bg-black/25 flex flex-col shrink-0 max-h-[min(40vh,240px)]"
      role="region"
      aria-label={CM.backgroundJobsTitle}
      id="sidebar-background-jobs"
    >
      <button
        type="button"
        onClick={onToggleExpanded}
        className="flex-none w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-100/80 dark:hover:bg-white/5 transition-colors"
      >
        <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 text-amber-500">
          <Icon
            name="chevron_right"
            size="xs"
            className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            weight={300}
          />
        </div>
        {activeCount > 0 ? (
          <Icon name="sync" className="text-amber-500 animate-spin shrink-0" size="sm" weight={300} />
        ) : (
          <Icon name="pending_actions" className="text-slate-400 shrink-0" size="sm" weight={300} />
        )}
        <Typography
          variant="caption"
          className="flex-1 min-w-0 font-bold text-13 uppercase tracking-widest text-slate-600 dark:text-slate-400 truncate text-left"
        >
          {CM.backgroundJobsTitle}
        </Typography>
        {activeCount > 0 && (
          <span className="text-12 font-semibold text-amber-600 dark:text-amber-400 shrink-0">
            {CM.backgroundJobsRunning(activeCount)}
          </span>
        )}
      </button>

      {expanded && (
        <>
          {hasCompleted && (
            <div className="flex-none px-3 pb-1 flex justify-end">
              <button
                type="button"
                onClick={onClearCompleted}
                className="text-12 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                {CM.clearCompletedJobs}
              </button>
            </div>
          )}
          <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {jobs.map((job) => (
              <JobRow
                key={job.jobId}
                job={job}
                CM={CM}
                hostLabel={hostLabelFor(job.hostUid)}
                onSelect={setSelectedJobId}
                onDismiss={onDismiss}
              />
            ))}
          </ul>
        </>
      )}

      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          CM={CM}
          hostLabel={hostLabelFor(selectedJob.hostUid)}
          onClose={() => setSelectedJobId(null)}
        />
      )}
    </section>
  );
}
