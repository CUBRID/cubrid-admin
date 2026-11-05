import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The sections render nothing here: these tests watch which heartbeat reads
// the host dashboard sends while an HA cluster has no master.
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
  fetchHaNodesOnly: (arg) => ({ type: 'test/fetchHaNodesOnly', payload: arg }),
}));

import ServerContent from './ServerContent';

const HOST = 'host1';
const noMaster = { currentnode: 'a', hanodelist: [{ node: [{ hostname: 'a', state: 'slave' }, { hostname: 'b', state: 'slave' }] }] };
const stateWith = (hostData) => ({
  user: { preferences: { dashboardInterval: 10, uiLocale: 'en' } },
  host: { hosts: [{ uid: HOST, alias: 'host-1' }], authorizedHosts: [HOST], haInfo: { [HOST]: { isHA: true } }, reconnectQueue: [] },
  database: { databasesByHost: {}, activeDatabasesByHost: {}, loggedInDatabases: [] },
  monitoring: { hostsData: { [HOST]: hostData } },
  layout: { activeMainTab: `host:${HOST}`, refreshCounter: 0 },
});

let container;
let root;
let dispatched;
const countOf = (type) => dispatched.filter((a) => a.type === type).length;

const render = async (hostData) => {
  const recorder = () => (next) => (action) => {
    if (action.type.startsWith('test/fetch')) dispatched.push(action);
    if (action.type === 'test/fetchDatabaseStartInfo') return { unwrap: () => Promise.resolve({}) };
    return next(action);
  };
  const store = configureStore({ reducer: (s = stateWith(hostData)) => s, middleware: (gDM) => gDM().concat(recorder) });
  await act(async () => root.render(<Provider store={store}><ServerContent hostUid={HOST} /></Provider>));
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  dispatched = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  vi.useRealTimers();
});

it('watches a cluster with no master every second with nodes-only reads, not full ones', async () => {
  await render({ haHeartbeat: noMaster });
  const fullBefore = countOf('test/fetchHaHeartbeatOnly');
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(countOf('test/fetchHaNodesOnly')).toBe(5);
  expect(countOf('test/fetchHaHeartbeatOnly')).toBe(fullBefore);
});

it('reads the databases once when the watch saw the nodes change', async () => {
  await render({ haHeartbeat: noMaster, haDbInfoStale: true });
  expect(countOf('test/fetchHaHeartbeatOnly')).toBe(1);
});
