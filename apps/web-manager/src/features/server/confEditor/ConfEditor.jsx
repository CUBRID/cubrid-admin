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
import { confParams, confSectionNames, describeGuard, paramHintLines } from './confParams';
import { confDiagnostics } from './confLint';

const MONO = 'var(--font-mono)';
const base = {
  '&': { height: '100%', fontSize: '14px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: MONO, lineHeight: '1.625', overflow: 'auto' },
  '.cm-content': { padding: '16px 0' },
  '.cm-line': { padding: '0 24px 0 16px' },
  '.cm-gutters': { fontFamily: MONO },
  '.cm-tooltip.cm-conf-hint': { padding: '8px 10px', maxWidth: '420px', fontSize: '13px', lineHeight: '1.5' },
  '.cm-conf-hint b': { fontFamily: MONO },
};
// Colors of the textarea editor this replaces (Tailwind slate/sky/amber in
// light, the --color-editor-* tokens in dark).
const lightTheme = EditorView.theme({
  ...base,
  '&': { ...base['&'], backgroundColor: '#ffffff', color: '#1e293b',
    '--conf-comment': '#94a3b8', '--conf-section': '#d97706', '--conf-key': '#0284c7', '--conf-value': '#64748b' },
  '.cm-gutters': { ...base['.cm-gutters'], backgroundColor: '#f8fafc', color: '#cbd5e1', borderRight: '1px solid #f1f5f9' },
  '.cm-activeLine': { backgroundColor: '#f8fafc' },
  '.cm-activeLineGutter': { backgroundColor: '#f1f5f9', color: '#64748b' },
}, { dark: false });
const darkTheme = EditorView.theme({
  ...base,
  '&': { ...base['&'], backgroundColor: 'var(--color-editor-bg)', color: 'var(--color-editor-text)',
    '--conf-comment': 'var(--color-editor-comment)', '--conf-section': 'var(--color-editor-section)',
    '--conf-key': 'var(--color-editor-key)', '--conf-value': 'var(--color-editor-value)' },
  '.cm-gutters': { ...base['.cm-gutters'], backgroundColor: 'var(--color-editor-gutter)', color: 'var(--color-editor-line)', borderRight: '1px solid var(--color-editor-border)' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.04)' },
  '.cm-cursor': { borderLeftColor: 'var(--color-editor-section)' },
}, { dark: true });

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
          info: () => paramHintLines(L, param).join('\n') || null,
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
        create() {
          const dom = document.createElement('div');
          dom.className = 'cm-conf-hint';
          const name = document.createElement('b');
          name.textContent = param.name;
          dom.append(name);
          for (const line of paramHintLines(L, param)) {
            const row = document.createElement('div');
            row.textContent = line;
            dom.append(row);
          }
          return { dom };
        },
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
