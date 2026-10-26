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
  },
}));

import { databaseApi } from './databaseApi';
import { brokerApi } from '../broker/brokerApi';
import reducer, {
  fetchDashboardCAS,
  fetchDashboardData,
  fetchDashboardLocks,
  fetchDatabaseSpaceInfo,
} from './databaseMonitoringSlice';

const HOST = 'host1';
const DB = 'demodb';
const KEY = `${HOST}:${DB}`;

const makeStore = () => configureStore({ reducer: { databaseMonitoring: reducer } });
const entry = (store) => store.getState().databaseMonitoring.dashboardData[KEY];

// getBrokerStatus's resolved value after apiClient's response interceptor has
// unwrapped the server's { data, status, note } envelope: asinfo is top-level.
const brokerStatus = (asinfo) => ({
  bname: 'broker1',
  time: '2026/10/26 10:00:00',
  asinfo,
  jobinfo: [],
  note: 'success',
  httpStatus: 200,
  status: 200,
});

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

const lockInfo = (lot) => ({ lockinfo: [{ esc: '100000', lot }] });

beforeEach(() => vi.resetAllMocks());

describe('fetchDashboardCAS', () => {
  it('reads asinfo from the unwrapped getBrokerStatus result and keeps only CAS on this db', async () => {
    brokerApi.getBrokerList.mockResolvedValue([{ broker: [{ name: 'broker1' }] }]);
    brokerApi.getBrokerStatus.mockResolvedValue(
      brokerStatus([cas(), cas({ as_id: '2', as_dbname: 'otherdb' })])
    );
    const store = makeStore();

    const { brokersCAS } = await store.dispatch(fetchDashboardCAS({ hostUid: HOST, dbname: DB })).unwrap();

    expect(brokerApi.getBrokerStatus).toHaveBeenCalledWith(HOST, 'broker1');
    expect(brokersCAS).toHaveLength(1);
    expect(brokersCAS[0]).toMatchObject({ broker: 'broker1', id: '1', pid: '4321', status: 'IDLE' });
    expect(entry(store).brokersCAS).toHaveLength(1);
  });

  it('skips a broker whose status request failed', async () => {
    brokerApi.getBrokerList.mockResolvedValue([{ broker: [{ name: 'broker1' }, { name: 'broker2' }] }]);
    brokerApi.getBrokerStatus
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(brokerStatus([cas({ as_id: '7' })]));
    const store = makeStore();

    const { brokersCAS } = await store.dispatch(fetchDashboardCAS({ hostUid: HOST, dbname: DB })).unwrap();

    expect(brokersCAS).toEqual([expect.objectContaining({ broker: 'broker2', id: '7' })]);
  });
});

describe('dashboard lock status', () => {
  const mockOtherSections = () => {
    databaseApi.getVolumeInfo.mockResolvedValue({ spaceinfo: [{ spacename: 'demodb' }], dbinfo: [], fileinfo: [] });
    databaseApi.getStatDump.mockResolvedValue({});
    brokerApi.getBrokerList.mockResolvedValue([{ broker: [] }]);
  };

  it('marks locks as loaded when the lock request succeeds with no locks', async () => {
    mockOtherSections();
    databaseApi.getLockInfo.mockResolvedValue(lockInfo([]));
    const store = makeStore();

    await store.dispatch(fetchDashboardData({ hostUid: HOST, dbname: DB })).unwrap();

    expect(entry(store).locks).toEqual([]);
    expect(entry(store).locksStatus).toBe('loaded');
  });

  it('marks locks as errored when only the lock request fails, keeping the rest of the dashboard', async () => {
    mockOtherSections();
    databaseApi.getLockInfo.mockRejectedValue({ response: { data: { message: 'timeout' } } });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = makeStore();

    await store.dispatch(fetchDashboardData({ hostUid: HOST, dbname: DB })).unwrap();

    expect(entry(store).locks).toEqual([]);
    expect(entry(store).locksStatus).toBe('error');
    expect(entry(store).volumes).toHaveLength(1);
  });

  it('leaves locksStatus unset before any lock fetch has finished', async () => {
    databaseApi.getVolumeInfo.mockResolvedValue({ spaceinfo: [], dbinfo: [], fileinfo: [] });
    const store = makeStore();

    await store.dispatch(fetchDatabaseSpaceInfo({ hostUid: HOST, dbname: DB })).unwrap();

    expect(entry(store).locksStatus).toBeUndefined();
  });

  it('a failed lock refresh flags the error and a later success clears it', async () => {
    const store = makeStore();

    databaseApi.getLockInfo.mockRejectedValueOnce(new Error('timeout'));
    await store.dispatch(fetchDashboardLocks({ hostUid: HOST, dbname: DB }));
    expect(entry(store).locksStatus).toBe('error');

    databaseApi.getLockInfo.mockResolvedValueOnce(lockInfo([]));
    await store.dispatch(fetchDashboardLocks({ hostUid: HOST, dbname: DB }));
    expect(entry(store).locksStatus).toBe('loaded');
  });
});
