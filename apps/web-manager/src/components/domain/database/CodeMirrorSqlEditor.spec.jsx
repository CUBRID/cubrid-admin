import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { CompletionContext, acceptCompletion, autocompletion, completionStatus, startCompletion } from '@codemirror/autocomplete';
import { SearchQuery, openSearchPanel, setSearchQuery } from '@codemirror/search';
import { undo } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import CodeMirrorSqlEditor from './CodeMirrorSqlEditor';
import { Modal } from '../../ds/layout/Modal';
import { sqlCompletionSource, sqlLanguage } from './sqlLanguage';

const store = (locale = 'en') => configureStore({ reducer: { user: () => ({ preferences: { uiLocale: locale } }) } });
let container;
let root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.documentElement.classList.remove('dark');
});

const render = (props, locale) => act(() => root.render(
  <Provider store={store(locale)}><CodeMirrorSqlEditor testId="sql" {...props} /></Provider>,
));
const viewOf = () => EditorView.findFromDOM(container.querySelector('.cm-editor'));

describe('SQL language', () => {
  const state = (doc) => EditorState.create({ doc, extensions: [sqlLanguage] });

  it('completes SQL keywords in upper case', async () => {
    const s = state('sel');
    const [source] = s.languageDataAt('autocomplete', 3).filter((f) => typeof f === 'function');
    const result = await source(new CompletionContext(s, 3, true));
    expect(result.options.map((o) => o.label)).toContain('SELECT');
  });

  // Completion is off in the editor (EDITOR_ASSIST); here it is turned on directly.
  it('replaces the whole word at the cursor, also the part after it', async () => {
    const complete = async (withCursor) => {
      const cursor = withCursor.indexOf('|');
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const view = new EditorView({
        parent,
        state: EditorState.create({
          doc: withCursor.replace('|', ''),
          selection: { anchor: cursor },
          extensions: [sqlLanguage, autocompletion({ override: [sqlCompletionSource], interactionDelay: 0 })],
        }),
      });
      try {
        startCompletion(view);
        for (let i = 0; i < 50 && completionStatus(view.state) !== 'active'; i++) await new Promise((resolve) => setTimeout(resolve, 10));
        expect(completionStatus(view.state)).toBe('active');
        expect(acceptCompletion(view)).toBe(true);
        return view.state.doc.toString();
      } finally {
        view.destroy();
        parent.remove();
      }
    };
    expect(await complete('SELEC|T 1 FROM db_root')).toBe('SELECT 1 FROM db_root');
    expect(await complete('SELECT 1 FR|OM db_root')).toBe('SELECT 1 FROM db_root');
    expect(await complete('SELECT 1 FRO|')).toBe('SELECT 1 FROM');
  });

  it('marks keywords, strings and numbers', () => {
    const s = state("SELECT name FROM t WHERE id = 1 AND c = 'x'");
    const names = [];
    syntaxTree(s).iterate({ enter: (node) => { names.push(node.name); } });
    expect(names).toEqual(expect.arrayContaining(['Keyword', 'Number', 'String']));
  });
});

