import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// layoutSlice reads the preferred color scheme at import time.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
import layoutReducer, { showStatusModal } from '../../features/layout/layoutSlice';
import StatusModal from './StatusModal';
import { CM } from '../../constants/cmLabels';
import { bulkResultStatusModal } from '../../features/database/databaseBulkActions';
import { hostLoginFailureTables } from '../../features/host/hostLoginReport';

// Bulk results used to be one long "Failed: a (reason), b (reason)" sentence
// (and, for Start/Stop/Restart All, only behind "Show details" under a
// generic headline). Now: a short headline, then the tables, visible directly.

let container;
let root;
let store;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  store = configureStore({
    reducer: { layout: layoutReducer, user: () => ({ preferences: { uiLocale: 'en' } }) },
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const renderWith = async (payload) => {
  store.dispatch(showStatusModal(payload));
  await act(async () => {
    root.render(<Provider store={store}><StatusModal /></Provider>);
  });
};

const rowsOf = (testId) => [...document.querySelectorAll(`[data-testid="${testId}"] tbody tr`)]
  .map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));

it('Restart All: headline plus a failed table (phase per row, database once) and a separate skipped table', async () => {
  await renderWith(bulkResultStatusModal(CM, {
    title: CM.restartAllDatabases,
    failedMsg: CM.someDatabasesFailedToRestartMsg,
    failed: [
      { dbname: 'otherdb', phase: 'stop', error: 'Error: Missing credentials for otherdb' },
      { dbname: 'otherdb', phase: 'start', error: 'Missing credentials for otherdb' },
    ],
    skipped: [{ dbname: 'hadb1', reason: 'HA bulk start/stop is limited to the CMS admin account' }],
    showPhase: true,
  }));

  expect(document.body.textContent).toContain('1 database(s) failed to restart. 1 database(s) skipped.');
  expect(document.body.textContent).not.toContain('Show details');
  expect(rowsOf('bulk-failed-table')).toEqual([
    ['otherdb', 'stop', 'Missing credentials for otherdb'],
    ['start', 'Missing credentials for otherdb'],
  ]);
  expect(document.querySelector('[data-testid="bulk-failed-table"] td[rowspan="2"]').textContent).toBe('otherdb');
  expect(rowsOf('bulk-skipped-table')).toEqual([['hadb1', 'HA bulk start/stop requires the CMS admin account']]);
});

it('Start All: no phase column, and nothing to show when every database succeeded', async () => {
  expect(bulkResultStatusModal(CM, { title: 'x', failedMsg: CM.someDatabasesFailedToStartMsg, failed: [], skipped: [] }))
    .toBeNull();

  await renderWith(bulkResultStatusModal(CM, {
    title: CM.startAllDatabases,
    failedMsg: CM.someDatabasesFailedToStartMsg,
    failed: [{ dbname: 'demodb', error: 'boom' }],
  }));

  expect(document.body.textContent).toContain('1 database(s) failed to start.');
  expect([...document.querySelectorAll('[data-testid="bulk-failed-table"] th')].map((th) => th.textContent))
    .toEqual(['Database', 'Reason']);
  expect(rowsOf('bulk-failed-table')).toEqual([['demodb', 'boom']]);
});

it('Login All (host import): headline plus a Host | Reason table', async () => {
  const failed = [
    { name: 'host-a', reason: 'Error: Invalid password' },
    { name: 'host-b', reason: 'connect ECONNREFUSED' },
  ];
  await renderWith({
    type: 'info',
    title: CM.loginAll,
    message: `${CM.connectedHostsMsg(1)} ${CM.hostsFailedToLoginMsg(failed.length)}`,
    tables: hostLoginFailureTables(CM, failed),
  });

  expect(document.body.textContent).toContain('Connected 1 host(s). 2 host(s) failed to log in.');
  expect([...document.querySelectorAll('[data-testid="login-failed-table"] th')].map((th) => th.textContent))
    .toEqual(['Host', 'Reason']);
  expect(rowsOf('login-failed-table')).toEqual([
    ['host-a', 'Invalid password'],
    ['host-b', 'connect ECONNREFUSED'],
  ]);
  expect(hostLoginFailureTables(CM, [])).toBeNull();
});
