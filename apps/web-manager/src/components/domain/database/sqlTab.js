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

const OPENER_OF = { ')': '(', ']': '[' };

/**
 * Typing ) or ] on a line that holds only spaces puts it at the indentation of
 * the line with its opening ( or [, as Monaco did (the line Enter indented one
 * level deeper goes back out). A line with other text is left as it is.
 * For EditorView.inputHandler; returns whether it took the input.
 */
export function outdentClosingBracket(view, from, to, text) {
  const open = OPENER_OF[text];
  if (!open || from !== to || view.state.readOnly) return false;
  const { doc } = view.state;
  const line = doc.lineAt(from);
  if (/\S/.test(line.text)) return false;
  let depth = 0;
  for (let pos = line.from - 1; pos >= 0; pos -= 1) {
    const ch = doc.sliceString(pos, pos + 1);
    if (ch === text) depth += 1;
    else if (ch === open) {
      if (depth === 0) {
        const opener = doc.lineAt(pos);
        const indent = countColumn(/^[ \t]*/.exec(opener.text)[0], SQL_INDENT_SIZE);
        const insert = ' '.repeat(indent) + text;
        view.dispatch({
          changes: { from: line.from, to: line.to, insert },
          selection: { anchor: line.from + insert.length },
          userEvent: 'input.type',
          scrollIntoView: true,
        });
        return true;
      }
      depth -= 1;
    }
  }
  return false;
}
