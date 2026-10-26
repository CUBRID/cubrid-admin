import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./databaseApi', () => ({
  databaseApi: {
    stopDatabase: vi.fn(),
    getStartInfo: vi.fn(),
    loginDatabaseWithProfile: vi.fn(),
    logoutDatabase: vi.fn(),
  },
}));
import { databaseApi } from './databaseApi';
import reducer, {
  stopDatabase, loginDatabase, logoutDatabase, resetDatabaseState, clearDatabaseLoginsForHost,
  clearDatabaseLogin, fetchDatabaseStartInfo, setSelectedDatabase,
} from './databaseCoreSlice';

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

beforeEach(() => vi.resetAllMocks());
const stop = () => configureStore({ reducer }).dispatch(stopDatabase({ hostUid: 'host', dbname: 'db1' }));
const failure = { response: { data: { message: 'CMS stop timeout' } } };

it.each([undefined, {}, { activelist: {} }, { activelist: { active: [null] } },
  { activelist: { active: [{}] } }, { activelist: { active: 'invalid' } },
  { activelist: { active: ['db1'] } }, { activelist: { active: [{ dbname: 'db1' }] } },
])('does not report a successful stop for unknown or still-active status %j', async info => {
  databaseApi.stopDatabase.mockRejectedValue(failure);
  databaseApi.getStartInfo.mockResolvedValue(info);
  const result = await stop();
  expect(result.type).toBe(stopDatabase.rejected.type);
  expect(result.payload).toBe('CMS stop timeout');
  expect(databaseApi.stopDatabase).toHaveBeenCalledTimes(1);
});

it('accepts a timed-out stop only when a valid status read confirms it stopped', async () => {
  const info = { activelist: { active: [{ dbname: 'other' }] } };
  databaseApi.stopDatabase.mockRejectedValue(failure);
  databaseApi.getStartInfo.mockResolvedValue(info);
  const result = await stop();
  expect(result.type).toBe(stopDatabase.fulfilled.type);
  expect(result.payload).toEqual(info);
});

it('preserves the stop error when the recovery read fails', async () => {
  databaseApi.stopDatabase.mockRejectedValue(failure);
  databaseApi.getStartInfo.mockRejectedValue(new Error('status unavailable'));
  expect((await stop()).payload).toBe('CMS stop timeout');
});

