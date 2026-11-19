import { validateConfText } from '@api-interfaces';
import { confProblemText } from '../../../infrastructure/errors/paramIssueText';

const SCHEMA_OF = { cubridconf: 'database', brokerconf: 'broker', cmconf: 'cm' };

/**
 * Underlines for a conf text: the same check the server runs on save
 * (validateConfText — unknown keys, values out of range, a key twice in a
 * section, ...), only shown, never blocking the save. Each problem marks
 * its key on its line, or the whole line when it names no key.
 *
 * @returns {{ from: number, to: number, severity: 'error'|'warning', message: string }[]}
 */
export function confDiagnostics(CM, doc, kind, paramSchemas) {
  if (!paramSchemas) return [];
  const problems = validateConfText(paramSchemas[SCHEMA_OF[kind]] ?? [], doc.toString(), kind, paramSchemas.knownKeys);
  return problems.map((problem) => {
    const line = problem.lineNo && problem.lineNo <= doc.lines ? doc.line(problem.lineNo) : doc.line(1);
    let from = line.from;
    let to = line.to;
    const at = problem.key ? line.text.indexOf(problem.key) : -1;
    if (at >= 0) {
      from = line.from + at;
      to = from + problem.key.length;
    }
    return {
      from,
      to: Math.max(to, from),
      severity: problem.severity === 'warning' ? 'warning' : 'error',
      // The underline is on the line already; leave out the "Line N:" prefix.
      message: confProblemText({ ...problem, lineNo: undefined }, CM),
    };
  });
}
