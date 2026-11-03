import { createTopSQLAccumulator } from './logParsingUtils';

const CHUNK_SIZE = 1000;

// Capture once: CMS has no file-version identifier for independent range reads.
// Analyze bounded local chunks of this response, never reopen the live path.
// NCA caps captures at 100,000 lines / 16 MiB before accepting a complete log.
export async function analyzeTopSQL(captureLog, { signal } = {}) {
  const checkCancelled = () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  };
  checkCancelled();
  const response = await captureLog();
  checkCancelled();
  const total = Number(response?.total);
  if (response?.total == null || response.total === '' || !Number.isSafeInteger(total) || total < 0) {
    throw new Error('LOG_INCOMPLETE');
  }
  const lines = (response.log || []).flatMap(group => group.line || []);
  if (lines.length !== total || !lines.every(line => typeof line === 'string')) throw new Error('LOG_INCOMPLETE');
  const accumulator = createTopSQLAccumulator();
  for (let start = 0; start < total; start += CHUNK_SIZE) {
    checkCancelled();
    accumulator.addLines(lines.slice(start, start + CHUNK_SIZE));
    // Let navigation/refresh cancel a large analysis between local chunks.
    if (start + CHUNK_SIZE < total) await new Promise(resolve => setTimeout(resolve, 0));
  }
  checkCancelled();
  return { rows: accumulator.finish(), total };
}