describe('loggedInDatabases is scoped per host, not by bare dbname', () => {
  // Two different physical hosts routinely have a same-named database
  // (e.g. both called "demodb") — logging into one must never make the
  // other host's same-named db appear logged in, or share its cached data.
  it('keys login state by (hostUid, dbname)', async () => {
    databaseApi.loginDatabaseWithProfile.mockResolvedValue(true);
    const store = configureStore({ reducer });

    await store.dispatch(loginDatabase({ hostUid: 'hostA', dbname: 'demodb' }));

    const { loggedInDatabases } = store.getState();
    expect(loggedInDatabases).toContain('hostA:demodb');
    expect(loggedInDatabases).not.toContain('hostB:demodb');
    expect(loggedInDatabases).not.toContain('demodb');
  });

  it('logging into hostB\'s "demodb" does not affect hostA\'s "demodb"', async () => {
    databaseApi.loginDatabaseWithProfile.mockResolvedValue(true);
    const store = configureStore({ reducer });

    await store.dispatch(loginDatabase({ hostUid: 'hostA', dbname: 'demodb' }));
    await store.dispatch(loginDatabase({ hostUid: 'hostB', dbname: 'demodb' }));

    const { loggedInDatabases } = store.getState();
    expect(loggedInDatabases).toContain('hostA:demodb');
    expect(loggedInDatabases).toContain('hostB:demodb');
    expect(loggedInDatabases).toHaveLength(2);
  });

  it('logoutDatabase only clears the (host, dbname) pair it targets', async () => {
    databaseApi.loginDatabaseWithProfile.mockResolvedValue(true);
    databaseApi.logoutDatabase.mockResolvedValue(undefined);
    const store = configureStore({ reducer });

    await store.dispatch(loginDatabase({ hostUid: 'hostA', dbname: 'demodb' }));
    await store.dispatch(loginDatabase({ hostUid: 'hostB', dbname: 'demodb' }));
    await store.dispatch(logoutDatabase({ hostUid: 'hostA', dbname: 'demodb' }));

    const { loggedInDatabases } = store.getState();
    expect(loggedInDatabases).not.toContain('hostA:demodb');
    expect(loggedInDatabases).toContain('hostB:demodb');
  });

  it('resetDatabaseState (plain host-focus switch) does not clear other hosts\' logins', async () => {
    databaseApi.loginDatabaseWithProfile.mockResolvedValue(true);
    const store = configureStore({ reducer });

    await store.dispatch(loginDatabase({ hostUid: 'hostA', dbname: 'demodb' }));
    await store.dispatch(loginDatabase({ hostUid: 'hostB', dbname: 'demodb' }));
    store.dispatch(resetDatabaseState());

    const { loggedInDatabases } = store.getState();
    expect(loggedInDatabases).toContain('hostA:demodb');
    expect(loggedInDatabases).toContain('hostB:demodb');
  });

  it('clearDatabaseLoginsForHost only purges the targeted host\'s logins', async () => {
    databaseApi.loginDatabaseWithProfile.mockResolvedValue(true);
    const store = configureStore({ reducer });

    await store.dispatch(loginDatabase({ hostUid: 'hostA', dbname: 'demodb' }));
    await store.dispatch(loginDatabase({ hostUid: 'hostB', dbname: 'demodb' }));
    store.dispatch(clearDatabaseLoginsForHost('hostA'));

    const { loggedInDatabases } = store.getState();
    expect(loggedInDatabases).not.toContain('hostA:demodb');
    expect(loggedInDatabases).toContain('hostB:demodb');
  });

  it('clearDatabaseLogin only clears the one (hostUid, dbname) pair it targets', async () => {
    databaseApi.loginDatabaseWithProfile.mockResolvedValue(true);
    const store = configureStore({ reducer });

    await store.dispatch(loginDatabase({ hostUid: 'hostA', dbname: 'demodb' }));
    await store.dispatch(loginDatabase({ hostUid: 'hostA', dbname: 'otherdb' }));
    await store.dispatch(loginDatabase({ hostUid: 'hostB', dbname: 'demodb' }));

    // Mirrors what the apiClient response interceptor dispatches on a
    // MISSING_DB_CREDENTIALS failure — the server-side session this db's
    // padlock icon implied still existed has actually expired.
    store.dispatch(clearDatabaseLogin({ hostUid: 'hostA', dbname: 'demodb' }));

    const { loggedInDatabases } = store.getState();
    expect(loggedInDatabases).not.toContain('hostA:demodb');
    expect(loggedInDatabases).toContain('hostA:otherdb');
    expect(loggedInDatabases).toContain('hostB:demodb');
  });
});

describe('deleting a database clears its cached login state here too', () => {
  // The backend forgets the stored login profile + dbmt-login cache for a
  // deleted/renamed dbname (see DatabaseLifecycleService.deleteDatabase and
  // DatabaseManagementService.clearDbAliasCachesAfterRename) so a different,
  // later database that ends up with that same name can't silently inherit
  // it — mirror that belief here too, or the client would keep showing the
  // old, now-gone database's name as still "logged in". (Rename goes through
  // a CMS job, not a thunk; RenameDatabaseModal clears both names itself.)
  it("clears the deleted dbname's login state for that host", () => {
    const store = configureStore({ reducer, preloadedState: { loggedInDatabases: ['hostA:demodb'], loggingInDatabases: {} } });

    store.dispatch({ type: 'database/deleteDatabase/fulfilled', meta: { arg: { hostUid: 'hostA', dbname: 'demodb' } } });

    expect(store.getState().loggedInDatabases).not.toContain('hostA:demodb');
  });
});

