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
