import { confProblemText } from '../../infrastructure/errors/paramIssueText';

/**
 * The server re-validates every raw conf save (cubrid.conf, broker.conf,
 * cm.conf) and answers a rejected one with 400 and a `problems` list —
 * `{ lineNo, key, section, code, params, message }` per offending line. This
 * turns that list into readable "Line N: [section] key — reason" strings in
 * the UI language for the status modal, or returns null when the failure
 * wasn't a validation rejection.
 */
export function confSaveProblems(err) {
  const problems = err?.response?.data?.data?.problems;
  if (!Array.isArray(problems) || problems.length === 0) return null;
  return problems.map((problem) => confProblemText(problem));
}

/** A successful save's warnings, worded from warningProblems when the server sends them. */
export const confSaveWarnings = (result) => (Array.isArray(result?.warningProblems)
  ? result.warningProblems.map((problem) => confProblemText(problem))
  : result?.warnings ?? []);

// The server turned the save away because the file on the host changed
// after the editor loaded it (409 CHANGED_SINCE_LOADED).
export const isConfChangedSinceLoaded = (err) => err?.response?.data?.data?.code === 'CHANGED_SINCE_LOADED';
