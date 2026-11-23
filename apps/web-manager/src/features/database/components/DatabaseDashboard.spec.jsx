import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Only the CAS table is rendered for real; the other sections, the polling
// hooks and the database thunks are stand-ins.
vi.mock('../databaseSlice', () => ({
  fetchDashboardData: vi.fn(() => ({ type: 'test/fetchDashboardData' })),
  fetchDashboardCAS: vi.fn(() => ({ type: 'test/fetchDashboardCAS' })),
}));
vi.mock('../useStatdumpWatcher', () => ({ useStatdumpWatcher: () => undefined }));
const polling = vi.hoisted(() => ({ isDbLoggedIn: true }));
vi.mock('../../../infrastructure/hooks/usePollingRefresh', () => ({
  usePollingRefresh: () => ({ isManualRefreshing: false, lastRefreshed: new Date(0), handleRefresh: () => undefined, isDbLoggedIn: polling.isDbLoggedIn }),
}));
// Only whether the host memory bar has a read to show (its segments).
vi.mock('./dashboard/DBPerformanceSection', () => ({
  default: ({ dbStats }) => <span data-testid="host-memory-bar">{dbStats[0]?.memSegments ? 'shown' : 'hidden'}</span>,
}));
vi.mock('./dashboard/DBVolumesSection', () => ({ default: () => null }));
vi.mock('./dashboard/DBSpaceInfoSection', () => ({ default: () => null }));
vi.mock('./dashboard/DBLockTransactionSection', () => ({ default: () => null }));
vi.mock('./dashboard/DBJobAutomationSection', () => ({ default: () => null }));
vi.mock('./CASLogModal', () => ({ default: () => null }));
vi.mock('../../user/components/MonitoringSettingsPopover', () => ({ default: () => null }));
import DatabaseDashboard from './DatabaseDashboard';
import { CM } from '../../../constants/cmLabels';

const cas = (id, qps) => ({
  broker: 'query_editor', id: String(id), pid: String(100 + id), qps, lqs: '0', status: 'IDLE', lastConn: '-',
  cpu: '0', psize: '1024', _idNum: id, _pidNum: 100 + id, _qpsNum: qps, _lqsNum: 0,
});

const makeStore = (brokersCAS, hostExtra = {}, hostsData = {}) => configureStore({
  reducer: {
    host: (state = { selectedHostUid: 'h1', hosts: [{ uid: 'h1', address: 'a', port: 8001 }], haInfo: {}, hostEnvs: {}, ...hostExtra }) => state,
    monitoring: (state = { hostsData }) => state,
    databaseMonitoring: (state = {
      dashboardData: { 'h1:demodb': { brokersCAS, casStatus: 'loaded', volumes: [], spaceInfo: [], locks: [], performance: {} } },
      dashboardLoading: {},
    }) => state,
    user: (state = { preferences: { dashboardInterval: 0, uiLocale: 'en' } }) => state,
    layout: (state = { activeMainTab: 'db:demodb', statusModal: { isOpen: false } }) => state,
    databaseOperation: (state = {}) => state,
  },
});

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  polling.isDbLoggedIn = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it('says the connection is lost instead of the polling state while the host waits in the reconnect window', async () => {
  const badge = () => container.querySelector('[data-testid="dashboard-live-badge"]').textContent;
  await act(async () => root.render(
    <Provider store={makeStore([])}><DatabaseDashboard hostUid="h1" dbname="demodb" /></Provider>
  ));
  expect(badge()).toBe(CM.paused);

  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => root.render(
    <Provider store={makeStore([], { reconnectQueue: ['h1'] })}><DatabaseDashboard hostUid="h1" dbname="demodb" /></Provider>
  ));
  expect(badge()).toBe(CM.connectionLost);
});

it('sorts the CAS table by QPS as numbers', async () => {
  await act(async () => root.render(
    <Provider store={makeStore([cas(1, 2.5), cas(2, 11.8), cas(3, 0.4)])}>
      <DatabaseDashboard hostUid="h1" dbname="demodb" />
    </Provider>
  ));
  const casTable = container.querySelector('[data-testid="db-dashboard-cas"] table');
  const qpsHeader = [...casTable.querySelectorAll('th')].find((th) => th.textContent.trim().startsWith(CM.qps));
  await act(async () => qpsHeader.click());

  const casIds = [...casTable.querySelectorAll('tbody tr')].map((tr) => tr.querySelectorAll('td')[1].textContent);
  expect(casIds).toEqual(['3', '1', '2']);
});

it('shows the not-logged-in state, with no section mounted to read anything, after the database is logged out', async () => {
  polling.isDbLoggedIn = false;
  await act(async () => root.render(
    <Provider store={makeStore([cas(1, 2.5)])}>
      <DatabaseDashboard hostUid="h1" dbname="demodb" />
    </Provider>
  ));
  expect(container.querySelector('[data-testid="db-login-required"]').textContent).toContain(CM.databaseNotLoggedIn);
  expect(container.querySelector('[data-testid="db-dashboard-cas"]')).toBeNull();
});

// The host memory read (from the host dashboard's gethoststat) is shown until
// it is older than hostMemoryMaxAgeMs (a minute at interval 0): a timer set
// for that moment hides it, instead of the clock at render.
const renderWithHostMemory = (readAt) => act(async () => root.render(
  <Provider store={makeStore([], {}, { h1: { currentStatus: { memTotal: 16 * 2 ** 30, memUsed: 6 * 2 ** 30, readAt } } })}>
    <DatabaseDashboard hostUid="h1" dbname="demodb" />
  </Provider>
));
const memoryBar = () => container.querySelector('[data-testid="host-memory-bar"]').textContent;

it('hides the host memory bar at the moment its read becomes older than allowed', async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(1_000_000);
    await renderWithHostMemory(1_000_000 - 59_000);
    expect(memoryBar()).toBe('shown');
    await act(async () => { vi.advanceTimersByTime(999); });
    expect(memoryBar()).toBe('shown');
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(memoryBar()).toBe('hidden');
  } finally {
    vi.useRealTimers();
  }
});

it('does not show a host memory read that is already too old', async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(1_000_000);
    await renderWithHostMemory(1_000_000 - 61_000);
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(memoryBar()).toBe('hidden');
  } finally {
    vi.useRealTimers();
  }
});
