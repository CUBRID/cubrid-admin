import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { StandardSQL, sql } from '@codemirror/lang-sql';
import { tags } from '@lezer/highlight';

// SQL keywords (completed in upper case), strings, numbers and comments.
export const sqlLanguage = sql({ dialect: StandardSQL, upperCaseKeywords: true });

/**
 * The SQL language's completion, with the chosen word replacing the whole
 * word at the cursor, also the part after it (`SEL|ECT` -> `SELECT`, not
 * `SELECTECT`). The language's own source matches only the part before it.
 */
export async function sqlCompletionSource(context) {
  const sources = context.state.languageDataAt('autocomplete', context.pos).filter((f) => typeof f === 'function');
  for (const source of sources) {
    const result = await source(context);
    if (result) {
      if (result.to !== undefined) return result;
      const line = context.state.doc.lineAt(context.pos);
      const rest = /^\w*/.exec(line.text.slice(context.pos - line.from))[0];
      return { ...result, to: context.pos + rest.length };
    }
  }
  return null;
}

// Colors: CSS variables set by the editor theme (CodeMirrorSqlEditor).
export const sqlHighlighting = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--sql-keyword)', fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--sql-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--sql-number)' },
  { tag: [tags.lineComment, tags.blockComment], color: 'var(--sql-comment)', fontStyle: 'italic' },
  { tag: [tags.typeName, tags.standard(tags.name)], color: 'var(--sql-type)' },
  { tag: [tags.operator, tags.punctuation], color: 'var(--sql-operator)' },
]));
