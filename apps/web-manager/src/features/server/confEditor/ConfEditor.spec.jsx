import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { undo } from '@codemirror/commands';
import { completionStatus, startCompletion } from '@codemirror/autocomplete';
import { diagnosticCount } from '@codemirror/lint';
import ConfEditor from './ConfEditor';

const store = configureStore({ reducer: { user: () => ({ preferences: { uiLocale: 'en' } }) } });
const LOADED = '[common]\ncubrid_port_id=1523\n';
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
});

const render = (props) => act(() => root.render(
  <Provider store={store}><ConfEditor kind="cubridconf" testId="conf" {...props} /></Provider>,
));
const viewOf = () => EditorView.findFromDOM(container.querySelector('.cm-editor'));

it('keeps the loaded file when undo goes all the way back, and does not report the load as an edit', () => {
  const onChange = vi.fn();
  // The editor chunk is already loaded (a second conf tab, reopen, refresh):
  // the editor shows '' first, then the file arrives.
  render({ value: '', onChange });
  render({ value: LOADED, onChange });
  const view = viewOf();
  expect(view.state.doc.toString()).toBe(LOADED);
  expect(onChange).not.toHaveBeenCalled();

  act(() => view.dispatch({ changes: { from: view.state.doc.length, insert: 'max_clients=100\n' } }));
  expect(onChange).toHaveBeenLastCalledWith(`${LOADED}max_clients=100\n`);
  act(() => { while (undo(view)); });
  expect(view.state.doc.toString()).toBe(LOADED);
  expect(onChange).toHaveBeenLastCalledWith(LOADED);
  expect(onChange).not.toHaveBeenCalledWith('');
});

it('takes a reload from outside without an undo step back to the old text', () => {
  const onChange = vi.fn();
  render({ value: LOADED, onChange });
  render({ value: `${LOADED}# reloaded\n`, onChange });
  const view = viewOf();
  act(() => { while (undo(view)); });
  expect(view.state.doc.toString()).toBe(`${LOADED}# reloaded\n`);
  expect(onChange).not.toHaveBeenCalled();
});

it('shows the placeholder in the UI language', () => {
  render({ value: '', placeholder: '# Configuration...' });
  expect(container.querySelector('.cm-placeholder')?.textContent).toBe('# Configuration...');
  render({ value: '', placeholder: '# 설정 내용...' });
  expect(container.querySelector('.cm-placeholder')?.textContent).toBe('# 설정 내용...');
});

// What getEnv sends (paramSchemas), cut down: enough for an underline and a hint on cubrid_port_id.
const SCHEMAS = {
  database: [{ key: 'cubrid_port_id', category: 'common', guard: { kind: 'int', min: 1, max: 65535 }, default: '1523', scope: 'BOTH' }],
  broker: [],
  cm: [],
  knownKeys: { strict: true, catalogVersion: '11.4.5', database: ['cubrid_port_id'], broker: [], databaseGuards: {}, databaseScopes: { cubrid_port_id: 'BOTH' }, databaseDeprecated: [] },
};
const wait = (ms) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

// EDITOR_ASSIST is off: the editor offers none of these.
it('opens no completion list while typing a key or on Ctrl+Space', async () => {
  render({ value: '[common]\n', paramSchemas: SCHEMAS });
  const view = viewOf();
  const end = view.state.doc.length;
  act(() => view.dispatch({ changes: { from: end, insert: 'cubrid_po' }, selection: { anchor: end + 9 }, userEvent: 'input.type' }));
  act(() => { startCompletion(view); });
  await wait(300);
  expect(completionStatus(view.state)).toBeNull();
  expect(container.querySelector('.cm-tooltip-autocomplete')).toBeNull();
});

it('underlines no value and shows no lint gutter', async () => {
  render({ value: '[common]\ncubrid_port_id=abc\n', paramSchemas: SCHEMAS });
  // The check would run 500 ms after the text is set.
  await wait(900);
  const view = viewOf();
  expect(diagnosticCount(view.state)).toBe(0);
  expect(container.querySelector('.cm-lintRange')).toBeNull();
  expect(container.querySelector('.cm-gutter-lint')).toBeNull();
});

it('shows no hint while the pointer rests on a key name', async () => {
  render({ value: '[common]\ncubrid_port_id=1523\n', paramSchemas: SCHEMAS });
  const view = viewOf();
  // jsdom has no layout: place the pointer on the key by hand.
  const keyPos = view.state.doc.toString().indexOf('cubrid_port_id') + 3;
  vi.spyOn(view, 'posAtCoords').mockReturnValue(keyPos);
  vi.spyOn(view, 'coordsAtPos').mockReturnValue({ top: 20, bottom: 40, left: 35, right: 45 });
  view.contentDOM.querySelector('.cm-line:nth-child(2)').dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 40, clientY: 30 }));
  await wait(600);
  expect(container.querySelector('.cm-tooltip-hover')).toBeNull();
  expect(document.querySelector('.cm-conf-hint')).toBeNull();
});

it('leaves Tab and Shift+Tab to the page: the focus moves on, as in the textarea before, and the text stays', () => {
  render({ value: LOADED, onChange: vi.fn() });
  const view = viewOf();
  act(() => view.dispatch({ selection: { anchor: 5 } }));
  for (const shiftKey of [false, true]) {
    const event = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, shiftKey, bubbles: true, cancelable: true });
    act(() => { view.contentDOM.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
  }
  expect(view.state.doc.toString()).toBe(LOADED);
});

describe('Enter and long lines, as in the textarea before', () => {
  const enter = (view) => act(() => {
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
  });

  it('Enter only breaks the line at the cursor: the spaces before # stay, no indent is copied', () => {
    const text = '[common]\nmax_clients=100  # comment\n  indented=1\n';
    render({ value: text, onChange: vi.fn() });
    const view = viewOf();
    const after100 = text.indexOf('100') + 3;
    act(() => view.dispatch({ selection: { anchor: after100 } }));
    enter(view);
    expect(view.state.doc.toString()).toBe('[common]\nmax_clients=100\n  # comment\n  indented=1\n');

    const endIndented = view.state.doc.toString().indexOf('indented=1') + 'indented=1'.length;
    act(() => view.dispatch({ selection: { anchor: endIndented } }));
    enter(view);
    expect(view.state.doc.toString()).toBe('[common]\nmax_clients=100\n  # comment\n  indented=1\n\n');
  });

  it('Enter on a line of spaces keeps them', () => {
    render({ value: 'a=1\n    \nb=2', onChange: vi.fn() });
    const view = viewOf();
    act(() => view.dispatch({ selection: { anchor: 8 } }));
    enter(view);
    expect(view.state.doc.toString()).toBe('a=1\n    \n\nb=2');
  });

  it('wraps long lines', () => {
    render({ value: LOADED });
    expect(viewOf().contentDOM.classList.contains('cm-lineWrapping')).toBe(true);
  });
});
