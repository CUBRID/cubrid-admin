/**
 * The server re-validates every raw conf save (cubrid.conf, broker.conf,
 * cm.conf) and answers a rejected one with 400 and a `problems` list —
 * `{ lineNo, key, message }` per offending line. This turns that list into
 * readable "Line N: [section] key — reason" strings for the status modal,
 * or returns null when the failure wasn't a validation rejection.
 */
export function confSaveProblems(err) {
  const problems = err?.response?.data?.data?.problems;
  if (!Array.isArray(problems) || problems.length === 0) return null;
  return problems.map(({ lineNo, message }) => (lineNo ? `Line ${lineNo}: ${message}` : message));
}
