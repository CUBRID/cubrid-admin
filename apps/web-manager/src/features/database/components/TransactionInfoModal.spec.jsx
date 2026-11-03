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

  const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const shownPrograms = () => Array.from(document.querySelectorAll('[data-testid="transaction-info-modal"] tbody tr'))
    .map((tr) => tr.textContent.match(/prog\d+/)?.[0]);
  const pageButton = (label) => Array.from(q('transaction-info-pages').querySelectorAll('button'))
    .find((b) => b.textContent === label || b.getAttribute('aria-label') === label);

  it('shows 20 transactions a page and moves between pages', async () => {
    databaseApi.getTransactionInfo.mockResolvedValueOnce(txResponse(...range(1, 45)));
    await render(makeStore());

    expect(shownPrograms()).toEqual(range(1, 20).map((i) => `prog${i}`));
    expect(q('transaction-info-pages').textContent).toContain('Showing 1–20 of 45');

    await act(async () => pageButton('3').click());
    expect(shownPrograms()).toEqual(range(41, 45).map((i) => `prog${i}`));

    await act(async () => pageButton(CM.previousPage).click());
    expect(shownPrograms()[0]).toBe('prog21');
  });

  it('stays on the last page that still exists when a refresh returns fewer transactions', async () => {
    databaseApi.getTransactionInfo.mockResolvedValueOnce(txResponse(...range(1, 45)));
    await render(makeStore());
    await act(async () => pageButton('3').click());

    databaseApi.getTransactionInfo.mockResolvedValueOnce(txResponse(...range(1, 25)));
    await act(async () => q('transaction-info-refresh-btn').click());
    expect(shownPrograms()).toEqual(range(21, 25).map((i) => `prog${i}`));

    databaseApi.getTransactionInfo.mockResolvedValueOnce(txResponse(1, 2));
    await act(async () => q('transaction-info-refresh-btn').click());
    expect(shownPrograms()).toEqual(['prog1', 'prog2']);
    expect(q('transaction-info-pages')).toBeNull();
  });

  it('keeps the clamped page when the transactions grow back', async () => {
    databaseApi.getTransactionInfo.mockResolvedValueOnce(txResponse(...range(1, 45)));
    await render(makeStore());
    await act(async () => pageButton('3').click());

    databaseApi.getTransactionInfo.mockResolvedValueOnce(txResponse(...range(1, 25)));
    await act(async () => q('transaction-info-refresh-btn').click());
    databaseApi.getTransactionInfo.mockResolvedValueOnce(txResponse(...range(1, 45)));
    await act(async () => q('transaction-info-refresh-btn').click());

    expect(shownPrograms()[0]).toBe('prog21');
  });

  it('drops the selection when the page changes, so Kill never acts on a row out of view', async () => {
    databaseApi.getTransactionInfo.mockResolvedValueOnce(txResponse(...range(1, 45)));
    await render(makeStore());
    const firstRow = document.querySelector('[data-testid="transaction-info-modal"] tbody tr');
    await act(async () => firstRow.click());
    expect(q('transaction-info-kill-btn').disabled).toBe(false);

    await act(async () => pageButton(CM.nextPage).click());
    expect(q('transaction-info-kill-btn').disabled).toBe(true);
  });

  it('sorts every transaction by index before paging, not just the page in view', async () => {
    databaseApi.getTransactionInfo.mockResolvedValueOnce(txResponse(...range(1, 45)));
    await render(makeStore());
    const header = () => Array.from(document.querySelectorAll('[data-testid="transaction-info-modal"] th'))
      .find((th) => th.textContent.includes(CM.tranIndex));

    await act(async () => header().click());
    await act(async () => header().click());
    expect(header().getAttribute('aria-sort')).toBe('descending');
    expect(shownPrograms()).toEqual(range(26, 45).reverse().map((i) => `prog${i}`));
  });
});
