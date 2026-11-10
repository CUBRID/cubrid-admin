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
import hostReducer, { formatServiceFailures } from './hostSlice';
import { CM } from '../../constants/cmLabels';
import { CM_KO } from '../../constants/cmLabels.ko';
import databaseReducer from '../database/databaseCoreSlice';
import brokerReducer from '../broker/brokerSlice';
import { restartHostService } from './hostServiceRestart';

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
  databaseApi.restartWholeService.mockResolvedValue({ stopFailed: [], startFailed: [], skipped: [], leftStopped: [] });
  const store = makeStore();

  const result = await store.dispatch(restartHostService('h1'));

  expect(databaseApi.restartWholeService).toHaveBeenCalledTimes(1);
  expect(databaseApi.restartWholeService).toHaveBeenCalledWith('h1');
  expect(databaseApi.stopWholeService).not.toHaveBeenCalled();
  expect(databaseApi.startWholeService).not.toHaveBeenCalled();
  expect(databaseApi.runSelectedDatabasesAction).not.toHaveBeenCalled();
  expect(databaseApi.readStartInfo).toHaveBeenCalled();
  expect(result).toEqual({ problems: [], skipped: [], leftStopped: [], haNodeFailed: false });
});

it('reports the stop and start failures, and passes on the databases left stopped', async () => {
  databaseApi.restartWholeService.mockResolvedValue({
    stopFailed: [{ name: 'brokers', error: 'x' }],
    startFailed: [],
    skipped: [],
    leftStopped: ['manual'],
  });
  const store = makeStore();

  const result = await store.dispatch(restartHostService('h1'));

  expect(result.problems).toEqual(['Failed to stop service for: brokers (x)']);
  expect(result.leftStopped).toEqual(['manual']);
});

it('passes on the databases the server skipped for no login, with their phase', async () => {
  const skipped = [{ name: 'manual', reason: 'Not logged in', phase: 'stop' }];
  databaseApi.restartWholeService.mockResolvedValue({ stopFailed: [], startFailed: [], skipped, leftStopped: [] });
  const store = makeStore();

  const result = await store.dispatch(restartHostService('h1'));

  expect(result.skipped).toEqual(skipped);
  expect(result.problems).toEqual([]);
});

it('reports a refused or failed request as the problem', async () => {
  databaseApi.restartWholeService.mockRejectedValue({ response: { data: { message: 'testdb is already being started or stopped' } } });
  const store = makeStore();

  const result = await store.dispatch(restartHostService('h1'));

  expect(result).toEqual({ problems: ['testdb is already being started or stopped'], skipped: [], leftStopped: [], haNodeFailed: false });
});

it('says when the node-wide ha_start failed, so HA on the node may be off', async () => {
  databaseApi.restartWholeService.mockResolvedValue({
    stopFailed: [], startFailed: [{ name: 'HA databases (heartbeat)', error: 'x' }], skipped: [], leftStopped: [],
  });
  const store = makeStore();

  const result = await store.dispatch(restartHostService('h1'));

  expect(result.haNodeFailed).toBe(true);
});

it('says which service steps failed and why in Korean', () => {
  const brokers = { name: 'brokers', type: '/errors/cms/request_failed', code: 'REQUEST_FAILED', cmsNote: 'x', cmsTask: 'stopbroker', error: 'x' };
  expect(formatServiceFailures('stop', [brokers], { ...CM, ...CM_KO })).toBe('서비스를 중지하지 못한 항목: 브로커 (CMS 작업이 실패했습니다. (x))');
  expect(formatServiceFailures('stop', [brokers], CM)).toBe('Failed to stop service for: brokers (x)');
});
