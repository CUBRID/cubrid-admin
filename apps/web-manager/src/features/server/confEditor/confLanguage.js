import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/**
 * cubrid.conf, cubrid_broker.conf and cm.conf as the engine and CMS read
 * them: `#` comment lines, `[section]` headings, `key = value` lines.
 */
export const confLanguage = StreamLanguage.define({
  name: 'conf',
  startState: () => ({ afterEquals: false }),
  token(stream, state) {
    if (stream.sol()) {
      state.afterEquals = false;
      stream.eatSpace();
      if (stream.peek() === '#') {
        stream.skipToEnd();
        return 'comment';
      }
      if (stream.peek() === '[') {
        stream.skipToEnd();
        return 'heading';
      }
    }
    if (stream.eatSpace()) return null;
    if (!state.afterEquals) {
      if (stream.eat('=')) {
        state.afterEquals = true;
        return 'operator';
      }
      stream.eatWhile((ch) => ch !== '=' && !/\s/.test(ch));
      return 'propertyName';
    }
    stream.skipToEnd();
    return 'string';
  },
  languageData: { commentTokens: { line: '#' } },
});

// Colors of the editor this replaces: CSS variables set by the editor theme
// (light) and from the --color-editor-* tokens (dark).
export const confHighlighting = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.comment, color: 'var(--conf-comment)' },
  { tag: tags.heading, color: 'var(--conf-section)', fontWeight: '600' },
  { tag: tags.propertyName, color: 'var(--conf-key)' },
  { tag: [tags.operator, tags.string], color: 'var(--conf-value)' },
]));
