// A dialog input check (checkIntInRange and the like in @api-interfaces) in
// the UI language: a locale pack with `paramIssues` says it by code, as for
// parameter values; otherwise the library's English text.
export function inputIssueText(issue, CM) {
  if (!issue) return null;
  const entry = CM?.paramIssues?.[issue.code];
  if (entry === undefined) return issue.message;
  return typeof entry === 'function' ? entry(issue.params ?? {}) : entry;
}
