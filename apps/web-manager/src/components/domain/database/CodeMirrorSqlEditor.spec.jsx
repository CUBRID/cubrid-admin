import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { CompletionContext } from '@codemirror/autocomplete';
import { undo } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import CodeMirrorSqlEditor from './CodeMirrorSqlEditor';
import { sqlLanguage } from './sqlLanguage';

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
