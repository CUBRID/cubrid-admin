import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { StandardSQL, sql } from '@codemirror/lang-sql';
import { tags } from '@lezer/highlight';

// SQL keywords (completed in upper case), strings, numbers and comments.
export const sqlLanguage = sql({ dialect: StandardSQL, upperCaseKeywords: true });

// Colors: CSS variables set by the editor theme (CodeMirrorSqlEditor).
export const sqlHighlighting = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--sql-keyword)', fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--sql-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--sql-number)' },
  { tag: [tags.lineComment, tags.blockComment], color: 'var(--sql-comment)', fontStyle: 'italic' },
  { tag: [tags.typeName, tags.standard(tags.name)], color: 'var(--sql-type)' },
  { tag: [tags.operator, tags.punctuation], color: 'var(--sql-operator)' },
]));
