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
  overview: {
    esc: '100000',
    dinterval: '1.00',
    numlocked: '1',
    numallocated: '1000',
    sizelock: '242K',
    maxnumlock: '',
    transactions: pnames.map((program, i) => ({
      index: String(i + 1), program, user: 'DBA', host: 'app1', pid: '111', isolation: 'COMMITTED READ', timeout: ':',
    })),
  },
  summary: {
    totalLocks: 3,
    rows: pnames.length ? [
      { index: '1', user: 'DBA', host: 'app1', pid: '111', program: pnames[0], obj: 'Instance of class = dba.t1', mode: 'X_LOCK', count: 2 },
      { index: '1', user: 'DBA', host: 'app1', pid: '111', program: pnames[0], obj: 'Class = dba.t1', mode: 'IX_LOCK', count: 1 },
    ] : [],
  },
});

const objectResponse = {
  objects: [
    { oid: '0|201|-32763', obj: 'Class = dba.t1', holders: [{ index: '1', mode: 'IX_LOCK', count: '1' }], numHolders: '1', numBlockedHolders: '0', numWaiters: '0' },
  ],
};

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

  it('shows the transaction lock count, no ":" timeout, and the CMS units', async () => {
    databaseApi.getLockInfo.mockResolvedValueOnce(lockResponse('csql'));
    await render(makeStore());

    expect(databaseApi.getLockInfo).toHaveBeenCalledWith('host1', 'demodb', { summary: true });
    const cells = [...document.querySelectorAll('tbody tr td')].map((td) => td.textContent);
    expect(cells).toContain('3');
    expect(cells).not.toContain(':');

    await act(async () => document.querySelector('[data-testid="lock-information-tab-objects"]')?.click());
    const frame = q('lock-information-modal');
    expect(frame.textContent).toContain(CM.allocatedLockObjNum);
    expect(frame.textContent).toContain('242');
    expect(frame.textContent).toContain('KiB');
    expect(frame.textContent).toContain('Instance of class = dba.t1');
  });

  it('loads per-object rows only when that view is opened', async () => {
    databaseApi.getLockInfo.mockResolvedValueOnce(lockResponse('csql'));
    await render(makeStore());
    await act(async () => document.querySelector('[data-testid="lock-information-tab-objects"]')?.click());
    expect(databaseApi.getLockInfo).toHaveBeenCalledTimes(1);

    databaseApi.getLockInfo.mockResolvedValueOnce({ ...lockResponse('csql'), ...objectResponse });
    await act(async () => q('lock-information-object-view').click());

    // One request for both, so the server runs lockdb once.
    expect(databaseApi.getLockInfo).toHaveBeenCalledTimes(2);
    expect(databaseApi.getLockInfo).toHaveBeenLastCalledWith('host1', 'demodb', { summary: true, objects: true });
    expect(q('lock-information-objects').textContent).toContain('0|201|-32763');
  });

  const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
  const rowsIn = (testId) => Array.from(q(testId).querySelectorAll('tbody tr'));
  const clickPage = (testId, label) => act(async () => Array.from(q(testId).querySelectorAll('button'))
    .find((b) => b.textContent === label || b.getAttribute('aria-label') === label).click());

  it('pages the lock summary and the per-object rows 20 at a time', async () => {
    const summary = lockResponse('csql');
    summary.summary.rows = range(30).map((i) => ({
      index: '1', user: 'DBA', host: 'app1', pid: '111', program: 'csql', obj: `Class = dba.t${i}`, mode: 'IX_LOCK', count: 1,
    }));
    databaseApi.getLockInfo.mockResolvedValueOnce(summary);
    await render(makeStore());
    await act(async () => q('lock-information-tab-objects').click());

    const frame = q('lock-information-modal');
    expect(frame.textContent).toContain('dba.t20');
    expect(frame.textContent).not.toContain('dba.t21');
    expect(q('lock-information-summary-pages').textContent).toContain('Showing 1–20 of 30');
    await clickPage('lock-information-summary-pages', CM.nextPage);
    expect(frame.textContent).toContain('dba.t30');
    expect(frame.textContent).not.toContain('dba.t20');

    const objects = {
      objects: range(45).map((i) => ({
        oid: `0|${i}|1`, obj: 'Instance of class = dba.t1', holders: [{ index: '1', mode: 'X_LOCK', count: '1' }],
        numHolders: '1', numBlockedHolders: '0', numWaiters: '0',
      })),
    };
    databaseApi.getLockInfo.mockResolvedValueOnce({ ...summary, ...objects });
    await act(async () => q('lock-information-object-view').click());

    expect(rowsIn('lock-information-objects')).toHaveLength(20);
    expect(q('lock-information-summary-pages')).toBeNull();
    await clickPage('lock-information-objects-pages', '3');
    expect(rowsIn('lock-information-objects').map((tr) => tr.textContent.match(/0\|\d+\|1/)[0]))
      .toEqual(range(5).map((i) => `0|${40 + i}|1`));
  });

  it('pages the transaction list when there are more than 20 sessions', async () => {
    databaseApi.getLockInfo.mockResolvedValueOnce(lockResponse(...range(25).map((i) => `app${i}`)));
    await render(makeStore());

    expect(q('lock-information-sessions-pages').textContent).toContain('Showing 1–20 of 25');
    await clickPage('lock-information-sessions-pages', '2');
    expect(q('lock-information-modal').textContent).toContain('app25');
    expect(q('lock-information-modal').textContent).not.toContain('app20');
  });
});
