import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The sections render nothing here: these tests watch what the host
// dashboard reads and what it hands the storage volume table.
vi.mock('./DatabaseVolumes', () => ({ default: vi.fn(() => null) }));
vi.mock('./Brokers', () => ({ default: () => null }));
vi.mock('./SystemInfo', () => ({ default: () => null }));
vi.mock('./server/SystemStatusSection', () => ({ default: () => null }));
vi.mock('./server/DatabaseListSection', () => ({ default: () => null }));
vi.mock('./server/HaClusterStatusSection', () => ({ default: () => null }));
vi.mock('../../user/components/MonitoringSettingsPopover', () => ({ default: () => null }));
vi.mock('../../host/hostApi', () => ({
  hostApi: { getHostConfig: vi.fn(() => Promise.resolve({ conflist: [{ confdata: [] }] })) },
}));
vi.mock('../../host/hostSlice', () => ({
  fetchHostEnv: (arg) => ({ type: 'test/fetchHostEnv', payload: arg }),
}));
vi.mock('../../database/databaseSlice', () => ({
  fetchDatabaseStartInfo: (arg) => ({ type: 'test/fetchDatabaseStartInfo', payload: arg }),
}));
vi.mock('../../database/databaseMonitoringSlice', () => ({
  fetchDatabaseVolumes: (arg) => ({ type: 'test/fetchDatabaseVolumes', payload: arg }),
}));
vi.mock('../../broker/brokerSlice', () => ({
  fetchBrokerList: (arg) => ({ type: 'test/fetchBrokerList', payload: arg }),
}));
vi.mock('../monitoringSlice', () => ({
  fetchMonitoringData: (arg) => ({ type: 'test/fetchMonitoringData', payload: arg }),
  fetchHaHeartbeatOnly: (arg) => ({ type: 'test/fetchHaHeartbeatOnly', payload: arg }),
}));

import ServerContent from './ServerContent';
import DatabaseVolumes from './DatabaseVolumes';

const HOST = 'host1';
const startInfo = {
  dblist: { dbs: [{ dbname: 'demodb' }] },
  activelist: { active: [{ dbname: 'demodb' }] },
};

const initialState = {
  user: { preferences: { dashboardInterval: 10, uiLocale: 'en' } },
  host: { hosts: [{ uid: HOST, alias: 'host-1' }], authorizedHosts: [HOST], haInfo: {}, reconnectQueue: [] },
  database: { databasesByHost: {}, activeDatabasesByHost: {}, loggedInDatabases: ['host1:demodb'] },
  monitoring: { hostsData: {} },
  layout: { activeMainTab: `host:${HOST}`, refreshCounter: 0 },
};

let container;
let root;
let dispatched;

const countOf = (type) => dispatched.filter((a) => a.type === type).length;
const volumesRefreshKey = () => DatabaseVolumes.mock.calls.at(-1)[0].refreshKey;

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  dispatched = [];
  DatabaseVolumes.mockClear();
  const recorder = () => (next) => (action) => {
    if (action.type.startsWith('test/fetch')) dispatched.push(action);
    // The start-info thunk result is unwrapped by the dashboard.
    if (action.type === 'test/fetchDatabaseStartInfo') return { unwrap: () => Promise.resolve(startInfo) };
    return next(action);
  };
  const store = configureStore({
    reducer: (state = initialState) => state,
    middleware: (gDM) => gDM().concat(recorder),
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <Provider store={store}>
        <ServerContent hostUid={HOST} />
      </Provider>
    );
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  vi.useRealTimers();
});

const tick = () => act(async () => {
  await vi.advanceTimersByTimeAsync(10000);
});

it('never reads volume-info itself: the storage volume table reads its own', async () => {
  expect(countOf('test/fetchDatabaseStartInfo')).toBe(1);
  expect(countOf('test/fetchBrokerList')).toBe(1);
  expect(countOf('test/fetchHostEnv')).toBe(1);

  await tick();
  await tick();
  await tick();

  expect(countOf('test/fetchDatabaseStartInfo')).toBe(4);
  expect(countOf('test/fetchDatabaseVolumes')).toBe(0);
});

it('asks the storage volume table to re-read on the refresh button, not on a background tick', async () => {
  // The first load counts as a refresh the user asked for.
  expect(volumesRefreshKey()).toBe(1);

  await tick();
  expect(countOf('test/fetchDatabaseStartInfo')).toBe(2);
  expect(volumesRefreshKey()).toBe(1);

  await act(async () => {
    container.querySelector('[data-testid="server-dashboard-refresh-btn"]').click();
  });
  expect(countOf('test/fetchDatabaseStartInfo')).toBe(3);
  expect(volumesRefreshKey()).toBe(2);
});