describe('CodeMirrorSqlEditor', () => {
  it('shows the value and reports edits as text', () => {
    const onChange = vi.fn();
    render({ value: 'SELECT 1', onChange });
    const view = viewOf();
    expect(view.state.doc.toString()).toBe('SELECT 1');
    expect(container.querySelector('[data-testid="sql"]')).not.toBeNull();
    act(() => view.dispatch({ changes: { from: 8, insert: ' FROM db_root' } }));
    expect(onChange).toHaveBeenLastCalledWith('SELECT 1 FROM db_root');
  });

  it('takes a new value from outside without reporting it back', () => {
    const onChange = vi.fn();
    render({ value: '', onChange });
    render({ value: 'UPDATE t SET a = 1', onChange });
    expect(viewOf().state.doc.toString()).toBe('UPDATE t SET a = 1');
    expect(onChange).not.toHaveBeenCalledWith('UPDATE t SET a = 1');
  });

  it('keeps a loaded text when undo goes all the way back', () => {
    const onChange = vi.fn();
    // The chunk is already loaded: the editor shows '' first, then the plan.
    render({ value: '', onChange });
    render({ value: 'SELECT 1 FROM db_root;', onChange });
    const view = viewOf();
    act(() => view.dispatch({ changes: { from: view.state.doc.length, insert: ' -- x' } }));
    expect(onChange).toHaveBeenLastCalledWith('SELECT 1 FROM db_root; -- x');
    act(() => { while (undo(view)); });
    expect(view.state.doc.toString()).toBe('SELECT 1 FROM db_root;');
    expect(onChange).toHaveBeenLastCalledWith('SELECT 1 FROM db_root;');
    expect(onChange).not.toHaveBeenCalledWith('');
  });

  it('shows the placeholder in the UI language', () => {
    render({ value: '', placeholder: 'Enter SQL' });
    expect(container.querySelector('.cm-placeholder')?.textContent).toBe('Enter SQL');
    render({ value: '', placeholder: 'SQL 입력' });
    expect(container.querySelector('.cm-placeholder')?.textContent).toBe('SQL 입력');
  });

  it('follows the app dark mode and the UI language of the find panel', async () => {
    render({ value: '' }, 'ko');
    const view = viewOf();
    expect(view.state.phrase('Find')).toBe('찾기');
    const lightClass = view.dom.className;
    await act(async () => {
      document.documentElement.classList.add('dark');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(view.dom.className).not.toBe(lightClass);
  });
});

describe('CodeMirrorSqlEditor without completion (EDITOR_ASSIST is off)', () => {
  it('opens no completion list while typing or on Ctrl+Space', async () => {
    render({ value: '' });
    const view = viewOf();
    act(() => view.dispatch({ changes: { from: 0, insert: 'sel' }, selection: { anchor: 3 }, userEvent: 'input.type' }));
    act(() => { startCompletion(view); });
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(completionStatus(view.state)).toBeNull();
    expect(container.querySelector('.cm-tooltip-autocomplete')).toBeNull();
  });
});

describe('CodeMirrorSqlEditor in a dialog that saves on Enter', () => {
  const renderInModal = (onSubmit) => act(() => root.render(
    <Provider store={store()}>
      <Modal isOpen title="Edit Query Plan" onClose={vi.fn()} onSubmit={onSubmit}>
        <input data-testid="plan-id" defaultValue="plan_1" />
        <CodeMirrorSqlEditor testId="sql" value="SELECT 1 FROM db_root; SELECT 1 FROM db_root;" />
      </Modal>
    </Provider>,
  ));
  const enter = (el) => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true });
    act(() => { el.dispatchEvent(event); });
    return event;
  };

  it('finds the next match on Enter in the find field without saving the plan', () => {
    const onSubmit = vi.fn();
    renderInModal(onSubmit);
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor'));
    act(() => { openSearchPanel(view); });
    const find = document.querySelector('.cm-search input[name=search]');
    act(() => { view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'db_root' })) }); });
    const before = view.state.selection.main.from;
    expect(enter(find).defaultPrevented).toBe(true);
    expect(view.state.selection.main.from).not.toBe(before);
    expect(onSubmit).not.toHaveBeenCalled();

    // Enter in the dialog's own fields still saves.
    enter(document.querySelector('[data-testid="plan-id"]'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // The Enter that ends a Korean (IME) composition: isComposing, keyCode 229.
  const composingEnter = (el, how) => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', isComposing: how === 'isComposing', bubbles: true, cancelable: true });
    Object.defineProperty(event, 'keyCode', { value: how === 'keyCode' ? 229 : 13 });
    act(() => { el.dispatchEvent(event); });
  };

  it.each([['isComposing'], ['keyCode']])('does not save the plan on the Enter that ends a composition (%s) in the find, replace or dialog fields', (how) => {
    const onSubmit = vi.fn();
    renderInModal(onSubmit);
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor'));
    act(() => { openSearchPanel(view); });
    composingEnter(document.querySelector('.cm-search input[name=search]'), how);
    composingEnter(document.querySelector('.cm-search input[name=replace]'), how);
    composingEnter(document.querySelector('[data-testid="plan-id"]'), how);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.querySelector('.cm-editor')).not.toBeNull();
  });
});

