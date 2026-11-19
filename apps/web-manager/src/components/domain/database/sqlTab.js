import { EditorSelection, countColumn } from '@codemirror/state';
import { indentLess, indentMore } from '@codemirror/commands';

/** The SQL editor's indent: 4 spaces, as Monaco (the SQL editor before CodeMirror) had by default. */
export const SQL_INDENT_SIZE = 4;

/**
 * Tab as Monaco did it: with no selection, or part of one line selected, spaces
 * up to the next tab stop (every 4 columns) at the cursor, replacing the
 * selection; with several lines, or a whole line, selected, those lines are
 * indented. A read-only editor leaves Tab to the page (focus moves on).
 */
export function insertSqlTab(view) {
  const { state } = view;
  if (state.readOnly) return false;
  const indentsLines = state.selection.ranges.some((range) => {
    const first = state.doc.lineAt(range.from);
    const last = state.doc.lineAt(range.to);
    return first.number !== last.number || (!range.empty && range.from === first.from && range.to === first.to);
  });
  if (indentsLines) return indentMore(view);
  view.dispatch(
    state.changeByRange((range) => {
      const line = state.doc.lineAt(range.from);
      const column = countColumn(line.text.slice(0, range.from - line.from), state.tabSize);
      const spaces = ' '.repeat(SQL_INDENT_SIZE - (column % SQL_INDENT_SIZE));
      return {
        changes: { from: range.from, to: range.to, insert: spaces },
        range: EditorSelection.cursor(range.from + spaces.length),
      };
    }),
    { scrollIntoView: true, userEvent: 'input' }
  );
  return true;
}

/** Shift+Tab as Monaco did it: one indent less at the start of each selected line, wherever the cursor is. */
export function outdentSqlLines(view) {
  if (view.state.readOnly) return false;
  return indentLess(view);
}

export const sqlTabKeymap = [{ key: 'Tab', run: insertSqlTab, shift: outdentSqlLines }];

const OPENERS = /[([]\s*$/;
const CLOSER_AFTER = { '(': ')', '[': ']' };

/**
 * Enter as Monaco did it: the new line gets the indentation of the line it
 * breaks (a tab counts as 4 spaces, written as spaces), one level more after
 * an opening ( or [, and between ( and ) the closing one goes on its own line
 * at the line's indentation. The text after the cursor moves down as it is.
 */
export function insertSqlNewline(view) {
  const { state } = view;
  if (state.readOnly) return false;
  view.dispatch(
    state.changeByRange((range) => {
      const line = state.doc.lineAt(range.from);
      const before = line.text.slice(0, range.from - line.from);
      const leading = /^[ \t]*/.exec(before)[0];
      const indent = countColumn(leading, SQL_INDENT_SIZE);
      const opener = OPENERS.test(before) ? before.trimEnd().slice(-1) : null;
      const pad = (n) => ' '.repeat(n);
      if (!opener) {
        const insert = `\n${pad(indent)}`;
        return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.cursor(range.from + insert.length) };
      }
      const inner = `\n${pad(indent + SQL_INDENT_SIZE)}`;
      const closes = state.doc.sliceString(range.to, range.to + 1) === CLOSER_AFTER[opener];
      const insert = closes ? `${inner}\n${pad(indent)}` : inner;
      return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.cursor(range.from + inner.length) };
    }),
    { scrollIntoView: true, userEvent: 'input' }
  );
  return true;
}

export const sqlEnterKeymap = [{ key: 'Enter', run: insertSqlNewline }];
