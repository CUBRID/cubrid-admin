import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import brokerReducer, { fetchDatabaseLogs } from './brokerSlice';
import { databaseLoginLost } from '../database/databaseCoreSlice';

describe('database log lists', () => {
  it('keeps one list per host for the same database name, and drops one when its login is gone', () => {
    const store = configureStore({ reducer: { broker: brokerReducer } });
    store.dispatch(fetchDatabaseLogs.fulfilled({ dbname: 'demodb', logs: [{ path: '/h1.log' }] }, 'r1', { hostUid: 'h1', dbname: 'demodb' }));
    store.dispatch(fetchDatabaseLogs.fulfilled({ dbname: 'demodb', logs: [{ path: '/h2.log' }] }, 'r2', { hostUid: 'h2', dbname: 'demodb' }));

    expect(store.getState().broker.dbLogsByDb['h1:demodb']).toEqual([{ path: '/h1.log' }]);
    expect(store.getState().broker.dbLogsByDb['h2:demodb']).toEqual([{ path: '/h2.log' }]);

    store.dispatch(databaseLoginLost({ hostUid: 'h1', dbname: 'demodb' }));

    expect(store.getState().broker.dbLogsByDb['h1:demodb']).toBeUndefined();
    expect(store.getState().broker.dbLogsByDb['h2:demodb']).toEqual([{ path: '/h2.log' }]);
  });
});
