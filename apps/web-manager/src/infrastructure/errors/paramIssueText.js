import { getCM, getStoredLocale } from '../../constants/useCM';

// A parameter check (checkParamValue / checkEffectiveParams in
// libs/api-interfaces, and the server's ConfTextProblem) in the UI language.
// The library words each one in English; a locale pack with `paramIssues`
// (value checks) and `confProblems` (file checks) says them by code instead.

/** One ParamValueIssue `{ code, message, params }`. */
export function paramIssueText(issue, CM = getCM(getStoredLocale())) {
  if (!issue) return null;
  const entry = CM.paramIssues?.[issue.code];
  if (entry === undefined) return issue.message;
  const params = issue.params ?? {};
  if (typeof entry !== 'function') return entry;
  // EMPTY_READS_AS_ZERO names, as `cause`, the check that 0 fails.
  const { cause, ...causeParams } = params;
  if (cause === undefined) return entry(params);
  if (CM.paramIssues[cause] === undefined) return issue.message;
  return entry(params, paramIssueText({ code: cause, params: causeParams }, CM));
}

/** checkEffectiveParams' key → issue map as key → text. */
export const paramIssuesText = (issues, CM = getCM(getStoredLocale())) => Object.fromEntries(
  Object.entries(issues).map(([key, issue]) => [key, paramIssueText(issue, CM)])
);

/** One ConfTextProblem `{ lineNo, key, section, code, params, message }`, with its line. */
export function confProblemText(problem, CM = getCM(getStoredLocale())) {
  const line = problem.lineNo ? CM.confLinePrefix(problem.lineNo) : '';
  const fileEntry = CM.confProblems?.[problem.code];
  let said;
  if (fileEntry !== undefined) {
    said = typeof fileEntry === 'function' ? fileEntry(problem.params ?? {}, problem) : fileEntry;
  } else if (CM.paramIssues?.[problem.code] !== undefined) {
    said = paramIssueText(problem, CM) + (problem.params?.pendingCms ? CM.confPendingCmsNote : '');
  } else {
    return `${line}${problem.message}`;
  }
  const subject = problem.key ? `${problem.section ? `[${problem.section}] ` : ''}${problem.key}` : '';
  return `${line}${subject ? `${subject} — ` : ''}${said}`;
}
