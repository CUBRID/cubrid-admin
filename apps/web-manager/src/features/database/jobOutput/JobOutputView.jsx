import { useState } from 'react';
import { Table } from '../../../components/ds/layout/Table';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';
import { hasOutput } from './jobOutputLines';

/**
 * A job's output as figures and tables: a row of key figures on top (an
 * `alert` one in red), one table per section (tabs when there are several),
 * and the output as returned always one click away, open from the start
 * when nothing could be read from it (`parsed` false).
 *
 * @param {{ testId: string, lines: string[], parsed: boolean,
 *   summary?: { key: string, label: string, value: *, alert?: boolean }[],
 *   sections?: { key: string, label: string, columns: object[], rows: object[] }[],
 *   notes?: string[] }} props
 */
export default function JobOutputView({ testId, lines, parsed, summary = [], sections = [], notes = [] }) {
  const CM = useCM();
  const [active, setActive] = useState(0);
  const [showRaw, setShowRaw] = useState(false);
  if (!hasOutput(lines)) return null;
  const section = sections[Math.min(active, sections.length - 1)];

  return (
    <div data-testid={testId} className="w-full px-6 text-left space-y-3">
      {parsed && summary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.map((item) => (
            <div
              key={item.key}
              data-testid={`${testId}-summary-${item.key}`}
              className={`flex items-baseline gap-2 px-3 py-1.5 rounded-lg border text-13 ${item.alert
                ? 'border-rose-500/25 bg-rose-500/5 text-rose-600 dark:text-rose-400'
                : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/3 text-slate-600 dark:text-slate-300'}`}
            >
              <span className="font-medium">{item.label}</span>
              <span className="font-mono font-bold tabular-nums">{item.value}</span>
            </div>
          ))}
        </div>
      )}
      {parsed && sections.length > 1 && (
        <div role="tablist" className="flex gap-1">
          {sections.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={s === section}
              data-testid={`${testId}-section-${s.key}`}
              onClick={() => setActive(i)}
              className={`px-3 h-8 rounded-lg text-13 font-semibold transition-colors ${s === section
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent'}`}
            >
              {s.label} ({s.rows.length})
            </button>
          ))}
        </div>
      )}
      {parsed && section && section.rows.length > 0 && (
        <div className="border border-slate-200 dark:border-white/10 rounded-lg overflow-hidden">
          <Table
            columns={section.columns}
            data={section.rows.map((row, i) => ({ ...row, rowKey: `${section.key}:${i}` }))}
            maxRows={10}
          />
        </div>
      )}
      {parsed && notes.length > 0 && (
        <ul className="text-12 text-slate-500 list-disc pl-5">
          {notes.map((note, i) => <li key={`${i}:${note}`}>{note}</li>)}
        </ul>
      )}
      <div>
        {parsed && (
          <button
            type="button"
            data-testid={`${testId}-raw-toggle`}
            onClick={() => setShowRaw((v) => !v)}
            className="inline-flex items-center gap-1 text-13 font-semibold text-slate-500 hover:text-amber-600"
          >
            <Icon name={showRaw ? 'expand_less' : 'expand_more'} size="16px" />
            {showRaw ? CM.hideRawOutput : CM.showRawOutput}
          </button>
        )}
        {(showRaw || !parsed) && (
          <pre data-testid={`${testId}-raw`} className="mt-2 max-h-60 overflow-auto custom-scrollbar rounded-lg bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 p-3 text-12 font-mono whitespace-pre-wrap break-all text-slate-600 dark:text-slate-300">
            {lines.join('\n').trim()}
          </pre>
        )}
      </div>
    </div>
  );
}
