import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./databaseApi', () => ({
  databaseApi: {
    runSelectedDatabasesAction: vi.fn(),
    loginDatabase: vi.fn(),
    loginDatabaseWithProfile: vi.fn(),
    logoutDatabase: vi.fn(),
    deleteDatabaseProfile: vi.fn(),
  },
}));
import { databaseApi } from './databaseApi';
import reducer from './databaseCoreSlice';
import { databaseSelectionRows, runMultiDatabaseAction, splitByAction } from './databaseMultiActions';
import { CM } from '../../constants/cmLabels';

beforeEach(() => vi.resetAllMocks());

const storeWith = (database) => configureStore({
  reducer: { database: reducer },
  preloadedState: { database: { ...reducer(undefined, { type: '@@init' }), ...database } },
});

describe('databaseSelectionRows', () => {
  it('reads each database of the host with what the actions need, keyed by host', () => {
    const store = storeWith({
      navigatorDatabasesByHost: { h1: [{ dbname: 'a', isProfileExists: true }, { dbname: 'b' }] },
      navigatorActiveDatabasesByHost: { h1: ['a'] },
      haDbNamesByHost: { h1: ['a'] },
      loggedInDatabases: ['h1:a', 'h2:b'],
    });

    expect(databaseSelectionRows(store.getState(), 'h1')).toEqual([
      { dbname: 'a', running: true, loggedIn: true, hasProfile: true, isHa: true },
      { dbname: 'b', running: false, loggedIn: false, hasProfile: false, isHa: false },
    ]);
  });

  it('follows the lists the tree shows, not a newer background read', () => {
    const store = storeWith({
      navigatorDatabasesByHost: { h1: [{ dbname: 'a' }, { dbname: 'b' }] },
      navigatorActiveDatabasesByHost: { h1: ['a'] },
      databasesByHost: { h1: [{ dbname: 'a' }] },
      activeDatabasesByHost: { h1: [] },
    });

    expect(databaseSelectionRows(store.getState(), 'h1').map((r) => [r.dbname, r.running])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });
});

describe('splitByAction', () => {
  const rows = [
    { dbname: 'a', running: true, loggedIn: true, hasProfile: true },
    { dbname: 'b', running: false, loggedIn: false, hasProfile: false },
  ];
  it.each([
    ['start', ['b']], ['stop', ['a']], ['restart', ['a']],
    ['login', ['b']], ['logout', ['a']], ['forgetCredentials', ['a']],
  ])('%s applies to %j', (action, expected) => {
    expect(splitByAction(action, rows).targets.map((r) => r.dbname)).toEqual(expected);
  });
});

describe('runMultiDatabaseAction', () => {
  it('sends start/stop/restart to the server in one request and marks successes logged in', async () => {
    databaseApi.runSelectedDatabasesAction.mockResolvedValue({
      succeeded: ['a'], failed: [{ dbname: 'b', error: 'x', phase: 'stop' }], skipped: [],
    });
    const store = storeWith({});

    const result = await runMultiDatabaseAction(store.dispatch, CM, {
      hostUid: 'h1', action: 'restart', rows: [{ dbname: 'a' }, { dbname: 'b' }],
    });

    expect(databaseApi.runSelectedDatabasesAction).toHaveBeenCalledWith('h1', 'restart', ['a', 'b']);
    expect(result.failed).toEqual([{ dbname: 'b', error: 'x', phase: 'stop' }]);
    expect(store.getState().database.loggedInDatabases).toContain('h1:a');
  });

  it('logs in with saved credentials, then each database\'s entered account, and skips the rest', async () => {
    databaseApi.loginDatabaseWithProfile.mockResolvedValue({});
    databaseApi.loginDatabase.mockRejectedValueOnce({ response: { data: { message: 'bad password' } } });
    const store = storeWith({});
    const rows = [
      { dbname: 'saved', hasProfile: true },
      { dbname: 'typed', hasProfile: false },
    ];

    const withCreds = await runMultiDatabaseAction(store.dispatch, CM, {
      hostUid: 'h1', action: 'login', rows, credentials: { typed: { id: 'dba', password: 'pw' } },
    });
    const withoutCreds = await runMultiDatabaseAction(store.dispatch, CM, { hostUid: 'h1', action: 'login', rows });

    expect(databaseApi.loginDatabase).toHaveBeenCalledWith('h1', 'typed', { id: 'dba', password: 'pw' });
    expect(withCreds).toEqual({
      succeeded: ['saved'], failed: [{ dbname: 'typed', error: 'bad password' }], skipped: [],
    });
    expect(withoutCreds.skipped).toEqual([{ dbname: 'typed', reason: CM.noSavedCredentialsReason }]);
  });

  it('keeps going after one logout fails', async () => {
    databaseApi.logoutDatabase.mockRejectedValueOnce({ response: { data: { message: 'boom' } } }).mockResolvedValue({});
    const store = storeWith({});

    const result = await runMultiDatabaseAction(store.dispatch, CM, {
      hostUid: 'h1', action: 'logout', rows: [{ dbname: 'a' }, { dbname: 'b' }],
    });

    expect(result).toEqual({ succeeded: ['b'], failed: [{ dbname: 'a', error: 'boom' }], skipped: [] });
  });
});

describe('multiDbConfirmDesc', () => {
  it('names the first five targets and counts the rest', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(CM.multiDbConfirmDesc('Start', names)).toBe('Start (7): a, b, c, d, e and 2 more');
    expect(CM.multiDbConfirmDesc('Start', ['a', 'b'])).toBe('Start (2): a, b');
  });
});
