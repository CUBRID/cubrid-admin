import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { beforeEach, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  globalThis.localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
});
vi.mock('../database/databaseApi', () => ({
  databaseApi: {
    restartWholeService: vi.fn(),
    stopWholeService: vi.fn(),
    startWholeService: vi.fn(),
    getStartInfo: vi.fn(),
    readStartInfo: vi.fn(),
    runSelectedDatabasesAction: vi.fn(),
  },
}));
vi.mock('../broker/brokerApi', () => ({ brokerApi: { getBrokerList: vi.fn().mockResolvedValue([]) } }));
vi.mock('./hostApi', () => ({ hostApi: { getHaInfo: vi.fn().mockResolvedValue({}) } }));
import { databaseApi } from '../database/databaseApi';
import hostReducer from './hostSlice';
import databaseReducer from '../database/databaseCoreSlice';
import brokerReducer from '../broker/brokerSlice';
import { restartServiceKeepingDatabases } from './hostServiceRestart';

const makeStore = () => {
  const reducer = combineReducers({ host: hostReducer, database: databaseReducer, broker: brokerReducer });
  return configureStore({ reducer });
};

beforeEach(() => {
  vi.clearAllMocks();
  const info = { dblist: { dbs: [] }, activelist: { active: [] } };
  databaseApi.getStartInfo.mockResolvedValue(info);
  databaseApi.readStartInfo.mockImplementation(() => Promise.resolve({ ok: true, value: info, seq: 1 }));
});

it('restarts the service with one request and reads the host again afterwards', async () => {
  databaseApi.restartWholeService.mockResolvedValue({ stopFailed: [], startFailed: [], notRestarted: [] });
  const store = makeStore();

  const result = await store.dispatch(restartServiceKeepingDatabases('h1'));

  expect(databaseApi.restartWholeService).toHaveBeenCalledTimes(1);
  expect(databaseApi.restartWholeService).toHaveBeenCalledWith('h1');
  expect(databaseApi.stopWholeService).not.toHaveBeenCalled();
  expect(databaseApi.startWholeService).not.toHaveBeenCalled();
  expect(databaseApi.runSelectedDatabasesAction).not.toHaveBeenCalled();
  expect(databaseApi.readStartInfo).toHaveBeenCalled();
  expect(result).toEqual({ problems: [], notRestarted: [] });
});

it('reports the stop and start failures and the databases not started again', async () => {
  databaseApi.restartWholeService.mockResolvedValue({
    stopFailed: [{ name: 'brokers', error: 'x' }],
    startFailed: [],
    notRestarted: [{ dbname: 'manual', error: 'boom' }],
  });
  const store = makeStore();

  const result = await store.dispatch(restartServiceKeepingDatabases('h1'));

  expect(result.problems).toEqual(['Failed to stop service for: brokers (x)']);
  expect(result.notRestarted).toEqual([{ dbname: 'manual', error: 'boom' }]);
});

it('reports a refused or failed request as the problem', async () => {
  databaseApi.restartWholeService.mockRejectedValue({ response: { data: { message: 'testdb is already being started or stopped' } } });
  const store = makeStore();

  const result = await store.dispatch(restartServiceKeepingDatabases('h1'));

  expect(result).toEqual({ problems: ['testdb is already being started or stopped'], notRestarted: [] });
});
