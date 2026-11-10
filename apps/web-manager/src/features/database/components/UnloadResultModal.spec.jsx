import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
vi.mock('../../../api/apiClient', () => ({ default: { defaults: { headers: { common: {} } } } }));
import UnloadResultModal from './UnloadResultModal';
import { isPartialUnloadRow, unloadRowCount } from '../unloadResultRows';
import uiReducer, { openUnloadResultModal } from '../databaseUISlice';

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it.each([
  ['1234 (100%/38%)', '1234'],
  ['0 (100%/100%)', '0'],
  ['  57 (100%/12%)', '57'],
  ['no rows', 'no rows'],
  ['', ''],
])('takes the row count from unloaddb\'s "%s"', (stats, shown) => {
  expect(unloadRowCount(stats)).toBe(shown);
});

it('lists each table with its row count, without the percentages', async () => {
  const store = configureStore({
    reducer: { user: () => ({ preferences: { uiLocale: 'en' } }), databaseUI: uiReducer },
    preloadedState: {
      databaseUI: {
        ...uiReducer(undefined, { type: 'init' }),
        isUnloadResultModalOpen: true,
        unloadResultData: [{ athlete: '6677 (100%/38%)', game: '8653 (100%/88%)' }],
      },
    },
  });
  await act(async () => root.render(<Provider store={store}><UnloadResultModal /></Provider>));

  const cells = [...document.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()));
  expect(cells).toEqual([['athlete', '6677'], ['game', '8653']]);
  expect(document.body.textContent).not.toContain('%');
  expect(document.body.textContent).toContain('Table');
  expect(document.body.textContent).toContain('Rows');
});

const renderResult = (result) => {
  const store = configureStore({
    reducer: { user: () => ({ preferences: { uiLocale: 'en' } }), databaseUI: uiReducer },
    preloadedState: {
      databaseUI: { ...uiReducer(undefined, { type: 'init' }), isUnloadResultModalOpen: true, unloadResultData: [result] },
    },
  });
  return act(async () => root.render(<Provider store={store}><UnloadResultModal /></Provider>));
};
const tableRows = () => [...document.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td').textContent.trim());
const partialNote = () => document.querySelector('[data-testid="unload-result-partial"]');

// unloaddb's "Only N out of M objects dumped successfully." reaches the
// result as a row of its own (see isPartialUnloadRow).
it.each([
  ['English', { athlete: '6677 (100%/38%)', Only: 'out of/objects' }],
  ['Korean', { athlete: '6677 (100%/38%)', 5: '객체가 (전체/객체)' }],
])('keeps the partial-unload line out of the table and says some objects were not unloaded (%s engine messages)', async (_, result) => {
  await renderResult(result);
  expect(tableRows()).toEqual(['athlete']);
  expect(partialNote().textContent).toBe('Some objects were not unloaded.');
});

it('says nothing about a partial unload when every object was unloaded', async () => {
  await renderResult({ athlete: '6677 (100%/38%)', game: '8653 (100%/88%)' });
  expect(partialNote()).toBeNull();
});

it('recognises only the partial-unload line as one', () => {
  expect(isPartialUnloadRow('Only', 'out of/objects')).toBe(true);
  expect(isPartialUnloadRow('12', '객체가 (전체/객체)')).toBe(true);
  expect(isPartialUnloadRow('Only', '12 (100%/40%)')).toBe(false);
  expect(isPartialUnloadRow('athlete', '6677 (100%/38%)')).toBe(false);
});

// An unload CMS failed only on the OBJECT-type warning ends with warnings and
// no rows (openUnloadResultModal takes the job's result and warnings).
const renderJob = (payload) => {
  const store = configureStore({ reducer: { user: () => ({ preferences: { uiLocale: 'en' } }), databaseUI: uiReducer } });
  store.dispatch(openUnloadResultModal(payload));
  return act(async () => root.render(<Provider store={store}><UnloadResultModal /></Provider>));
};
const OBJECT_WARNING = "warning: [dba.tb] has object type. So for class [dba.tb], '--thread-count' option is ignored.";

it('shows the warnings and no empty table when the counts were not written', async () => {
  await renderJob({ result: [], warnings: [OBJECT_WARNING, 'Because of this warning, the table counts and the Load Database list entry were not written.'] });
  expect(document.body.textContent).toContain(OBJECT_WARNING);
  expect(document.body.textContent).toContain('table counts');
  expect(document.querySelector('table')).toBeNull();
});

it('shows the counted tables, and no warning, for a job without warnings', async () => {
  await renderJob({ result: [{ 'dba.tc': '2 (100%/100%)' }] });
  expect(tableRows()).toEqual(['dba.tc']);
  expect(document.querySelectorAll('[role="alert"]')).toHaveLength(0);
});
