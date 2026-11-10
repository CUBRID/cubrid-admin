import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./databaseApi', () => ({
  databaseApi: {
    getBackupSchedule: vi.fn(),
    getQueryPlan: vi.fn(),
    getLockInfo: vi.fn(),
    getTransactionInfo: vi.fn(),
  },
}));

import { databaseApi } from './databaseApi';
import reducer, { fetchBackupSchedule, fetchQueryPlan, fetchLockInfo, fetchTransactionInfo } from './databaseOperationSlice';

const HOST = 'host1';
const DB = 'demodb';
const KEY = `${HOST}:${DB}`;
const makeStore = () => configureStore({ reducer: { databaseOperation: reducer } });
const op = (store) => store.getState().databaseOperation;

beforeEach(() => vi.resetAllMocks());

describe('job automation list status', () => {
  it('leaves the lists unset before the first fetch settles', () => {
    const store = makeStore();
    expect(op(store).backupSchedules[KEY]).toBeUndefined();
    expect(op(store).queryPlans[KEY]).toBeUndefined();
  });

  it('stores an empty list after a successful empty fetch', async () => {
    databaseApi.getBackupSchedule.mockResolvedValue({ backups: [] });
    databaseApi.getQueryPlan.mockResolvedValue({ planlist: [{ dbname: DB, queryplan: [] }] });
    const store = makeStore();

    await store.dispatch(fetchBackupSchedule({ hostUid: HOST, dbname: DB }));
    await store.dispatch(fetchQueryPlan({ hostUid: HOST, dbname: DB }));

    expect(op(store).backupSchedules[KEY]).toEqual([]);
    expect(op(store).queryPlans[KEY]).toEqual([]);
    expect(op(store).backupSchedulesError[KEY]).toBeUndefined();
    expect(op(store).queryPlansError[KEY]).toBeUndefined();
  });

  it('flags a failed fetch, clears loading, and keeps the last list', async () => {
    const store = makeStore();
    databaseApi.getBackupSchedule.mockResolvedValueOnce({ backups: [{ backupid: 'b1' }] });
    await store.dispatch(fetchBackupSchedule({ hostUid: HOST, dbname: DB }));

    databaseApi.getBackupSchedule.mockRejectedValueOnce(new Error('timeout'));
    databaseApi.getQueryPlan.mockRejectedValueOnce(new Error('timeout'));
    await store.dispatch(fetchBackupSchedule({ hostUid: HOST, dbname: DB }));
    await store.dispatch(fetchQueryPlan({ hostUid: HOST, dbname: DB }));

    expect(op(store).backupSchedulesError[KEY]).toBe(true);
    expect(op(store).backupSchedulesLoading[KEY]).toBe(false);
    expect(op(store).backupSchedules[KEY]).toEqual([{ backupid: 'b1' }]);
    expect(op(store).queryPlansError[KEY]).toBe(true);

    databaseApi.getBackupSchedule.mockResolvedValueOnce({ backups: [] });
    await store.dispatch(fetchBackupSchedule({ hostUid: HOST, dbname: DB }));
    expect(op(store).backupSchedulesError[KEY]).toBeUndefined();
  });
});

describe('lock and transaction info of a same-named database on two hosts', () => {
  it('keeps each host its own value', async () => {
    databaseApi.getLockInfo.mockImplementation(async (hostUid) => ({ from: hostUid }));
    databaseApi.getTransactionInfo.mockImplementation(async (hostUid) => ({ from: hostUid }));
    const store = makeStore();
    for (const hostUid of ['hostA', 'hostB']) {
      await store.dispatch(fetchLockInfo({ hostUid, dbname: DB }));
      await store.dispatch(fetchTransactionInfo({ hostUid, dbname: DB }));
    }
    expect(op(store).lockInfo['hostA:demodb']).toEqual({ from: 'hostA' });
    expect(op(store).lockInfo['hostB:demodb']).toEqual({ from: 'hostB' });
    expect(op(store).transactionInfo['hostA:demodb']).toEqual({ from: 'hostA' });
    expect(op(store).transactionInfo['hostB:demodb']).toEqual({ from: 'hostB' });
  });
});
