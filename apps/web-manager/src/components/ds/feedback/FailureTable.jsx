import React from 'react';
import { useCM } from '../../../constants/useCM';

// Raw server messages are shown as-is, minus a leading "Error: " (or
// several) that adds nothing in a "Reason" column.
export const cleanFailureReason = (reason) => String(reason ?? '').replace(/^\s*(?:Error:\s*)+/i, '').trim();

const VARIANT_STYLES = {
  failed: { box: 'border-rose-500/20', head: 'bg-rose-500/5 text-rose-500' },
  skipped: { box: 'border-amber-500/20', head: 'bg-amber-500/5 text-amber-500' },
};

/**
 * Compact per-item outcome table for bulk-action result dialogs (e.g.
 * Start/Stop/Restart All Databases, host Login All). `rows` are
 * `{ name, reasons: [{ phase?, reason }] }` — a name with several reasons
 * (e.g. failed both to stop and to start) is listed once, spanning its rows.
 */
export const FailureTable = ({ title, nameLabel, rows = [], showPhase = false, variant = 'failed', testId }) => {
  const CM = useCM();
  if (rows.length === 0) return null;
  const styles = VARIANT_STYLES[variant] || VARIANT_STYLES.failed;
  return (
    <div className={`w-full text-left rounded-xl border overflow-hidden ${styles.box}`} data-testid={testId}>
      {title && (
        <div className={`px-3 py-1.5 text-11 font-semibold uppercase tracking-wide ${styles.head}`}>{title}</div>
      )}
      <div className="max-h-60 overflow-y-auto">
        <table className="w-full border-collapse text-12">
          <thead>
            <tr className="text-slate-400 dark:text-slate-500">
              <th className="px-3 py-1.5 font-semibold">{nameLabel}</th>
              {showPhase && <th className="px-3 py-1.5 font-semibold">{CM.failureTablePhase}</th>}
              <th className="px-3 py-1.5 font-semibold">{CM.failureTableReason}</th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap(({ name, reasons }) => reasons.map((r, idx) => (
              <tr key={`${name}-${idx}`} className="border-t border-slate-100 dark:border-white/5 align-top">
                {idx === 0 && (
                  <td rowSpan={reasons.length} className="px-3 py-1.5 font-semibold text-slate-700 dark:text-slate-200 break-all">
                    {name}
                  </td>
                )}
                {showPhase && <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.phase}</td>}
                <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300 break-words">{cleanFailureReason(r.reason)}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
