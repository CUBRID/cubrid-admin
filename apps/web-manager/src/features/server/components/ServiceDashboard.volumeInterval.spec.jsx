import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
// The real slice and screen; only the HTTP calls are stand-ins.
vi.mock('../../host/hostApi', () => ({ hostApi: { getHostEnv: vi.fn() } }));
vi.mock('../../database/databaseApi', () => {
  const databaseApi = { getStartInfo: vi.fn(), getVolumeInfo: vi.fn() };
  databaseApi.readStartInfo = (hostUid) => Promise.resolve()
    .then(() => databaseApi.getStartInfo(hostUid))
    .then((value) => ({ ok: true, value, seq: 0 }), (error) => ({ ok: false, error, seq: 0 }));
  return { databaseApi };
});
vi.mock('../../broker/brokerApi', () => ({ brokerApi: { getBrokerList: vi.fn() } }));
vi.mock('../monitoringApi', () => ({ default: { getHostStat: vi.fn() } }));

import { hostApi } from '../../host/hostApi';
import { databaseApi } from '../../database/databaseApi';
import { brokerApi } from '../../broker/brokerApi';
import monitoringApi from '../monitoringApi';
import globalMonitoring from '../globalMonitoringSlice';
import ServiceDashboard from './ServiceDashboard';

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.resetAllMocks();
  monitoringApi.getHostStat.mockResolvedValue({ cpu_user: '1', cpu_kernel: '1', cpu_idle: '1', cpu_iowait: '0', mem_phy_total: '100', mem_phy_free: '50' });
  brokerApi.getBrokerList.mockResolvedValue([{ broker: [] }]);
  hostApi.getHostEnv.mockResolvedValue({});
  databaseApi.getStartInfo.mockResolvedValue({ dblist: { dbs: [{ dbname: 'demodb' }] }, activelist: { active: [{ dbname: 'demodb', isLoggedIn: true }] } });
  databaseApi.getVolumeInfo.mockResolvedValue({ freespace: '1', spaceinfo: [{ type: 'PERMANENT', purpose: 'PERMANENT', totalpage: '100', freepage: '40' }] });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = async () => {
  const host = { uid: 'h1', id: 'admin', alias: 'h1', address: '10.0.0.1', port: 8001 };
  const store = configureStore({
    reducer: {
      globalMonitoring,
      host: (s = {
        hosts: [host], hostGroups: { g: { name: 'G', hosts: { h1: host } } }, authorizedHosts: ['h1'],
        haInfo: {}, selectedHostUid: null, reconnectQueue: [], loading: false,
      }) => s,
      user: (s = { preferences: { dashboardInterval: 3, brokerStatusInterval: 3, serviceVolumeInterval: 30, uiLocale: 'en' } }) => s,
      layout: (s = { activeMainTab: 'service_dashboard', refreshCounter: 0, openTabs: ['service_dashboard'] }) => s,
      databaseMonitoring: (s = { volumesChangedSeq: {} }) => s,
    },
  });
  await act(async () => root.render(<Provider store={store}><ServiceDashboard /></Provider>));
};
const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const volumeReads = () => databaseApi.getVolumeInfo.mock.calls.length;
const hostStatReads = () => monitoringApi.getHostStat.mock.calls.length;

it('reads volume usage every 30 seconds while the rest follows the 3-second dashboard interval', async () => {
  await render();
  await tick(0);
  expect(volumeReads()).toBe(1); // the first read takes everything

  await tick(27_000);
  expect(hostStatReads()).toBeGreaterThanOrEqual(9);
  expect(volumeReads()).toBe(1);

  await tick(3_000); // 30 seconds since the first volume read
  expect(volumeReads()).toBe(2);
  expect(container.querySelector('[data-testid="volumes-read-at-h1"]')).not.toBeNull();
});

it('reads volume usage at once on the refresh button', async () => {
  await render();
  await tick(0);
  expect(volumeReads()).toBe(1);

  await act(async () => container.querySelector('[data-testid="service-dashboard-refresh-btn"]').click());
  await tick(0);
  expect(volumeReads()).toBe(2);
});
