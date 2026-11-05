// `cubrid compactdb -v` output (client-server mode, compactdb_cl.c), as CMS
// returns it in the job result: result.log is [{ line: [...] }]. Three
// passes, each listing classes:
//   Pass 1  "Class t1", "Total objects: N", "Failed objects: N",
//           "Modified objects: N", "Big objects: N" (and error lines)
//   Pass 2  "Class t1" and a sentence on reclaiming unused OIDs and pages
//   Pass 3  "Class t1" and "Heap compact succeeded..." / "...failed..."

const COUNTS = {
  'Total objects': 'total',
  'Failed objects': 'failed',
  'Modified objects': 'modified',
  'Big objects': 'big',
};

/** The output lines of a compact job result, whatever shape the log came in. */
export function compactLogLines(log) {
  if (typeof log === 'string') return log.split('\n');
  if (!Array.isArray(log)) return [];
  return log.flatMap((entry) => (typeof entry === 'string' ? [entry] : entry?.line ?? []));
}

/**
 * @returns {{ passes: { 1: object[], 2: object[], 3: object[] }, notes: string[] } | null}
 *   one row per class and pass ({ name, messages, and in pass 1 total,
 *   failed, modified, big }), lines outside any class in `notes`; null when
 *   the output names no class (compact without verbose output).
 */
export function parseCompactLog(lines) {
  const passes = { 1: [], 2: [], 3: [] };
  const notes = [];
  let pass = 0;
  let row = null;
  for (const raw of lines) {
    const line = String(raw ?? '').trim();
    if (!line) continue;
    const passMatch = /^Pass ([123])$/.exec(line);
    if (passMatch) {
      pass = Number(passMatch[1]);
      row = null;
      continue;
    }
    const classMatch = /^Class (.+)$/.exec(line);
    if (classMatch && passes[pass]) {
      row = { name: classMatch[1].trim(), messages: [] };
      passes[pass].push(row);
      continue;
    }
    const countMatch = /^(Total objects|Failed objects|Modified objects|Big objects): (\d+)$/.exec(line);
    if (countMatch && row) {
      row[COUNTS[countMatch[1]]] = Number(countMatch[2]);
      continue;
    }
    if (row) row.messages.push(line);
    else notes.push(line);
  }
  const classes = passes[1].length + passes[2].length + passes[3].length;
  return classes > 0 ? { passes, notes } : null;
}
