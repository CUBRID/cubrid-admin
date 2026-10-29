import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { beforeEach, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  globalThis.localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
});
vi.mock('../database/databaseApi', () => ({
  databaseApi: {
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

const storeWithRunning = (active) => {
  const reducer = combineReducers({ host: hostReducer, database: databaseReducer, broker: brokerReducer });
  const initial = reducer(undefined, { type: '@@init' });
  return configureStore({
    reducer,
    preloadedState: { ...initial, database: { ...initial.database, activeDatabasesByHost: { h1: active } } },
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  databaseApi.stopWholeService.mockResolvedValue({ failed: [] });
  databaseApi.startWholeService.mockResolvedValue({ failed: [] });
});

it('starts again the databases that were running before but not after the service start', async () => {
  const info = { dblist: { dbs: [{ dbname: 'auto' }, { dbname: 'manual' }] }, activelist: { active: [{ dbname: 'auto' }] } };
  databaseApi.getStartInfo.mockResolvedValue(info);
  databaseApi.readStartInfo.mockImplementation(() => Promise.resolve({ ok: true, value: info, seq: 1 }));
  databaseApi.runSelectedDatabasesAction.mockResolvedValue({ succeeded: ['manual'], failed: [], skipped: [] });
  const store = storeWithRunning(['auto', 'manual']);

  const result = await store.dispatch(restartServiceKeepingDatabases('h1'));

  expect(databaseApi.stopWholeService).toHaveBeenCalledBefore(databaseApi.startWholeService);
  expect(databaseApi.runSelectedDatabasesAction).toHaveBeenCalledWith('h1', 'start', ['manual']);
  expect(result).toEqual({ problems: [], notRestarted: [] });
});

it('still starts the service when the stop reported failures', async () => {
  databaseApi.stopWholeService.mockResolvedValue({ failed: [{ name: 'brokers', error: 'x' }] });
  const info = { dblist: { dbs: [] }, activelist: { active: [] } };
  databaseApi.getStartInfo.mockResolvedValue(info);
  databaseApi.readStartInfo.mockImplementation(() => Promise.resolve({ ok: true, value: info, seq: 1 }));
  const store = storeWithRunning([]);

  const result = await store.dispatch(restartServiceKeepingDatabases('h1'));

  expect(databaseApi.startWholeService).toHaveBeenCalled();
  expect(result.problems).toHaveLength(1);
});