describe('fetchDatabaseStartInfo stale-response guard is scoped per host', () => {
  // The guard discards a response whose requestId no longer matches the
  // latest one dispatched — but scoped per hostUid. A single shared id
  // would mean a request for ANY host marks every other host's in-flight
  // request as superseded the instant it's dispatched, so a slower host's
  // own, perfectly current response gets discarded as if stale forever.
  it('does not let a request for one host discard another host\'s in-flight response', async () => {
    const hostA = deferred();
    const hostB = deferred();
    databaseApi.getStartInfo.mockImplementation((hostUid) => (hostUid === 'hostA' ? hostA.promise : hostB.promise));
    const store = configureStore({ reducer });

    const dispatchA = store.dispatch(fetchDatabaseStartInfo('hostA'));
    // hostB's request starts while hostA's is still in flight — with a
    // single shared requestId, this would mark hostA's own request stale.
    store.dispatch(fetchDatabaseStartInfo('hostB'));

    hostA.resolve({ dblist: { dbs: [{ dbname: 'demodb' }] } });
    await dispatchA;

    const { databasesByHost } = store.getState();
    expect(databasesByHost.hostA).toEqual([{ dbname: 'demodb' }]);
  });

  it('still discards a genuinely superseded response for the SAME host', async () => {
    const first = deferred();
    const second = deferred();
    let call = 0;
    databaseApi.getStartInfo.mockImplementation(() => (++call === 1 ? first.promise : second.promise));
    const store = configureStore({ reducer });

    const dispatchFirst = store.dispatch(fetchDatabaseStartInfo('hostA'));
    const dispatchSecond = store.dispatch(fetchDatabaseStartInfo('hostA'));

    second.resolve({ dblist: { dbs: [{ dbname: 'newer' }] } });
    await dispatchSecond;
    first.resolve({ dblist: { dbs: [{ dbname: 'stale' }] } });
    await dispatchFirst;

    const { databasesByHost } = store.getState();
    expect(databasesByHost.hostA).toEqual([{ dbname: 'newer' }]);
  });
});

