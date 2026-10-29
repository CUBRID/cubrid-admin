import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real databaseSlice pulls in apiClient and every database thunk.
vi.mock('../databaseSlice', () => ({
  closeLockInformationModal: vi.fn(() => ({ type: 'test/close' })),
}));
vi.mock('../databaseApi', () => ({ databaseApi: { getLockInfo: vi.fn() } }));

import { databaseApi } from '../databaseApi';
import LockInformationModal from './LockInformationModal';
import { CM } from '../../../constants/cmLabels';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const lockResponse = (...pnames) => ({
  lockinfo: [{
    dinterval: '1000',
    esc: '100000',
    lot: [{ numlocked: '1', numallocated: '10', entry: [] }],
    transaction: pnames.map((pname, i) => ({ index: String(i + 1), pname, isolevel: 'READ COMMITTED' })),
  }],
});

const makeStore = () => configureStore({
  reducer: {
    user: (s = { preferences: { uiLocale: 'en' } }) => s,
    host: (s = { selectedHostUid: 'host1' }) => s,
    database: (s = { selectedDatabase: 'demodb', activeDatabasesByHost: { host1: ['demodb'] } }) => s,
    databaseUI: (s = { isLockInformationModalOpen: true }) => s,
  },
});

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

const render = (store) => act(async () => {
  root.render(<Provider store={store}><LockInformationModal /></Provider>);
});
const q = (id) => document.querySelector(`[data-testid="${id}"]`);

describe('LockInformationModal', () => {
  it('shows a spinner (and no empty table) from the first open until the data arrives', async () => {
    const request = deferred();
    databaseApi.getLockInfo.mockReturnValueOnce(request.promise);
    await render(makeStore());

    const frame = q('lock-information-modal');
    expect(q('lock-information-loading')).toBeTruthy();
    expect(frame.textContent).not.toContain(CM.noActiveTransactions);
    expect(q('lock-information-refresh-btn').disabled).toBe(true);

    await act(async () => request.resolve(lockResponse('csql')));
    expect(q('lock-information-modal')).toBe(frame);
    expect(q('lock-information-loading')).toBeNull();
    expect(frame.textContent).toContain('csql');
  });

  it('shows "no active transactions" only after a successful empty fetch', async () => {
    databaseApi.getLockInfo.mockResolvedValueOnce(lockResponse());
    await render(makeStore());
    expect(q('lock-information-modal').textContent).toContain(CM.noActiveTransactions);
  });

  it('keeps the current content with a spinner during a refresh, then updates it', async () => {
    databaseApi.getLockInfo.mockResolvedValueOnce(lockResponse('csql'));
    await render(makeStore());
    const frame = q('lock-information-modal');

    const refresh = deferred();
    databaseApi.getLockInfo.mockReturnValueOnce(refresh.promise);
    await act(async () => q('lock-information-refresh-btn').click());

    expect(q('lock-information-modal')).toBe(frame);
    expect(q('lock-information-loading')).toBeTruthy();
    expect(frame.textContent).toContain('csql');

    await act(async () => refresh.resolve(lockResponse('loaddb')));
    expect(q('lock-information-loading')).toBeNull();
    expect(frame.textContent).toContain('loaddb');
    expect(frame.textContent).not.toContain('csql');
  });

  it('shows the error with Retry, then recovers', async () => {
    databaseApi.getLockInfo.mockRejectedValueOnce({ response: { data: { note: 'boom' } } });
    await render(makeStore());

    expect(q('lock-information-error').textContent).toContain('boom');
    expect(q('lock-information-loading')).toBeNull();

    databaseApi.getLockInfo.mockResolvedValueOnce(lockResponse('csql'));
    await act(async () => q('lock-information-retry-btn').click());
    expect(q('lock-information-error')).toBeNull();
    expect(q('lock-information-modal').textContent).toContain('csql');
  });
});
