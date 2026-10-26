import React, { useState } from 'react';
import { useCM } from '../../constants/useCM';
import { Button } from '../../components/ds/foundation/Button';
import { getMaintenanceRows, isMaintenanceJob } from './maintenanceDetailsUtils';

/** Shared by foreground completion, background notification, and restored job details. */
export function MaintenanceDetails({ job, preview = false }) {
  const CM = useCM();
  const [copyStatus, setCopyStatus] = useState(null);
  if (!isMaintenanceJob(job)) return null;
  const output = typeof job.result?.output === 'string' ? job.result.output : '';
  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };
  return (
    <section className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/3 p-4 text-left space-y-3" data-testid="maintenance-details">
      <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
        {preview ? CM.maintenancePreview : CM.maintenanceDetails}
      </h3>
      <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)] gap-x-3 gap-y-2 text-xs">
        {getMaintenanceRows(job, CM, preview).map(([label, value]) => (
          <React.Fragment key={label}>
            <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="text-slate-800 dark:text-slate-200 break-words min-w-0">{value}</dd>
          </React.Fragment>
        ))}
      </dl>
      {!preview && output && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">{CM.maintenanceOutput}</span>
            <Button variant="secondary" size="sm" onClick={copyOutput}>{CM.maintenanceCopyOutput}</Button>
          </div>
          <pre className="whitespace-pre-wrap break-words max-h-48 overflow-y-auto rounded-lg bg-slate-100 dark:bg-black/20 p-3 text-xs text-slate-700 dark:text-slate-200 font-mono">{output}</pre>
          {copyStatus && <p role="status" className="text-xs text-slate-500">{copyStatus === 'copied' ? CM.maintenanceOutputCopied : CM.maintenanceCopyFailed}</p>}
        </div>
      )}
    </section>
  );
}