describe('long lines in the SQL editor', () => {
  it('do not wrap, as in Monaco before (wordWrap off)', () => {
    render({ value: 'SELECT 1' });
    expect(viewOf().contentDOM.classList.contains('cm-lineWrapping')).toBe(false);
  });
});

describe('Tab in the SQL editor (as in Monaco before)', () => {
  const press = (view, shiftKey = false) => {
    const event = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, shiftKey, bubbles: true, cancelable: true });
    act(() => { view.contentDOM.dispatchEvent(event); });
    return event;
  };
  const at = (view, anchor, head = anchor) => act(() => view.dispatch({ selection: { anchor, head } }));

  it('puts spaces up to the next 4-column tab stop at the cursor, not at the start of the line', () => {
    const onChange = vi.fn();
    render({ value: 'SELECT 1', onChange });
    const view = viewOf();
    at(view, 2);
    expect(press(view).defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe('SE  LECT 1');
    expect(view.state.selection.main.head).toBe(4);
    at(view, 0);
    press(view);
    expect(view.state.doc.toString()).toBe('    SE  LECT 1');
    expect(onChange).toHaveBeenLastCalledWith('    SE  LECT 1');
  });

  it('replaces part of a line with the spaces; indents several selected lines by 4', () => {
    render({ value: 'SELECT a\nFROM t' });
    const view = viewOf();
    at(view, 7, 8);
    press(view);
    expect(view.state.doc.toString()).toBe('SELECT  \nFROM t');
    at(view, 0, view.state.doc.length);
    press(view);
    expect(view.state.doc.toString()).toBe('    SELECT  \n    FROM t');
  });

  it('Shift+Tab takes one indent off the start of the line, wherever the cursor is', () => {
    render({ value: '      SELECT 1' });
    const view = viewOf();
    at(view, 10);
    press(view, true);
    expect(view.state.doc.toString()).toBe('  SELECT 1');
  });

  it('read only: leaves Tab to the page (the focus moves on) and changes nothing', () => {
    render({ value: 'SELECT 1', readOnly: true });
    const view = viewOf();
    expect(press(view).defaultPrevented).toBe(false);
    expect(view.state.doc.toString()).toBe('SELECT 1');
  });
});

describe('Enter in the SQL editor (as in Monaco before)', () => {
  const enterAt = (value, anchor) => {
    render({ value });
    const view = viewOf();
    act(() => view.dispatch({ selection: { anchor } }));
    act(() => {
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
    });
    return view;
  };

  it('keeps the indentation of the line on the new line', () => {
    const view = enterAt('    SELECT 1', 12);
    expect(view.state.doc.toString()).toBe('    SELECT 1\n    ');
    expect(view.state.selection.main.head).toBe(17);
  });

  it('writes a tab indentation as 4 spaces', () => {
    expect(enterAt('\tSELECT 1', 9).state.doc.toString()).toBe('\tSELECT 1\n    ');
  });

  it('goes one level deeper after (, and puts ) on its own line between ( and )', () => {
    expect(enterAt('SELECT (', 8).state.doc.toString()).toBe('SELECT (\n    ');
    const view = enterAt('  IN ()', 6);
    expect(view.state.doc.toString()).toBe('  IN (\n      \n  )');
    expect(view.state.selection.main.head).toBe(13);
  });

  it('right after the indentation: the spaces stay and the text moves down with the same indentation', () => {
    expect(enterAt('    SELECT 1', 4).state.doc.toString()).toBe('    \n    SELECT 1');
  });
});

describe('Edit > Redo in the desktop app', () => {
  it('redoes in the editor when the menu offers it, and takes the event', () => {
    const onChange = vi.fn();
    render({ value: 'SELECT 1', onChange });
    const view = viewOf();
    act(() => view.dispatch({ changes: { from: 8, insert: ' FROM t' } }));
    act(() => { undo(view); });
    expect(view.state.doc.toString()).toBe('SELECT 1');
    const event = new CustomEvent('cwm-edit-redo', { bubbles: true, cancelable: true });
    act(() => { view.contentDOM.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe('SELECT 1 FROM t');
  });
});
