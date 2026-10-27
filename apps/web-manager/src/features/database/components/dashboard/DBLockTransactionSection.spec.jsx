import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// The real databaseSlice pulls in apiClient (localStorage at import time) and
// every database thunk; this test only renders the section's empty states.
vi.mock('../../databaseSlice', () => ({
  fetchDashboardLocks: vi.fn(() => ({ type: 'test/fetchDashboardLocks' })),
  setSelectedDatabase: vi.fn(() => ({ type: 'test/setSelectedDatabase' })),
  openKillTransactionModal: vi.fn(() => ({ type: 'test/openKillTransactionModal' })),
  openTransactionInfoModal: vi.fn(() => ({ type: 'test/openTransactionInfoModal' })),
}));

import DBLockTransactionSection from './DBLockTransactionSection';
import { CM } from '../../../../constants/cmLabels';

const pollingProps = { hostUid: 'host1', dbname: 'demodb', isTabActive: false, refreshInterval: 0 };

const makeStore = () => configureStore({
  reducer: {
    databaseUI: (state = { transactionKillSignal: 0 }) => state,
    user: (state = { preferences: { uiLocale: 'en' } }) => state,
  },
});

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

const render = (props) => act(async () => {
  root.render(
    <Provider store={makeStore()}>
      <DBLockTransactionSection locks={[]} pollingProps={pollingProps} {...props} />
    </Provider>
  );
});

describe('DBLockTransactionSection empty state', () => {
  it('shows "no active locks" only after a successful empty lock fetch', async () => {
    await render({ locksStatus: 'loaded' });
    expect(container.textContent).toContain(CM.noLocksTitle);
    expect(container.textContent).not.toContain(CM.locksUnavailableTitle);
  });

  it('shows an unavailable state when the lock fetch failed', async () => {
    await render({ locksStatus: 'error' });
    expect(container.textContent).toContain(CM.locksUnavailableTitle);
    expect(container.textContent).toContain(CM.locksUnavailableMsg);
    expect(container.textContent).not.toContain(CM.noLocksTitle);
  });

  it('shows a loading state before the first lock fetch has finished', async () => {
    await render({ locksStatus: undefined });
    expect(container.textContent).toContain(CM.loadingLabel);
    expect(container.textContent).not.toContain(CM.noLocksTitle);
    expect(container.textContent).not.toContain(CM.locksUnavailableTitle);
  });
});

describe('DBLockTransactionSection grouped rows', () => {
  it('shows the program and the lock count of each group', async () => {
    const locks = [{ index: '4', user: 'DBA', host: 'ha-test-81', pid: '1387760', program: 'broker2_cub_cas_1', obj: 'Instance of class = dba.nca_bulk_lock_t', mode: 'X_LOCK', count: 20000 }];
    await render({ locks, locksStatus: 'loaded' });

    expect(container.textContent).toContain('broker2_cub_cas_1');
    expect(container.textContent).toContain('Instance of class = dba.nca_bulk_lock_t');
    expect(container.textContent).toContain((20000).toLocaleString());
  });
});
