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
import UnloadResultModal, { unloadRowCount } from './UnloadResultModal';
import uiReducer from '../databaseUISlice';

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
