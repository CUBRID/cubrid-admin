import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./databaseApi', () => ({
  databaseApi: {
    getVolumeInfo: vi.fn(),
    getLockInfo: vi.fn(),
    getStatDump: vi.fn(),
  },
}));
vi.mock('../broker/brokerApi', () => ({
  brokerApi: {
    getBrokerList: vi.fn(),
    getBrokerStatus: vi.fn(),
    getBrokerStatusBulk: vi.fn(),
  },
}));

import { brokerApi } from '../broker/brokerApi';
import { fetchBrokerList } from '../broker/brokerSlice';
import reducer, { fetchDashboardCAS, fetchDashboardData } from './databaseMonitoringSlice';

const DB = 'demodb';

const makeStore = () => configureStore({ reducer: { databaseMonitoring: reducer } });

// getBrokerList's resolved value after apiClient unwraps the envelope.
const brokerList = (names) => [{ broker: names.map((name) => ({ name })) }];

const cas = (overrides = {}) => ({
  as_id: '1',
  as_pid: '4321',
  as_dbname: DB,
  as_num_query: '10',
  as_long_query: '0',
  as_status: 'IDLE',
  as_lct: '2026/10/26 09:59:00',
  as_cpu: '0.5',
  as_psize: '2048',
  ...overrides,
});

beforeEach(() => vi.resetAllMocks());

describe('fetchDashboardCAS bulk broker status', () => {
  it('fetches every broker status with one bulk request and keeps only CAS on this db', async () => {
    brokerApi.getBrokerList.mockResolvedValue(brokerList(['broker1', 'broker2', 'broker3']));
    brokerApi.getBrokerStatusBulk.mockResolvedValue({
      brokers: [
        { bname: 'broker1', time: 't', asinfo: [cas({ as_id: '1' }), cas({ as_id: '2', as_dbname: 'otherdb' })] },
        { bname: 'broker2', time: 't', asinfo: [cas({ as_id: '7', as_dbname: DB.toUpperCase() })] },
        { bname: 'broker3', time: 't' },
      ],
    });

    const result = await makeStore().dispatch(fetchDashboardCAS({ hostUid: 'cas-host-1', dbname: DB })).unwrap();

    expect(brokerApi.getBrokerStatusBulk).toHaveBeenCalledTimes(1);
    expect(brokerApi.getBrokerStatusBulk).toHaveBeenCalledWith('cas-host-1', ['broker1', 'broker2', 'broker3']);
    expect(brokerApi.getBrokerStatus).not.toHaveBeenCalled();
    expect(result.brokersCAS.map((row) => [row.broker, row.id])).toEqual([
      ['broker1', '1'],
      ['broker2', '7'],
    ]);
  });

  it('skips a broker that is missing from the bulk response', async () => {
    brokerApi.getBrokerList.mockResolvedValue(brokerList(['broker1', 'broker2']));
    brokerApi.getBrokerStatusBulk.mockResolvedValue({
      brokers: [{ bname: 'broker2', time: 't', asinfo: [cas({ as_id: '3' })] }],
    });

    const result = await makeStore().dispatch(fetchDashboardCAS({ hostUid: 'cas-host-2', dbname: DB })).unwrap();

    expect(result.brokersCAS.map((row) => [row.broker, row.id])).toEqual([['broker2', '3']]);
  });

  it('returns no CAS rows when the bulk request fails', async () => {
    brokerApi.getBrokerList.mockResolvedValue(brokerList(['broker1']));
    brokerApi.getBrokerStatusBulk.mockRejectedValue(new Error('CMS down'));

    const result = await makeStore().dispatch(fetchDashboardCAS({ hostUid: 'cas-host-3', dbname: DB })).unwrap();

    expect(result.brokersCAS).toEqual([]);
  });

  it('makes no status request when the host has no brokers', async () => {
    brokerApi.getBrokerList.mockResolvedValue(brokerList([]));

    const result = await makeStore().dispatch(fetchDashboardCAS({ hostUid: 'cas-host-4', dbname: DB })).unwrap();

    expect(result.brokersCAS).toEqual([]);
    expect(brokerApi.getBrokerStatusBulk).not.toHaveBeenCalled();
  });
});

// The sidebar's broker poll (MonitoringProvider) and the DB dashboard's poll
// fire at the same moment while a DB tab is open.
describe('fetchDashboardCAS with the sidebar broker poll', () => {
  const deferred = () => {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
  };
  const bulk = { brokers: [{ bname: 'broker1', time: 't', asinfo: [cas({ as_id: '5' })] }] };

  it('joins the sidebar poll in flight: one list and one status request', async () => {
    const list = deferred();
    brokerApi.getBrokerList.mockReturnValue(list.promise);
    brokerApi.getBrokerStatusBulk.mockResolvedValue(bulk);
    const store = makeStore();

    const sidebar = store.dispatch(fetchBrokerList({ hostUid: 'join-host-1', isBackground: true }));
    const dashboard = store.dispatch(fetchDashboardData({ hostUid: 'join-host-1', dbname: DB, isBackground: true }));
    list.resolve(brokerList(['broker1']));
    await Promise.all([sidebar, dashboard]);

    expect(brokerApi.getBrokerList).toHaveBeenCalledTimes(1);
    expect(brokerApi.getBrokerStatusBulk).toHaveBeenCalledTimes(1);
    expect(store.getState().databaseMonitoring.dashboardData[`join-host-1:${DB}`].brokersCAS.map((row) => row.id)).toEqual(['5']);
  });

  it('reads anew on a user refresh instead of taking the poll in flight', async () => {
    const first = deferred();
    brokerApi.getBrokerList.mockReturnValueOnce(first.promise).mockResolvedValueOnce(brokerList(['broker1']));
    brokerApi.getBrokerStatusBulk.mockResolvedValue(bulk);
    const store = makeStore();

    const sidebar = store.dispatch(fetchBrokerList({ hostUid: 'join-host-2', isBackground: true }));
    const refresh = store.dispatch(fetchDashboardCAS({ hostUid: 'join-host-2', dbname: DB }));
    first.resolve(brokerList(['broker1']));
    await Promise.all([sidebar, refresh]);

    expect(brokerApi.getBrokerList).toHaveBeenCalledTimes(2);
  });

  it('leaves the sidebar broker list alone', async () => {
    brokerApi.getBrokerList.mockResolvedValue(brokerList(['broker1']));
    brokerApi.getBrokerStatusBulk.mockResolvedValue(bulk);
    const actions = [];
    const store = configureStore({
      reducer: { databaseMonitoring: reducer },
      middleware: (getDefault) => getDefault().concat(() => (next) => (action) => {
        actions.push(action.type);
        return next(action);
      }),
    });

    await store.dispatch(fetchDashboardCAS({ hostUid: 'join-host-3', dbname: DB, isBackground: true }));

    expect(actions.filter((type) => type.startsWith('broker/'))).toEqual([]);
  });
});
