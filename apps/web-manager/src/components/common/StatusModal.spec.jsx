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
import hostReducer, { openAddHostModal } from '../../features/host/hostSlice';
import AddHostModal from '../../features/host/components/AddHostModal';
import { hostLoginResultStatusModal, importLoginAllStatusModal } from '../../features/host/hostLoginReport';

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
    reducer: { layout: layoutReducer, host: hostReducer, user: () => ({ preferences: { uiLocale: 'en' } }) },
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

const followUp = {
  type: 'discovery',
  payload: { nodes: [{ hostname: 'peer-x', ip: '10.9.9.9', port: 8001 }], groupId: 'g1', anchorHostUid: 'h1' },
};
const batch = {
  successCount: 1,
  failed: [{ name: 'host-b', reason: 'Error: Invalid password' }],
  results: [
    { uid: 'h1', name: 'host-a', status: 'connected', followUp },
    { uid: 'h2', name: 'host-b', status: 'failed', reason: 'Error: Invalid password' },
  ],
};

it('Login All: one dialog — headline, then Host | Result | Reason | HA follow-up', async () => {
  await renderWith(hostLoginResultStatusModal(CM, { title: CM.loginAll, batch }));

  expect(document.body.textContent)
    .toContain('Connected 1 host(s). 1 host(s) failed to log in. 1 host(s) have an HA follow-up.');
  expect([...document.querySelectorAll('[data-testid="login-result-table"] th')].map((th) => th.textContent))
    .toEqual(['Host', 'Result', 'Reason', 'HA follow-up']);
  expect(rowsOf('login-result-table')).toEqual([
    ['host-a', 'Connected', '', CM.haPeersDiscovered],
    ['host-b', 'Failed', 'Invalid password', '—'],
  ]);
  expect(store.getState().host.isDiscoveryModalOpen).toBe(false);
});

it('the HA follow-up button opens that deferred modal on demand, once, above the result dialog', async () => {
  await renderWith(hostLoginResultStatusModal(CM, { title: CM.loginAll, batch }));
  const button = document.querySelector('[data-testid="ha-follow-up-host-a"]');

  await act(async () => button.click());

  const host = store.getState().host;
  expect(host.isDiscoveryModalOpen).toBe(true);
  expect(host.suggestedHaNodes).toEqual(followUp.payload.nodes);
  expect(host.suggestedHaAnchorHostUid).toBe('h1');
  // The result dialog stays open underneath (HA modals render above it).
  expect(store.getState().layout.statusModal.isOpen).toBe(true);
  expect(button.disabled).toBe(true);
});

// Discovery → Add opens New Connection while the result dialog stays open;
// at the default z-2000 it sat behind the result dialog (z-[2100]).
it('New Connection opened from an HA follow-up stacks above the result dialog', async () => {
  const layerOf = (testId) => document.querySelector(`[data-testid="${testId}-modal"]`)?.closest('[data-modal-layer="true"]');
  store.dispatch(showStatusModal(hostLoginResultStatusModal(CM, { title: CM.loginAll, batch })));
  store.dispatch(openAddHostModal({ alias: 'peer-x', address: '10.9.9.9', port: 8001, id: 'admin', password: '' }));
  await act(async () => {
    root.render(
      <Provider store={store}>
        <StatusModal />
        <AddHostModal isOpen onClose={() => undefined} />
      </Provider>
    );
  });

  expect(layerOf('status').className).toContain('z-[2100]');
  expect(layerOf('add-host').className).toContain('z-[2200]');
});

it('Hosts → Import → Login All uses the same consolidated result', async () => {
  const report = importLoginAllStatusModal(CM, { savedCount: 2, passwordSaveFailed: [], batch });
  expect(report.tables).toEqual(hostLoginResultStatusModal(CM, { title: CM.loginAll, batch }).tables);
  await renderWith(report);

  expect(document.body.textContent).toContain('Password saved for 2 host(s). Connected 1 host(s).');
  expect(rowsOf('login-result-table').map((r) => r[0])).toEqual(['host-a', 'host-b']);
  expect(importLoginAllStatusModal(CM, { savedCount: 1, passwordSaveFailed: ['host-c'], batch }).type).toBe('error');
});
