/**
 * The output lines of a job result, whatever shape the log came in: CMS
 * `log` ([{ line: [...] }]), a plain string array (load) or one string.
 */
export function jobOutputLines(log) {
  if (typeof log === 'string') return log.split('\n');
  if (!Array.isArray(log)) return [];
  return log.flatMap((entry) => (typeof entry === 'string' ? [entry] : entry?.line ?? []));
}

export const hasOutput = (lines) => lines.some((line) => String(line ?? '').trim());
