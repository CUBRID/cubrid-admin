import JobOutputView from '../jobOutput/JobOutputView';
import { engineSentence } from '../jobOutput/engineSentence';
import { jobOutputLines } from '../jobOutput/jobOutputLines';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';
import { parseCompactLog } from '../compactLogParse';

const num = (value) => <span className="font-mono text-14 tabular-nums">{value ?? '—'}</span>;

/**
 * Verbose compact output (Space Monitoring Details): the totals on top, then
 * a table per pass — pass 1 counts objects per class, passes 2 and 3 give
 * each class's result. A class with failed objects stands out.
 */
export default function CompactResultView({ log }) {
  const CM = useCM();
  const lines = jobOutputLines(log);
  const parsed = parseCompactLog(lines);
  const sentence = (text) => engineSentence(CM, text, { exact: 'compactLogMessages' });

  const pass1 = parsed?.passes[1] ?? [];
  const sum = (field) => pass1.reduce((total, row) => total + (row[field] ?? 0), 0);
  const failedClasses = pass1.filter((row) => row.failed > 0).length;
  const summary = [
    { key: 'classes', label: CM.compactSumClasses, value: pass1.length },
    { key: 'objects', label: CM.compactSumObjects, value: sum('total').toLocaleString() },
    { key: 'failedObjects', label: CM.compactSumFailedObjects, value: sum('failed').toLocaleString(), alert: sum('failed') > 0 },
    { key: 'failedClasses', label: CM.compactSumFailedClasses, value: failedClasses, alert: failedClasses > 0 },
  ];

  const nameColumn = (withMessages) => ({
    header: CM.compactClassCol,
    accessor: 'name',
    render: (name, row) => (
      <div className="min-w-0">
        <span className={`font-mono text-14 break-all ${row.failed > 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}`}>
          {row.failed > 0 && <Icon name="error" size="14px" className="mr-1 align-[-2px]" />}
          {name}
        </span>
        {withMessages && row.messages.map((m) => (
          <div key={m} className="text-12 text-rose-500 mt-0.5">{sentence(m)}</div>
        ))}
      </div>
    ),
  });
  const resultColumns = [
    nameColumn(false),
    { header: CM.result, accessor: 'messages', render: (messages) => messages.map(sentence).join(' ') || '—' },
  ];
  const sections = parsed ? [
    {
      key: 'pass-1',
      label: CM.compactPassLabel(1),
      rows: parsed.passes[1],
      columns: [
        nameColumn(true),
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
      ],
    },
    { key: 'pass-2', label: CM.compactPassLabel(2), rows: parsed.passes[2], columns: resultColumns },
    { key: 'pass-3', label: CM.compactPassLabel(3), rows: parsed.passes[3], columns: resultColumns },
  ] : [];

  return (
    <JobOutputView
      testId="compact-result"
      lines={lines}
      parsed={Boolean(parsed)}
      summary={summary}
      sections={sections}
      notes={(parsed?.notes ?? []).map(sentence)}
    />
  );
}
