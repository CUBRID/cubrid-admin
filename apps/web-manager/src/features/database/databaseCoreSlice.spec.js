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
  clearDatabaseLogin, fetchDatabaseStartInfo,
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

    const { databases } = store.getState();
    expect(databases).toEqual([{ dbname: 'demodb' }]);
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

    const { databases } = store.getState();
    expect(databases).toEqual([{ dbname: 'newer' }]);
  });
});
