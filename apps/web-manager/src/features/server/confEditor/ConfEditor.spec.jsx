import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { undo } from '@codemirror/commands';
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
