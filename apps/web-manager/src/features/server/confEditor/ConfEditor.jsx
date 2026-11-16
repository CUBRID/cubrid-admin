import { useEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, hoverTooltip, keymap, lineNumbers,
  placeholder as placeholderText,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { forceLinting, linter, lintGutter, lintKeymap } from '@codemirror/lint';
import { useCM } from '../../../constants/useCM';
import { confHighlighting, confLanguage } from './confLanguage';
import { confContextAt, confKeyAt } from './confContext';
import { confParams, confSectionNames, describeGuard, paramHintDom } from './confParams';
import { confDiagnostics } from './confLint';

const MONO = 'var(--font-mono)';
const SANS = 'var(--font-sans)';
// Popups (completion, its side panel, the hover hint) and the find panel in
// the app's look instead of CodeMirror's defaults; colors per theme below.
const base = {
  '&': { height: '100%', fontSize: '14px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: MONO, lineHeight: '1.625', overflow: 'auto' },
  '.cm-content': { padding: '16px 0' },
  '.cm-line': { padding: '0 24px 0 16px' },
  '.cm-gutters': { fontFamily: MONO },
  '.cm-tooltip': { borderRadius: '8px', fontFamily: SANS, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: MONO, fontSize: '13px', maxHeight: '15em', padding: '4px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '3px 8px', borderRadius: '4px', lineHeight: '1.5' },
  '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '700' },
  '.cm-tooltip-autocomplete .cm-completionDetail': { fontFamily: SANS, fontStyle: 'normal', fontSize: '12px', marginLeft: '12px' },
  '.cm-tooltip.cm-completionInfo': { padding: '0', maxWidth: '360px' },
  '.cm-conf-hint': { padding: '8px 10px', maxWidth: '420px', fontSize: '13px', lineHeight: '1.6' },
  '.cm-conf-hint b': { display: 'block', marginBottom: '2px', fontFamily: MONO, fontWeight: '700' },
  '.cm-panels': { fontFamily: SANS, fontSize: '13px' },
  '.cm-panel.cm-search': { padding: '8px 36px 8px 12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' },
  '.cm-panel.cm-search br': { flexBasis: '100%', height: '0', content: '""' },
  '.cm-panel.cm-search label': { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', margin: '0 4px' },
  '.cm-panel.cm-search [name=close]': { top: '8px', right: '10px', fontSize: '18px', cursor: 'pointer' },
  // CodeMirror's own panel rules are scoped by light/dark, so these name the panel too.
  '.cm-panel .cm-textfield': { margin: '0', padding: '4px 8px', borderRadius: '6px', fontFamily: MONO, fontSize: '13px', outline: 'none' },
  '.cm-panel .cm-button': { margin: '0', padding: '4px 10px', borderRadius: '6px', backgroundImage: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
};
// Colors of the textarea editor this replaces (Tailwind slate/sky/amber in
// light, the --color-editor-* tokens in dark).
// Each theme adds its colors to the shared rules, selector by selector.
const withBase = (colors) => Object.fromEntries(
  [...new Set([...Object.keys(base), ...Object.keys(colors)])].map((sel) => [sel, { ...base[sel], ...colors[sel] }]),
);
const lightTheme = EditorView.theme(withBase({
  '&': { backgroundColor: '#ffffff', color: '#1e293b',
    '--conf-comment': '#94a3b8', '--conf-section': '#d97706', '--conf-key': '#0284c7', '--conf-value': '#64748b' },
  '.cm-gutters': { backgroundColor: '#f8fafc', color: '#cbd5e1', borderRight: '1px solid #f1f5f9' },
  '.cm-activeLine': { backgroundColor: '#f8fafc' },
  '.cm-activeLineGutter': { backgroundColor: '#f1f5f9', color: '#64748b' },
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
    '--conf-comment': 'var(--color-editor-comment)', '--conf-section': 'var(--color-editor-section)',
    '--conf-key': 'var(--color-editor-key)', '--conf-value': 'var(--color-editor-value)' },
  '.cm-gutters': { backgroundColor: 'var(--color-editor-gutter)', color: 'var(--color-editor-line)', borderRight: '1px solid var(--color-editor-border)' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.04)' },
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

// Parameter lists are built once per file kind and schema payload.
const paramCache = new WeakMap();
function paramsFor(kind, paramSchemas) {
  if (!paramSchemas) return confParams(kind, null);
  let byKind = paramCache.get(paramSchemas);
  if (!byKind) paramCache.set(paramSchemas, (byKind = {}));
  return (byKind[kind] ??= confParams(kind, paramSchemas));
}

/**
 * The conf file editor (CodeMirror 6): section/key/value colors, line
 * numbers, find (Ctrl/Cmd+F), undo, parameter name and value completion,
 * a hint on hover, and underlines for what the server would refuse or warn
 * about on save. It never blocks typing or saving.
 *
 * @param {'cubridconf'|'brokerconf'|'cmconf'} kind
 * @param paramSchemas the host's getEnv paramSchemas (undefined until read)
 */
export default function ConfEditor({ value, onChange, readOnly = false, kind, paramSchemas, testId, placeholder }) {
  const CM = useCM();
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const latest = useRef({});
  latest.current = { CM, kind, paramSchemas, onChange };
  const compartments = useRef({ readOnly: new Compartment(), theme: new Compartment(), phrases: new Compartment() });

  useEffect(() => {
    const ctx = () => latest.current;
    const complete = (context) => {
      const { CM: L, kind: k, paramSchemas: schemas } = ctx();
      const where = confContextAt(context.state.doc, context.pos);
      if (where.place === 'comment') return null;
      if (!context.explicit && !where.text && where.place !== 'heading') return null;
      const params = paramsFor(k, schemas);
      let options = [];
      if (where.place === 'heading') {
        options = confSectionNames(k).map((label) => ({ label, type: 'namespace' }));
      } else if (where.place === 'key') {
        options = params.forSection(where.section).map((param) => ({
          label: param.name,
          type: 'property',
          detail: describeGuard(L, param.guard),
          // A function here must return a DOM node, not a string.
          info: () => paramHintDom(L, param, false),
          apply: `${param.name}=`,
        }));
      } else {
        const guard = params.get(where.key, where.section)?.guard;
        const words = guard?.kind === 'enum' ? guard.options : guard?.kind === 'boolean' ? ['yes', 'no'] : [];
        options = words.map((label) => ({ label, type: 'enum' }));
      }
      return options.length ? { from: where.from, options, validFor: /^[\w@%.:-]*$/ } : null;
    };
    const hint = hoverTooltip((view, pos) => {
      const hit = confKeyAt(view.state.doc, pos);
      if (!hit) return null;
      const { CM: L, kind: k, paramSchemas: schemas } = ctx();
      const section = confContextAt(view.state.doc, hit.from).section;
      const param = paramsFor(k, schemas).get(hit.key, section);
      if (!param) return null;
      return {
        pos: hit.from,
        end: hit.to,
        above: true,
        create: () => ({ dom: paramHintDom(L, param, true) }),
      };
    });

    const { readOnly: ro, theme, phrases } = compartments.current;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value ?? '',
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          search({ top: true }),
          highlightSelectionMatches(),
          confLanguage,
          confHighlighting,
          autocompletion({ override: [complete], icons: false }),
          hint,
          // Debounced, so a large file is not re-checked on every key.
          linter((v) => confDiagnostics(ctx().CM, v.state.doc, ctx().kind, ctx().paramSchemas), { delay: 500 }),
          lintGutter(),
          keymap.of([...completionKeymap, ...searchKeymap, ...historyKeymap, ...lintKeymap, indentWithTab, ...defaultKeymap]),
          placeholderText(placeholder ?? ''),
          ro.of(EditorState.readOnly.of(readOnly)),
          theme.of(isDark() ? darkTheme : lightTheme),
          phrases.of(EditorState.phrases.of(latest.current.CM.codeMirrorPhrases ?? {})),
          EditorView.contentAttributes.of({ 'data-testid': testId, spellcheck: 'false' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) ctx().onChange?.(update.state.doc.toString());
          }),
        ],
      }),
    });
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
  }, []);

  // A new value from outside (load, reload, undo all changes) replaces the text.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const text = value ?? '';
    if (view.state.doc.toString() !== text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.readOnly.reconfigure(EditorState.readOnly.of(readOnly)) });
  }, [readOnly]);

  // Language or schema changed: new phrases, and check the text again.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: compartments.current.phrases.reconfigure(EditorState.phrases.of(CM.codeMirrorPhrases ?? {})) });
    forceLinting(view);
  }, [CM, kind, paramSchemas]);

  return <div ref={hostRef} data-testid={testId ? `${testId}-editor` : undefined} className="absolute inset-0" />;
}
