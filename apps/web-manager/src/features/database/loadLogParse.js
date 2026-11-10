// loaddb output as CMS returns it (job result.log): the utility's messages,
// then its error file. Only sentences of the engine's loaddb message set
// (utils.msg set 12, CUBRID 11.x) are read; any other line is left to the
// raw output.
//   "Start object loading." / "Start object syntax checking."
//   116 "Total %ld object(s) inserted, %ld object(s) failed."
//    28 "Total %ld objects inserted."
//   119 "Total %8d object(s) checked, %d object(s) failed."
//    26 "%d errors detected."
//   113 "Last committed line : %d"
//    32 "Line %d:" followed by the message
//    54 "line %d: syntax error at "%s""

const SUMMARY = [
  [/^Total (\d+) object\(s\) inserted, (\d+) object\(s\) failed\.$/, (m) => ({ inserted: +m[1], failed: +m[2] })],
  [/^Total (\d+) objects inserted\.$/, (m) => ({ inserted: +m[1] })],
  [/^Total\s+(\d+) object\(s\) checked, (\d+) object\(s\) failed\.$/, (m) => ({ checked: +m[1], failed: +m[2] })],
  [/^(\d+) errors detected\.$/, (m) => ({ errors: +m[1] })],
  [/^Last committed line : (\d+)$/, (m) => ({ lastCommittedLine: +m[1] })],
];

/**
 * @returns {{ mode: 'load'|'syntax'|null, summary: object, rows: { line: number, message: string }[] } | null}
 *   counts found (inserted, failed, checked, errors, lastCommittedLine) and
 *   one row per message about an input line; null when no line was read.
 */
export function parseLoadLog(lines) {
  let mode = null;
  const summary = {};
  const rows = [];
  let read = 0;
  for (const raw of lines) {
    const line = String(raw ?? '').trim();
    if (!line) continue;
    if (line === 'Start object loading.') { mode = 'load'; read++; continue; }
    if (line === 'Start object syntax checking.') { mode = 'syntax'; read++; continue; }
    const found = SUMMARY.find(([pattern]) => pattern.test(line));
    if (found) {
      Object.assign(summary, found[1](found[0].exec(line)));
      read++;
      continue;
    }
    const lineMessage = /^Line (\d+):\s*(.+)$/.exec(line) ?? /^line (\d+): (syntax error at .+)$/.exec(line);
    if (lineMessage) {
      // loaddb can print the same message for a line twice (Data overflow).
      const row = { line: Number(lineMessage[1]), message: lineMessage[2] };
      if (!rows.some((r) => r.line === row.line && r.message === row.message)) rows.push(row);
      read++;
    }
  }
  return read > 0 ? { mode, summary, rows } : null;
}
