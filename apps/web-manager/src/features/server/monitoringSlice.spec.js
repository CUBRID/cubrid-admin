import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./monitoringApi', () => ({
  default: {
    getHostStat: vi.fn(),
    getBrokerList: vi.fn(),
    getHaHeartbeatList: vi.fn(),
    getSysDiskInfo: vi.fn(),
  },
}));

import monitoringApi from './monitoringApi';
import reducer, { fetchMonitoringData } from './monitoringSlice';

const HOST = 'h1';
const makeStore = () => configureStore({
  reducer: {
    monitoring: reducer,
    host: (s = { haInfo: {} }) => s,
  },
});
const hostData = (store) => store.getState().monitoring.hostsData[HOST];

const hostStat = (user, idle) => ({
  cpu_user: String(user), cpu_kernel: '0', cpu_idle: String(idle), cpu_iowait: '0',
  mem_phy_total: '1000', mem_phy_free: '250',
});
const brokerList = (tran, query) => [{ broker: [{ name: 'query_editor', tran: String(tran), query: String(query) }] }];

let now;
beforeEach(() => {
  vi.resetAllMocks();
  now = vi.spyOn(Date, 'now');
  monitoringApi.getSysDiskInfo.mockResolvedValue({ disk_info: [{ name: '/', total_size: '1000', free_size: '400' }] });
});
afterEach(() => now.mockRestore());

const poll = async (store, at, { stat, brokers }) => {
  now.mockReturnValue(at);
  monitoringApi.getHostStat.mockResolvedValueOnce(stat);
  monitoringApi.getBrokerList.mockResolvedValueOnce(brokers);
  await store.dispatch(fetchMonitoringData(HOST)).unwrap();
};

describe('fetchMonitoringData', () => {
  it('reports no TPS/QPS/CPU on the first poll and real per-second rates after the second', async () => {
    const store = makeStore();
    await poll(store, 100_000, { stat: hostStat(100, 900), brokers: brokerList(1000, 5000) });
    expect(hostData(store).currentStatus).toMatchObject({ cpu: null, tps: null, qps: null, memory: 75 });

    await poll(store, 102_000, { stat: hostStat(150, 950), brokers: brokerList(1100, 5400) });
    expect(hostData(store).currentStatus).toMatchObject({ cpu: 50, tps: 50, qps: 200 });
  });

  it('averages only real rates, not the first sample', async () => {
    const store = makeStore();
    await poll(store, 100_000, { stat: hostStat(100, 900), brokers: brokerList(1000, 5000) });
    await poll(store, 102_000, { stat: hostStat(150, 950), brokers: brokerList(1100, 5400) });
    await poll(store, 104_000, { stat: hostStat(150, 1050), brokers: brokerList(1300, 5400) });

    expect(hostData(store).averages).toMatchObject({ tps: 75, qps: 100, cpu: 25 });
  });

  it('maps getsysdiskinfo to disk usage and refreshes it at most every 30s', async () => {
    const store = makeStore();
    await poll(store, 100_000, { stat: hostStat(1, 1), brokers: brokerList(0, 0) });
    expect(hostData(store).disk).toEqual({ total: 1000, used: 600, pct: 60, names: ['/'] });

    await poll(store, 110_000, { stat: hostStat(1, 1), brokers: brokerList(0, 0) });
    expect(monitoringApi.getSysDiskInfo).toHaveBeenCalledTimes(1);

    await poll(store, 131_000, { stat: hostStat(1, 1), brokers: brokerList(0, 0) });
    expect(monitoringApi.getSysDiskInfo).toHaveBeenCalledTimes(2);
  });

  it('keeps the last disk value and the rest of the poll when the disk call fails', async () => {
    const store = makeStore();
    await poll(store, 100_000, { stat: hostStat(1, 1), brokers: brokerList(0, 0) });

    monitoringApi.getSysDiskInfo.mockRejectedValueOnce(new Error('timeout'));
    await poll(store, 131_000, { stat: hostStat(1, 1), brokers: brokerList(0, 0) });

    expect(hostData(store).disk).toMatchObject({ used: 600 });
    expect(hostData(store).error).toBeNull();
  });
});
