import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
const mocks = vi.hoisted(() => ({ runJob: vi.fn() }));
vi.mock('../../../api/apiClient', () => ({ default: { defaults: { headers: { common: {} } } } }));
vi.mock('../../../infrastructure/hooks/useCmsJob', () => ({
  useCmsJob: () => ({ runJob: mocks.runJob, background: vi.fn(), wasBackgrounded: () => false }),
}));
import CompactDatabaseModal from './CompactDatabaseModal';
import uiReducer from '../databaseUISlice';

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = (uiLocale) => act(async () => {
  const fixed = {
    user: { preferences: { uiLocale } },
    host: { selectedHostUid: 'host-1' },
    database: { selectedDatabase: 'demodb' },
  };
  const store = configureStore({
    reducer: {
      ...Object.fromEntries(Object.entries(fixed).map(([key, value]) => [key, () => value])),
      databaseUI: uiReducer,
    },
    preloadedState: { databaseUI: { ...uiReducer(undefined, { type: 'init' }), isCompactDatabaseModalOpen: true } },
  });
  root.render(<Provider store={store}><CompactDatabaseModal /></Provider>);
});
const run = () => act(async () => container.querySelector('[data-testid="compact-database-run-btn"]').click());

it.each([
  ['en', 'Compaction Complete', 'Optimization Complete'],
  ['ko', '공간 정리 완료', '최적화 완료'],
])('says compaction, not optimization, when it finishes (%s)', async (locale, done, optimization) => {
  mocks.runJob.mockResolvedValue({ jobId: 'job-1', jobStatus: 'succeeded', result: {} });
  await render(locale);
  await run();

  expect(container.textContent).toContain(done);
  expect(container.textContent).not.toContain(optimization);
});
