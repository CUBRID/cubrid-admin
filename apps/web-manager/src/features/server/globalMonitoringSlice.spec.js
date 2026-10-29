import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../host/hostApi', () => ({ hostApi: { getHostEnv: vi.fn() } }));
vi.mock('../database/databaseApi', () => {
  const databaseApi = { getStartInfo: vi.fn(), getVolumeInfo: vi.fn() };
  databaseApi.readStartInfo = (hostUid) => Promise.resolve()
    .then(() => databaseApi.getStartInfo(hostUid))
    .then((value) => ({ ok: true, value, seq: 0 }), (error) => ({ ok: false, error, seq: 0 }));
  return { databaseApi };
});
vi.mock('../broker/brokerApi', () => ({ brokerApi: { getBrokerList: vi.fn() } }));
vi.mock('./monitoringApi', () => ({ default: { getHostStat: vi.fn() } }));

import { hostApi } from '../host/hostApi';
import { databaseApi } from '../database/databaseApi';
import { brokerApi } from '../broker/brokerApi';
import monitoringApi from './monitoringApi';
import reducer, { fetchHostSummary } from './globalMonitoringSlice';

const makeStore = () => configureStore({ reducer: { globalMonitoring: reducer } });
const summary = (store) => store.getState().globalMonitoring.summaries.h1;
const brokerList = (tran, query) => [{ broker: [{ name: 'query_editor', tran: String(tran), query: String(query), error_query: '2', port: '30000' }] }];

let now;
beforeEach(() => {
  vi.resetAllMocks();
  now = vi.spyOn(Date, 'now');
  monitoringApi.getHostStat.mockResolvedValue({ cpu_user: '1', cpu_kernel: '1', cpu_idle: '1', cpu_iowait: '0' });
  databaseApi.getStartInfo.mockResolvedValue({ dblist: { dbs: [] }, activelist: { active: [] } });
  hostApi.getHostEnv.mockResolvedValue({});
});
afterEach(() => now.mockRestore());

describe('fetchHostSummary broker rates', () => {
  it('reports TPS/QPS as per-second rates, not lifetime totals', async () => {
    const store = makeStore();

    now.mockReturnValue(100_000);
    brokerApi.getBrokerList.mockResolvedValueOnce(brokerList(1000, 5000));
    await store.dispatch(fetchHostSummary('h1')).unwrap();
    expect(summary(store)).toMatchObject({ tps: null, qps: null, errorQ: 2, brokerPorts: '30000' });

    now.mockReturnValue(104_000);
    brokerApi.getBrokerList.mockResolvedValueOnce(brokerList(1040, 5200));
    await store.dispatch(fetchHostSummary('h1')).unwrap();
    expect(summary(store)).toMatchObject({ tps: 10, qps: 50 });
  });

  it('has no rate when the broker list could not be fetched', async () => {
    const store = makeStore();
    now.mockReturnValue(100_000);
    brokerApi.getBrokerList.mockResolvedValueOnce(brokerList(1000, 5000));
    await store.dispatch(fetchHostSummary('h1')).unwrap();

    now.mockReturnValue(104_000);
    brokerApi.getBrokerList.mockRejectedValueOnce(new Error('timeout'));
    await store.dispatch(fetchHostSummary('h1')).unwrap();
    expect(summary(store)).toMatchObject({ tps: null, qps: null });

    // The earlier baseline survives the failed poll.
    now.mockReturnValue(108_000);
    brokerApi.getBrokerList.mockResolvedValueOnce(brokerList(1080, 5000));
    await store.dispatch(fetchHostSummary('h1')).unwrap();
    expect(summary(store)).toMatchObject({ tps: 10, qps: 0 });
  });
});
