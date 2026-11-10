import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./databaseApi', () => ({
  databaseApi: {
    readStartInfo: vi.fn(),
    getVolumeInfo: vi.fn(),
  },
}));

import { databaseApi } from './databaseApi';
import databaseCoreReducer from './databaseCoreSlice';
import databaseMonitoringReducer, { fetchDatabaseSpaceInfo } from './databaseMonitoringSlice';
import { refreshNavigatorDatabases } from './navigatorRefresh';

const HOST = 'host1';
const volumes = (names) => ({ spaceinfo: names.map((spacename) => ({ spacename, type: 'PERMANENT', purpose: 'PERMANENT' })) });
const startInfo = (dbs) => ({
  ok: true,
  seq: 1000,
  value: {
    dblist: { dbs: dbs.map(({ name, loggedIn }) => ({ dbname: name, isLoggedIn: loggedIn })) },
    activelist: { active: dbs.filter((d) => d.running).map(({ name, loggedIn }) => ({ dbname: name, isLoggedIn: loggedIn })) },
  },
});

const makeStore = async (dbs) => {
  const store = configureStore({ reducer: { database: databaseCoreReducer, databaseMonitoring: databaseMonitoringReducer } });
  // Each database's Space folder was opened once: its volumes are shown.
  databaseApi.getVolumeInfo.mockResolvedValue(volumes(['old']));
  for (const name of dbs) await store.dispatch(fetchDatabaseSpaceInfo({ hostUid: HOST, dbname: name }));
  databaseApi.getVolumeInfo.mockClear();
  return store;
};

const shownVolumes = (store, name) =>
  store.getState().databaseMonitoring.spaceInfo[`${HOST}:${name}`]?.volumes.map((v) => v.spacename);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('refreshNavigatorDatabases', () => {
  it('re-reads the shown volumes of a running, logged-in database after start-info', async () => {
    const store = await makeStore(['demodb']);
    databaseApi.readStartInfo.mockResolvedValue(startInfo([{ name: 'demodb', loggedIn: true, running: true }]));
    databaseApi.getVolumeInfo.mockResolvedValue(volumes(['old', 'demodb_x001']));

    await store.dispatch(refreshNavigatorDatabases(HOST));
    await vi.waitFor(() => expect(shownVolumes(store, 'demodb')).toEqual(['old', 'demodb_x001']));
    expect(databaseApi.readStartInfo).toHaveBeenCalledWith(HOST, { fresh: true });
    expect(databaseApi.getVolumeInfo).toHaveBeenCalledTimes(1);
  });

  it('reads nothing for a database that is not logged in, not running, or whose Space folder was never opened', async () => {
    const store = await makeStore(['nologin', 'stopped']);
    databaseApi.readStartInfo.mockResolvedValue(startInfo([
      { name: 'nologin', loggedIn: false, running: true },
      { name: 'stopped', loggedIn: true, running: false },
      { name: 'unopened', loggedIn: true, running: true },
    ]));

    await store.dispatch(refreshNavigatorDatabases(HOST));
    expect(databaseApi.getVolumeInfo).not.toHaveBeenCalled();
  });

  it('a database\'s own Refresh re-reads only that database', async () => {
    const store = await makeStore(['a', 'b']);
    databaseApi.readStartInfo.mockResolvedValue(startInfo([
      { name: 'a', loggedIn: true, running: true },
      { name: 'b', loggedIn: true, running: true },
    ]));
    databaseApi.getVolumeInfo.mockResolvedValue(volumes(['new']));

    await store.dispatch(refreshNavigatorDatabases(HOST, { dbname: 'b' }));
    expect(databaseApi.getVolumeInfo).toHaveBeenCalledTimes(1);
    expect(databaseApi.getVolumeInfo).toHaveBeenCalledWith(HOST, 'b');
  });
});
