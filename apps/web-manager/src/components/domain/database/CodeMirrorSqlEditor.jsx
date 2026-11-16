import { useEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, keymap, placeholder as placeholderText } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { sqlHighlighting, sqlLanguage } from './sqlLanguage';
import { useCM } from '../../../constants/useCM';

const MONO = 'var(--font-mono)';
const SANS = 'var(--font-sans)';

// The look of the conf editors (ConfEditor): app fonts, popups and the find panel.
const base = {
  '&': { fontSize: '13px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: MONO, lineHeight: '1.6', overflow: 'auto' },
  '.cm-content': { padding: '16px 0' },
  '.cm-line': { padding: '0 16px 0 4px' },
  '.cm-tooltip': { borderRadius: '8px', fontFamily: SANS, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: MONO, fontSize: '13px', maxHeight: '15em', padding: '4px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '3px 8px', borderRadius: '4px', lineHeight: '1.5' },
  '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '700' },
  '.cm-tooltip-autocomplete .cm-completionDetail': { fontFamily: SANS, fontStyle: 'normal', fontSize: '12px', marginLeft: '12px' },
  '.cm-panels': { fontFamily: SANS, fontSize: '13px' },
  '.cm-panel.cm-search': { padding: '8px 36px 8px 12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' },
  '.cm-panel.cm-search br': { flexBasis: '100%', height: '0', content: '""' },
  '.cm-panel.cm-search label': { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', margin: '0 4px' },
  '.cm-panel.cm-search [name=close]': { top: '8px', right: '10px', fontSize: '18px', cursor: 'pointer' },
  '.cm-panel .cm-textfield': { margin: '0', padding: '4px 8px', borderRadius: '6px', fontFamily: MONO, fontSize: '13px', outline: 'none' },
  '.cm-panel .cm-button': { margin: '0', padding: '4px 10px', borderRadius: '6px', backgroundImage: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
};
const withBase = (colors) => Object.fromEntries(
  [...new Set([...Object.keys(base), ...Object.keys(colors)])].map((sel) => [sel, { ...base[sel], ...colors[sel] }]),
);
const lightTheme = EditorView.theme(withBase({
  '&': { backgroundColor: '#ffffff', color: '#1e293b',
    '--sql-keyword': '#0369a1', '--sql-string': '#b45309', '--sql-number': '#7c3aed', '--sql-comment': '#94a3b8',
    '--sql-type': '#0f766e', '--sql-operator': '#64748b' },
  '.cm-activeLine': { backgroundColor: '#f8fafc' },
  '.cm-tooltip': { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', color: '#334155' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#fef3c7', color: '#0f172a' },
  '.cm-tooltip-autocomplete .cm-completionDetail': { color: '#94a3b8' },
  '.cm-panels': { backgroundColor: '#f8fafc', color: '#475569' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid #e2e8f0' },
  '.cm-panel .cm-textfield': { backgroundColor: '#ffffff', border: '1px solid #cbd5e1', color: '#1e293b' },
  '.cm-panel .cm-textfield:focus': { borderColor: '#f59e0b' },
  '.cm-panel .cm-button': { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', color: '#475569' },
  '.cm-panel .cm-button:hover': { borderColor: '#f59e0b', color: '#b45309' },
  '.cm-searchMatch': { backgroundColor: 'rgba(245, 158, 11, 0.25)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(245, 158, 11, 0.5)' },
}), { dark: false });
const darkTheme = EditorView.theme(withBase({
  '&': { backgroundColor: 'var(--color-editor-bg)', color: 'var(--color-editor-text)',
    '--sql-keyword': 'var(--color-editor-key)', '--sql-string': 'var(--color-editor-section)', '--sql-number': '#c4b5fd',
    '--sql-comment': 'var(--color-editor-comment)', '--sql-type': '#5eead4', '--sql-operator': 'var(--color-editor-value)' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
  '.cm-cursor': { borderLeftColor: 'var(--color-editor-section)' },
  '.cm-tooltip': { backgroundColor: 'var(--color-editor-gutter)', border: '1px solid var(--color-editor-border)', color: 'var(--color-editor-text)', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'rgba(213, 164, 71, 0.2)', color: '#f1f5f9' },
  '.cm-tooltip-autocomplete .cm-completionDetail': { color: 'var(--color-editor-comment)' },
  '.cm-panels': { backgroundColor: 'var(--color-editor-gutter)', color: 'var(--color-editor-text)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--color-editor-border)' },
  '.cm-panel .cm-textfield': { backgroundColor: 'var(--color-editor-bg)', border: '1px solid var(--color-editor-border)', color: 'var(--color-editor-text)' },
  '.cm-panel .cm-textfield:focus': { borderColor: 'var(--color-editor-section)' },
  '.cm-panel .cm-button': { backgroundColor: 'var(--color-editor-bg)', border: '1px solid var(--color-editor-border)', color: 'var(--color-editor-text)' },
  '.cm-panel .cm-button:hover': { borderColor: 'var(--color-editor-section)', color: 'var(--color-editor-section)' },
  '.cm-searchMatch': { backgroundColor: 'rgba(213, 164, 71, 0.22)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(213, 164, 71, 0.45)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(115, 175, 194, 0.25)' },
}), { dark: true });

const isDark = () => document.documentElement.classList.contains('dark');

/**
 * The SQL input of the query plan dialogs (CodeMirror 6): SQL keyword colors,
 * keyword completion (Ctrl+Space, or while typing), find (Ctrl/Cmd+F), undo,
 * light/dark colors following the app. Loaded through SqlCodeEditor.
 */
export default function CodeMirrorSqlEditor({ value, onChange, height, readOnly = false, testId, placeholder }) {
  const CM = useCM();
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const latest = useRef({});
  latest.current = { CM, onChange, readOnly, placeholder };
  const compartments = useRef({
    readOnly: new Compartment(), theme: new Compartment(), phrases: new Compartment(), placeholder: new Compartment(),
  });
  // Makes the editor state for a text: a text from outside starts a new state,
  // so undo never goes back past it (to the empty editor before the plan loaded).
  const stateFor = useRef(null);

  useEffect(() => {
    const ctx = () => latest.current;
    const { readOnly: ro, theme, phrases, placeholder: hintText } = compartments.current;
    stateFor.current = (doc) => EditorState.create({
      doc,
      extensions: [
        highlightActiveLine(),
        drawSelection(),
        history(),
        search({ top: true }),
        highlightSelectionMatches(),
        closeBrackets(),
        sqlLanguage,
        sqlHighlighting,
        autocompletion({ icons: false }),
        EditorView.lineWrapping,
        keymap.of([...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap, indentWithTab, ...defaultKeymap]),
        hintText.of(placeholderText(ctx().placeholder ?? '')),
        ro.of(EditorState.readOnly.of(ctx().readOnly)),
        theme.of(isDark() ? darkTheme : lightTheme),
        phrases.of(EditorState.phrases.of(ctx().CM.codeMirrorPhrases ?? {})),
        EditorView.contentAttributes.of({ 'data-testid': testId, spellcheck: 'false', 'aria-multiline': 'true' }),
        // Only edits in the editor: a new state from outside (setState) does not come here.
        EditorView.updateListener.of((update) => {
          if (update.docChanged) ctx().onChange?.(update.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ parent: hostRef.current, state: stateFor.current(value ?? '') });
    viewRef.current = view;
    // Follow the app's light/dark switch.
    const observer = new MutationObserver(() => {
      view.dispatch({ effects: theme.reconfigure(isDark() ? darkTheme : lightTheme) });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      observer.disconnect();
      view.destroy();
      viewRef.current = null;
    };
    // The view is made once; later props reach it through `latest` and the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new value from outside (the plan loaded into the edit dialog) replaces the
  // text with a new state: not in the undo history, and not sent to onChange.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const text = value ?? '';
    if (view.state.doc.toString() !== text) view.setState(stateFor.current(text));
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.placeholder.reconfigure(placeholderText(placeholder ?? '')) });
  }, [placeholder]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.readOnly.reconfigure(EditorState.readOnly.of(readOnly)) });
  }, [readOnly]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.phrases.reconfigure(EditorState.phrases.of(CM.codeMirrorPhrases ?? {})) });
  }, [CM]);

  return <div ref={hostRef} data-testid={testId ? `${testId}-editor` : undefined} style={{ height }} className="overflow-hidden [&_.cm-editor]:h-full" />;
}
