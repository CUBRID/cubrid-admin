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
vi.mock('../../../infrastructure/hooks/usePollingRefresh', () => ({
  usePollingRefresh: () => ({ isManualRefreshing: false, lastRefreshed: new Date(0), handleRefresh: () => undefined }),
}));
vi.mock('./dashboard/DBPerformanceSection', () => ({ default: () => null }));
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

const makeStore = (brokersCAS) => configureStore({
  reducer: {
    host: (state = { selectedHostUid: 'h1', hosts: [{ uid: 'h1', address: 'a', port: 8001 }], haInfo: {}, hostEnvs: {} }) => state,
    monitoring: (state = { hostsData: {} }) => state,
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
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
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