describe('database lists are stored per host, not in one shared array', () => {
  // Per-host dedup alone isn't enough: even a response that correctly
  // passes the per-host staleness guard (nothing else for THAT host
  // superseded it) can still be "late" relative to the user's own
  // navigation — they switched away to a different host's tab before it
  // resolved. If all hosts wrote into one shared `databases`/
  // `activeDatabases` array, that host's perfectly-valid-for-itself
  // response would still overwrite whatever the UI is currently showing
  // for the NEW, currently-viewed host. Storing each host's lists in their
  // own slot makes that physically impossible instead of relying on timing.
  it("a host's slow response that resolves after the user has moved on to a different host does not affect that other host's stored lists", async () => {
    const hostA = deferred();
    databaseApi.getStartInfo.mockImplementation((hostUid) => (hostUid === 'hostA'
      ? hostA.promise
      : Promise.resolve({ dblist: { dbs: [{ dbname: 'hostB-db' }] }, activelist: { active: ['hostB-db'] } })));
    const store = configureStore({ reducer });

    // hostA's request is dispatched and still in flight...
    const dispatchA = store.dispatch(fetchDatabaseStartInfo('hostA'));
    // ...the user switches to hostB (no further hostA dispatch happens —
    // hostA's in-flight request is simply never superseded by anything).
    await store.dispatch(fetchDatabaseStartInfo('hostB'));

    expect(store.getState().databasesByHost.hostB).toEqual([{ dbname: 'hostB-db' }]);
    expect(store.getState().activeDatabasesByHost.hostB).toEqual(['hostB-db']);

    // hostA's slow response finally arrives, well after the switch.
    hostA.resolve({ dblist: { dbs: [{ dbname: 'hostA-db' }] }, activelist: { active: ['hostA-db'] } });
    await dispatchA;

    // It's stored in hostA's own slot...
    expect(store.getState().databasesByHost.hostA).toEqual([{ dbname: 'hostA-db' }]);
    // ...and hostB's displayed lists are completely unaffected by it.
    expect(store.getState().databasesByHost.hostB).toEqual([{ dbname: 'hostB-db' }]);
    expect(store.getState().activeDatabasesByHost.hostB).toEqual(['hostB-db']);
  });

  it("a late response for a host the user left does not null out a database the user has since selected on the new host", async () => {
    const hostA = deferred();
    databaseApi.getStartInfo.mockImplementation((hostUid) => (hostUid === 'hostA'
      ? hostA.promise
      : Promise.resolve({ dblist: { dbs: [{ dbname: 'hostB-db' }] } })));
    const store = configureStore({ reducer });

    const dispatchA = store.dispatch(fetchDatabaseStartInfo('hostA'));
    store.dispatch({ type: 'host/setSelectedHost', payload: 'hostA' });
    await store.dispatch(fetchDatabaseStartInfo('hostB'));
    store.dispatch({ type: 'host/setSelectedHost', payload: 'hostB' });

    // User selects a database that only exists on hostB.
    store.dispatch(setSelectedDatabase('hostB-db'));
    expect(store.getState().selectedDatabase).toBe('hostB-db');

    // hostA's slow response — which doesn't contain "hostB-db" — finally
    // resolves. It must not clear the selection the user just made on hostB.
    hostA.resolve({ dblist: { dbs: [{ dbname: 'hostA-db' }] } });
    await dispatchA;

    expect(store.getState().selectedDatabase).toBe('hostB-db');
  });

  it("a response in flight when its host is deleted/disconnected does not resurrect that host's evicted slot", async () => {
    const hostA = deferred();
    databaseApi.getStartInfo.mockImplementation(() => hostA.promise);
    const store = configureStore({ reducer });

    const dispatchA = store.dispatch(fetchDatabaseStartInfo('hostA'));
    // Host A is deleted/disconnected while its own fetch is still in
    // flight — nothing else for host A will ever supersede this request,
    // so the per-host dedup alone wouldn't catch it as stale.
    store.dispatch({ type: 'layout/closeHostTabs', payload: 'hostA' });
    expect(store.getState().databasesByHost.hostA).toBeUndefined();

    hostA.resolve({ dblist: { dbs: [{ dbname: 'hostA-db' }] }, activelist: { active: ['hostA-db'] } });
    await dispatchA;

    // The deleted host's slots must stay gone — nothing will ever clean
    // them up again once the host itself is gone.
    expect(store.getState().databasesByHost.hostA).toBeUndefined();
    expect(store.getState().activeDatabasesByHost.hostA).toBeUndefined();
  });

  it('clears loading when its host is deleted/disconnected mid-fetch, instead of leaving it stuck', async () => {
    const hostA = deferred();
    databaseApi.getStartInfo.mockImplementation(() => hostA.promise);
    const store = configureStore({ reducer });

    const dispatchA = store.dispatch(fetchDatabaseStartInfo('hostA'));
    expect(store.getState().loadingByHost.hostA).toBe(true);

    // Host A is deleted/disconnected while its fetch is still in flight.
    // Its eventual response will be discarded (evicted requestId never
    // matches again), but that discard path returns before ever reaching
    // the loadingByHost write — nothing else is fetching FOR HOST A, so
    // nothing would otherwise clear it.
    store.dispatch({ type: 'layout/closeHostTabs', payload: 'hostA' });
    expect(store.getState().loadingByHost.hostA).toBeUndefined();

    hostA.resolve({ dblist: { dbs: [{ dbname: 'hostA-db' }] } });
    await dispatchA;

    expect(store.getState().loadingByHost.hostA).toBeUndefined();
  });

  it("closing one host's tabs does not clear a different host's own in-flight loading", async () => {
    const hostA = deferred();
    const hostB = deferred();
    databaseApi.getStartInfo.mockImplementation((hostUid) => (hostUid === 'hostA' ? hostA.promise : hostB.promise));
    const store = configureStore({ reducer });

    store.dispatch(fetchDatabaseStartInfo('hostA'));
    const dispatchB = store.dispatch(fetchDatabaseStartInfo('hostB'));
    expect(store.getState().loadingByHost.hostB).toBe(true);

    // Host A is deleted/disconnected while host B's own, unrelated fetch is
    // still genuinely in flight — this must not touch host B's loading
    // flag (a single shared flag would have, since both would have set the
    // same one).
    store.dispatch({ type: 'layout/closeHostTabs', payload: 'hostA' });
    expect(store.getState().loadingByHost.hostB).toBe(true);

    hostB.resolve({ dblist: { dbs: [{ dbname: 'hostB-db' }] } });
    await dispatchB;
    expect(store.getState().loadingByHost.hostB).toBe(false);
  });
});
