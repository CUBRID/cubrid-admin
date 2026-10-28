import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real databaseSlice pulls in apiClient and every database thunk.
vi.mock('../databaseSlice', () => ({
  closeTransactionInfoModal: vi.fn(() => ({ type: 'test/close' })),
  openKillTransactionModal: vi.fn(() => ({ type: 'test/openKill' })),
}));
vi.mock('../databaseApi', () => ({ databaseApi: { getTransactionInfo: vi.fn() } }));

import { databaseApi } from '../databaseApi';
import TransactionInfoModal from './TransactionInfoModal';
import { CM } from '../../../constants/cmLabels';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const txResponse = (...indexes) => ({
  transactioninfo: [{ transaction: indexes.map((i) => ({ tranindex: `${i}(ACTIVE)`, '@user': 'DBA', host: 'h', pid: '1', program: `prog${i}` })) }],
});

const makeStore = () => configureStore({
  reducer: {
    user: (s = { preferences: { uiLocale: 'en' } }) => s,
    host: (s = { selectedHostUid: 'host1' }) => s,
    database: (s = { selectedDatabase: 'demodb', activeDatabasesByHost: { host1: ['demodb'] } }) => s,
    databaseUI: (s = { isTransactionInfoModalOpen: true, transactionKillSignal: 0 }, action) => (
      action.type === 'test/killed' ? { ...s, transactionKillSignal: s.transactionKillSignal + 1 } : s
    ),
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
  root.render(<Provider store={store}><TransactionInfoModal /></Provider>);
});
const q = (id) => document.querySelector(`[data-testid="${id}"]`);

describe('TransactionInfoModal', () => {
  it('opens on the list frame with an in-modal spinner, then fills it in place', async () => {
    const request = deferred();
    databaseApi.getTransactionInfo.mockReturnValueOnce(request.promise);
    await render(makeStore());

    const frame = q('transaction-info-modal');
    expect(frame).toBeTruthy();
    expect(q('transaction-info-loading')).toBeTruthy();
    expect(q('transaction-info-refresh-btn').disabled).toBe(true);
    expect(q('transaction-info-kill-btn').disabled).toBe(true);

    await act(async () => request.resolve(txResponse(1)));

    // Same frame element: it was never unmounted between loading and success.
    expect(q('transaction-info-modal')).toBe(frame);
    expect(q('transaction-info-loading')).toBeNull();
    expect(frame.textContent).toContain('prog1');
  });

  it('keeps the modal and current list mounted with a spinner during a refresh', async () => {
    databaseApi.getTransactionInfo.mockResolvedValueOnce(txResponse(1));
    await render(makeStore());
    const frame = q('transaction-info-modal');
    expect(frame.textContent).toContain('prog1');

    const refresh = deferred();
    databaseApi.getTransactionInfo.mockReturnValueOnce(refresh.promise);
    await act(async () => q('transaction-info-refresh-btn').click());

    expect(q('transaction-info-modal')).toBe(frame);
    expect(q('transaction-info-loading')).toBeTruthy();
    expect(frame.textContent).toContain('prog1');
    expect(q('transaction-info-refresh-btn').disabled).toBe(true);

    await act(async () => refresh.resolve(txResponse(2)));
    expect(q('transaction-info-modal')).toBe(frame);
    expect(q('transaction-info-loading')).toBeNull();
    expect(frame.textContent).toContain('prog2');
    expect(frame.textContent).not.toContain('prog1');
  });

  it('shows the error and Retry in the same frame', async () => {
    databaseApi.getTransactionInfo.mockRejectedValueOnce({ response: { data: { note: 'boom' } } });
    await render(makeStore());

    expect(q('transaction-info-modal')).toBeTruthy();
    expect(q('transaction-info-error').textContent).toContain('boom');
    expect(q('transaction-info-loading')).toBeNull();

    databaseApi.getTransactionInfo.mockResolvedValueOnce(txResponse(3));
    await act(async () => q('transaction-info-retry-btn').click());
    expect(q('transaction-info-error')).toBeNull();
    expect(q('transaction-info-modal').textContent).toContain('prog3');
  });

  it('refetches in place after a kill', async () => {
    databaseApi.getTransactionInfo.mockResolvedValueOnce(txResponse(1, 2));
    const store = makeStore();
    await render(store);
    const frame = q('transaction-info-modal');

    databaseApi.getTransactionInfo.mockResolvedValueOnce(txResponse(2));
    await act(async () => store.dispatch({ type: 'test/killed' }));

    expect(databaseApi.getTransactionInfo).toHaveBeenCalledTimes(2);
    expect(q('transaction-info-modal')).toBe(frame);
    expect(frame.textContent).not.toContain('prog1');
    expect(frame.textContent).toContain('prog2');
  });

  it('does not show a loading modal title swap (no separate status modal)', async () => {
    databaseApi.getTransactionInfo.mockReturnValueOnce(deferred().promise);
    await render(makeStore());
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(q('transaction-info-modal').textContent).toContain(CM.loadingLabel);
  });
});
