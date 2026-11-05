import { useState } from 'react';
import { Table } from '../../../components/ds/layout/Table';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';
import { compactLogLines, parseCompactLog } from '../compactLogParse';

const PASSES = [1, 2, 3];
const num = (value) => <span className="font-mono text-14 tabular-nums">{value ?? '—'}</span>;

/**
 * Verbose compact output (Space Monitoring Details) as one table per pass:
 * pass 1 counts objects per class, passes 2 and 3 give each class's result.
 * A class with failed objects stands out. The output as CMS returned it
 * stays one click away.
 */
export default function CompactResultView({ log }) {
  const CM = useCM();
  const lines = compactLogLines(log);
  const parsed = parseCompactLog(lines);
  const [pass, setPass] = useState(1);
  const [showRaw, setShowRaw] = useState(false);
  if (!lines.some((line) => String(line ?? '').trim())) return null;

  // Engine sentences in the UI language where there is a translation.
  const sentence = (text) => CM.compactLogMessages?.[text] ?? text;
  const failedClasses = parsed ? parsed.passes[1].filter((row) => row.failed > 0).length : 0;

  const nameColumn = {
    header: CM.compactClassCol,
    accessor: 'name',
    render: (name, row) => (
      <div className="min-w-0">
        <span className={`font-mono text-14 break-all ${row.failed > 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}`}>
          {row.failed > 0 && <Icon name="error" size="14px" className="mr-1 align-[-2px]" />}
          {name}
        </span>
        {pass === 1 && row.messages.map((m) => (
          <div key={m} className="text-12 text-rose-500 mt-0.5">{sentence(m)}</div>
        ))}
      </div>
    ),
  };
  const columns = pass === 1
    ? [
      nameColumn,
      { header: CM.compactTotalCol, accessor: 'total', align: 'right', render: num },
      {
        header: CM.compactFailedCol,
        accessor: 'failed',
        align: 'right',
        render: (value) => (
          <span className={`font-mono text-14 tabular-nums ${value > 0 ? 'px-1.5 py-0.5 rounded-sm bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold' : ''}`}>
            {value ?? '—'}
          </span>
        ),
      },
      { header: CM.compactModifiedCol, accessor: 'modified', align: 'right', render: num },
      { header: CM.compactBigCol, accessor: 'big', align: 'right', render: num },
    ]
    : [
      nameColumn,
      { header: CM.result, accessor: 'messages', render: (messages) => messages.map(sentence).join(' ') || '—' },
    ];

  return (
    <div data-testid="compact-result" className="w-full px-6 text-left space-y-3">
      {parsed && (
        <>
          {failedClasses > 0 && (
            <div data-testid="compact-result-failed" className="flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-500/20 bg-rose-500/5 text-13 font-medium text-rose-600 dark:text-rose-400">
              <Icon name="error" size="16px" />
              {CM.compactFailedClassesMsg(failedClasses)}
            </div>
          )}
          <div role="tablist" className="flex gap-1">
            {PASSES.map((n) => (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={pass === n}
                data-testid={`compact-result-pass-${n}`}
                onClick={() => setPass(n)}
                className={`px-3 h-8 rounded-lg text-13 font-semibold transition-colors ${pass === n
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent'}`}
              >
                {CM.compactPassLabel(n)} ({parsed.passes[n].length})
              </button>
            ))}
          </div>
          <div className="border border-slate-200 dark:border-white/10 rounded-lg overflow-hidden">
            <Table
              columns={columns}
              data={parsed.passes[pass].map((row, i) => ({ ...row, rowKey: `${pass}:${i}` }))}
              maxRows={10}
              showEmptyStateAsRow
              emptyMessage={CM.noDataAvailableMsg}
            />
          </div>
          {parsed.notes.length > 0 && (
            <ul className="text-12 text-slate-500 list-disc pl-5">
              {parsed.notes.map((note) => <li key={note}>{sentence(note)}</li>)}
            </ul>
          )}
        </>
      )}
      <div>
        <button
          type="button"
          data-testid="compact-result-raw-toggle"
          onClick={() => setShowRaw((v) => !v)}
          className="inline-flex items-center gap-1 text-13 font-semibold text-slate-500 hover:text-amber-600"
        >
          <Icon name={showRaw ? 'expand_less' : 'expand_more'} size="16px" />
          {showRaw ? CM.hideRawOutput : CM.showRawOutput}
        </button>
        {(showRaw || !parsed) && (
          <pre data-testid="compact-result-raw" className="mt-2 max-h-60 overflow-auto custom-scrollbar rounded-lg bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 p-3 text-12 font-mono whitespace-pre-wrap break-all text-slate-600 dark:text-slate-300">
            {lines.join('\n').trim()}
          </pre>
        )}
      </div>
    </div>
  );
}
