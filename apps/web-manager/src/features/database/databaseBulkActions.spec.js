import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./databaseApi', () => ({
  databaseApi: {
    startDatabase: vi.fn(),
    stopDatabase: vi.fn(),
    startAllDatabases: vi.fn(),
    stopAllDatabases: vi.fn(),
  },
}));
import { databaseApi } from './databaseApi';
import reducer, {
  startDatabase, stopDatabase, startAllDatabases, stopAllDatabases,
} from './databaseCoreSlice';

beforeEach(() => vi.resetAllMocks());

describe('bulk start/stop isolate per-database failures instead of aborting the whole batch', () => {
  // Bug: "Stop All Databases" used to loop individual stopDatabase calls and
  // abort the whole operation the instant one database (e.g. one with no
  // stored login profile) failed. startAllDatabases/stopAllDatabases go
  // through the dedicated bulk endpoints instead, which already isolate
  // per-database failures server-side and report them in `failed` without
  // the request itself failing.
  it('startAllDatabases resolves (not rejects) even when some databases in the batch failed', async () => {
    databaseApi.startAllDatabases.mockResolvedValue({
      succeeded: ['demodb'],
      failed: [{ dbname: 'otherdb', error: 'Missing credentials for otherdb' }],
    });
    const store = configureStore({ reducer });

    const result = await store.dispatch(
      startAllDatabases({ hostUid: 'hostA', dbnames: ['demodb', 'otherdb'] })
    );

    expect(result.type).toBe(startAllDatabases.fulfilled.type);
    expect(result.payload.failed).toHaveLength(1);
  });

  it('stopAllDatabases resolves (not rejects) even when some databases in the batch failed', async () => {
    databaseApi.stopAllDatabases.mockResolvedValue({
      succeeded: ['demodb'],
      failed: [{ dbname: 'otherdb', error: 'Missing credentials for otherdb' }],
    });
    const store = configureStore({ reducer });

    const result = await store.dispatch(
      stopAllDatabases({ hostUid: 'hostA', dbnames: ['demodb', 'otherdb'] })
    );

    expect(result.type).toBe(stopAllDatabases.fulfilled.type);
    expect(result.payload.failed).toHaveLength(1);
  });
});

describe('a successful start/stop marks the database logged in, not just an explicit loginDatabase call', () => {
  // Bug: after "Restart All"/"Start All" silently (re-)authenticated a
  // database via the backend's own ensureDbLogin (no stored profile needed
  // beyond what's already saved), the frontend's loggedInDatabases never
  // learned about it — only the explicit loginDatabase thunk updated it.
  // That left this database's own individual Start/Stop menu item disabled
  // (gated on loggedInDatabases) even though the backend would happily
  // service it, so only the "All" actions (which don't check that gate)
  // kept working for it afterward.
  it('startDatabase.fulfilled marks (hostUid, dbname) as logged in', async () => {
    databaseApi.startDatabase.mockResolvedValue({ dblist: { dbs: [] }, activelist: { active: ['demodb'] } });
    const store = configureStore({ reducer });

    await store.dispatch(startDatabase({ hostUid: 'hostA', dbname: 'demodb' }));

    expect(store.getState().loggedInDatabases).toContain('hostA:demodb');
  });

  it('stopDatabase.fulfilled marks (hostUid, dbname) as logged in', async () => {
    databaseApi.stopDatabase.mockResolvedValue({ dblist: { dbs: [] }, activelist: { active: [] } });
    const store = configureStore({ reducer });

    await store.dispatch(stopDatabase({ hostUid: 'hostA', dbname: 'demodb' }));

    expect(store.getState().loggedInDatabases).toContain('hostA:demodb');
  });

  it('startAllDatabases.fulfilled marks every succeeded dbname as logged in, but not a failed one', async () => {
    databaseApi.startAllDatabases.mockResolvedValue({
      succeeded: ['demodb'],
      failed: [{ dbname: 'otherdb', error: 'Missing credentials for otherdb' }],
    });
    const store = configureStore({ reducer });

    await store.dispatch(startAllDatabases({ hostUid: 'hostA', dbnames: ['demodb', 'otherdb'] }));

    const { loggedInDatabases } = store.getState();
    expect(loggedInDatabases).toContain('hostA:demodb');
    expect(loggedInDatabases).not.toContain('hostA:otherdb');
  });

  it('stopAllDatabases.fulfilled marks every succeeded dbname as logged in, but not a failed one', async () => {
    databaseApi.stopAllDatabases.mockResolvedValue({
      succeeded: ['demodb'],
      failed: [{ dbname: 'otherdb', error: 'Missing credentials for otherdb' }],
    });
    const store = configureStore({ reducer });

    await store.dispatch(stopAllDatabases({ hostUid: 'hostA', dbnames: ['demodb', 'otherdb'] }));

    const { loggedInDatabases } = store.getState();
    expect(loggedInDatabases).toContain('hostA:demodb');
    expect(loggedInDatabases).not.toContain('hostA:otherdb');
  });
});
