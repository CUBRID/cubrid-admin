import JobOutputView from '../jobOutput/JobOutputView';
import { engineSentence } from '../jobOutput/engineSentence';
import { jobOutputLines } from '../jobOutput/jobOutputLines';
import { useCM } from '../../../constants/useCM';
import { parseLoadLog } from '../loadLogParse';

/**
 * loaddb output: the counts on top (failed ones in red), then the input lines
 * loaddb reported, each with its messages in the UI language.
 */
export default function LoadResultView({ log }) {
  const CM = useCM();
  const lines = jobOutputLines(log);
  const parsed = parseLoadLog(lines);
  const s = parsed?.summary ?? {};
  const summary = [
    s.inserted != null && { key: 'inserted', label: CM.loadSumInserted, value: s.inserted.toLocaleString() },
    s.checked != null && { key: 'checked', label: CM.loadSumChecked, value: s.checked.toLocaleString() },
    s.failed != null && { key: 'failed', label: CM.loadSumFailed, value: s.failed.toLocaleString(), alert: s.failed > 0 },
    s.errors != null && { key: 'errors', label: CM.loadSumErrors, value: s.errors.toLocaleString(), alert: s.errors > 0 },
    parsed?.rows.length > 0 && { key: 'lines', label: CM.loadSumProblemLines, value: new Set(parsed.rows.map((r) => r.line)).size, alert: true },
    s.lastCommittedLine != null && { key: 'lastCommitted', label: CM.loadSumLastCommitted, value: s.lastCommittedLine.toLocaleString() },
  ].filter(Boolean);
  const columns = [
    {
      header: CM.loadColLine,
      accessor: 'line',
      className: 'w-[90px]',
      render: (line) => <span className="font-mono text-14 tabular-nums font-bold text-rose-600 dark:text-rose-400">{line}</span>,
    },
    {
      header: CM.loadColMessage,
      accessor: 'message',
      cellClassName: 'wrap-anywhere',
      render: (message) => (
        <span className="text-14 text-rose-600 dark:text-rose-400">
          {engineSentence(CM, message, { exact: 'loadLogMessages', patterns: 'loadLogPatterns' })}
        </span>
      ),
    },
  ];
  return (
    <JobOutputView
      testId="load-result"
      lines={lines}
      parsed={Boolean(parsed)}
      summary={summary}
      sections={parsed ? [{ key: 'lines', label: CM.loadColLine, columns, rows: parsed.rows }] : []}
    />
  );
}
