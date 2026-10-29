import { createTopSQLAccumulator } from './logParsingUtils';

const CHUNK_SIZE = 1000;

// Fix the scope to the first response's line count: appends cannot make this
// read run forever. Retain only aggregate statistics and the pending execution.
export async function analyzeTopSQL(readLog, { signal } = {}) {
  const accumulator = createTopSQLAccumulator();
  let total;
  let start = 1;
  do {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const end = total === undefined ? CHUNK_SIZE : Math.min(total, start + CHUNK_SIZE - 1);
    const response = await readLog({ start: String(start), end: String(end) });
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const available = Number(response?.total);
    if (response?.total == null || response.total === '' || !Number.isSafeInteger(available) || available < 0) throw new Error('LOG_INCOMPLETE');
    if (total === undefined) total = available;
    if (available < total) throw new Error('LOG_CHANGED');
    const lines = (response.log || []).flatMap(group => group.line || []);
    if (!lines.every(line => typeof line === 'string')) throw new Error('LOG_INCOMPLETE');
    const expected = Math.max(0, Math.min(CHUNK_SIZE, total - start + 1));
    if (lines.length !== expected) throw new Error('LOG_INCOMPLETE');
    accumulator.addLines(lines);
    start += lines.length;
  } while (start <= total);
  return { rows: accumulator.finish(), total };
}
