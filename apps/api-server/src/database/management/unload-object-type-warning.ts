import { getCmsErrorLines, isCmsStatusFailure } from '@common/decorators/handle-cms-status-errors.decorator';
import type { Warning } from '@common/warning';

// unload_object.c, for a class with an OBJECT attribute when unloaddb would
// use threads. CMS (ts_unloaddb, read_error_file) fails the task on any
// stderr text, after the files are written but before the result and
// unloaddb.info.
const OBJECT_TYPE_LINE = /^warning: \[(.+)\] has object type\.$/;
const threadCountLine = (cls: string) => `So for class [${cls}], '--thread-count' option is ignored.`;

/**
 * The classes named when a failed unloaddb's note holds nothing but these
 * warnings (both lines, per class; empty lines skipped); null for any other
 * failure, or for a response that did not fail.
 */
export function unloadObjectTypeWarningClasses(response: unknown): string[] | null {
  if (!isCmsStatusFailure(response) || getCmsErrorLines(response).length > 0) return null;
  const note = (response as { note?: unknown }).note;
  if (typeof note !== 'string') return null;
  const lines = note.split(/<end>|\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0 || lines.length % 2 !== 0) return null;
  const classes: string[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const match = OBJECT_TYPE_LINE.exec(lines[i]);
    if (!match || lines[i + 1] !== threadCountLine(match[1])) return null;
    classes.push(match[1]);
  }
  return classes;
}

/** What such an unload reports instead of failing. */
export function unloadObjectTypeWarnings(classes: string[]): Warning[] {
  return [
    ...classes.map((cls) => ({
      code: 'UNLOAD_OBJECT_TYPE_THREAD_COUNT_IGNORED',
      class: cls,
      message: `warning: [${cls}] has object type. ${threadCountLine(cls)}`,
    })),
    {
      code: 'UNLOAD_RESULT_NOT_RECORDED',
      message: 'CMS stopped after this warning, so the table counts and the Load Database list entry were not written.',
    },
  ];
}
