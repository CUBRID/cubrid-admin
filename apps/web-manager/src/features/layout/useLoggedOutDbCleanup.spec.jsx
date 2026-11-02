import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
import layoutReducer, { openTab } from './layoutSlice';
import databaseReducer, { clearDatabaseLogin, fetchDatabaseStartInfo, loginDatabase, logoutDatabase } from '../database/databaseCoreSlice';
import databaseOperationReducer, { fetchBackupSchedule } from '../database/databaseOperationSlice';
import { dbTabScope, useLoggedOutDbCleanup } from './useLoggedOutDbCleanup';

function Probe() {
  useLoggedOutDbCleanup();
  return null;
}

let container;
let root;
let store;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  root = createRoot(container);
  store = configureStore({
    reducer: combineReducers({ layout: layoutReducer, database: databaseReducer, databaseOperation: databaseOperationReducer }),
  });
  await act(async () => root.render(<Provider store={store}><Probe /></Provider>));
});
afterEach(async () => {
  await act(async () => root.unmount());
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

// Thunk actions dispatched by hand, without their API calls.
let requestSeq = 0;
const startInfo = (hostUid, active) => act(async () => {
  const requestId = `r${++requestSeq}`;
  store.dispatch(fetchDatabaseStartInfo.pending(requestId, hostUid));
  store.dispatch(fetchDatabaseStartInfo.fulfilled(
    { dblist: { dbs: active }, activelist: { active } }, requestId, hostUid, { seq: 1000 + requestSeq }
  ));
});
const login = (hostUid, dbname) => act(async () => {
  store.dispatch(loginDatabase.fulfilled({ dbname }, 'login', { hostUid, dbname }, { seq: 1000 + ++requestSeq }));
});
const dispatch = (action) => act(async () => store.dispatch(action));
const openTabs = () => store.getState().layout.openTabs;

describe('dbTabScope', () => {
  it('reads (hostUid, dbname) from every per-database tab id and nothing else', () => {
    expect(dbTabScope('db:h1:demodb')).toEqual({ hostUid: 'h1', dbname: 'demodb' });
    expect(dbTabScope('db_space:h1:demodb')).toEqual({ hostUid: 'h1', dbname: 'demodb' });
    expect(dbTabScope('vol_category:h1:demodb:Active')).toEqual({ hostUid: 'h1', dbname: 'demodb' });
    expect(dbTabScope('vol_info:h1:demodb:/data/demodb_x001')).toEqual({ hostUid: 'h1', dbname: 'demodb' });
    expect(dbTabScope('all_db_logs:h1:demodb')).toEqual({ hostUid: 'h1', dbname: 'demodb' });
    expect(dbTabScope('db:demodb')).toBeNull();
    expect(dbTabScope('host:h1')).toBeNull();
    expect(dbTabScope('all_logs:h1:query_editor')).toBeNull();
  });
});

describe('useLoggedOutDbCleanup', () => {
  it('closes a database\'s tabs when start-info reports it not logged in, and keeps the others', async () => {
    await startInfo('h1', [{ dbname: 'a', isLoggedIn: true }, { dbname: 'b', isLoggedIn: true }]);
    await dispatch(openTab('host:h1'));
    await dispatch(openTab('db:h1:a'));
    await dispatch(openTab('db_space:h1:a'));
    await dispatch(openTab('vol_info:h1:a:/data/a_x001'));
    await dispatch(openTab('db:h1:b'));

    await startInfo('h1', [{ dbname: 'a', isLoggedIn: false }, { dbname: 'b', isLoggedIn: true }]);

    expect(openTabs()).toEqual(['host:h1', 'db:h1:b']);
  });

  it('closes the tabs on logout', async () => {
    await startInfo('h1', [{ dbname: 'a', isLoggedIn: true }]);
    await dispatch(openTab('db:h1:a'));
    await dispatch(openTab('vol_category:h1:a:Active'));

    await dispatch(logoutDatabase.fulfilled({ dbname: 'a' }, 'logout', { hostUid: 'h1', dbname: 'a' }));

    expect(openTabs()).toEqual([]);
  });

  it('closes the tab when the login is cleared after a MISSING_DB_CREDENTIALS reply', async () => {
    await startInfo('h1', [{ dbname: 'a', isLoggedIn: true }]);
    await dispatch(openTab('db:h1:a'));

    await dispatch(clearDatabaseLogin({ hostUid: 'h1', dbname: 'a' }));

    expect(openTabs()).toEqual([]);
  });

  it('does not close tabs of a host before start-info has been applied for it', async () => {
    // As after a disconnect, which resets every host's database state:
    // the logins are gone until the host's next start-info.
    await login('h1', 'a');
    await dispatch(openTab('db:h1:a'));
    await dispatch(clearDatabaseLogin({ hostUid: 'h1', dbname: 'a' }));
    expect(openTabs()).toEqual(['db:h1:a']);

    await startInfo('h1', [{ dbname: 'a', isLoggedIn: true }]);
    expect(openTabs()).toEqual(['db:h1:a']);

    await startInfo('h1', [{ dbname: 'a', isLoggedIn: false }]);
    expect(openTabs()).toEqual([]);
  });

  it('drops the backup plans cached under a login that start-info no longer reports', async () => {
    await startInfo('h1', [{ dbname: 'a', isLoggedIn: true }]);
    await dispatch(fetchBackupSchedule.fulfilled({ dbname: 'a', schedules: [{ backupid: 'nightly' }] }, 'bk', { hostUid: 'h1', dbname: 'a' }));
    expect(store.getState().databaseOperation.backupSchedules['h1:a']).toBeDefined();

    await startInfo('h1', [{ dbname: 'a', isLoggedIn: false }]);

    expect(store.getState().databaseOperation.backupSchedules['h1:a']).toBeUndefined();
  });
});
