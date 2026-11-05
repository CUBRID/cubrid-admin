import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real databaseSlice pulls in apiClient and every database thunk; these
// tests only render the sections' empty states.
vi.mock('../../databaseSlice', () => ({
  fetchDatabaseSpaceInfo: vi.fn(() => ({ type: 'test/noop' })),
  fetchDashboardCAS: vi.fn(() => ({ type: 'test/noop' })),
  fetchBackupSchedule: vi.fn(() => ({ type: 'test/noop' })),
  fetchQueryPlan: vi.fn(() => ({ type: 'test/noop' })),
  setSelectedDatabase: vi.fn(() => ({ type: 'test/noop' })),
  setSelectedBackupId: vi.fn(() => ({ type: 'test/noop' })),
  openEditBackupPlanModal: vi.fn(() => ({ type: 'test/noop' })),
  openEditQueryPlanModal: vi.fn(() => ({ type: 'test/noop' })),
}));

import DBVolumesSection from './DBVolumesSection';
import DBSpaceInfoSection from './DBSpaceInfoSection';
import DBBrokersCASSection from './DBBrokersCASSection';
import DBJobAutomationSection from './DBJobAutomationSection';
import { CM } from '../../../../constants/cmLabels';

const pollingProps = { hostUid: 'host1', dbname: 'demodb', isTabActive: false, refreshInterval: 0 };
const KEY = 'host1:demodb';

const makeStore = (databaseOperation = {}) => configureStore({
  reducer: {
    user: (state = { preferences: { uiLocale: 'en' } }) => state,
    databaseOperation: (state = {
      backupSchedules: {}, backupSchedulesLoading: {}, backupSchedulesError: {},
      queryPlans: {}, queryPlansLoading: {}, queryPlansError: {},
      ...databaseOperation,
    }) => state,
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

const render = (ui, store = makeStore()) => act(async () => {
  root.render(<Provider store={store}>{ui}</Provider>);
});

const tableSections = [
  ['DBVolumesSection', (status) => <DBVolumesSection volumes={[]} volumesStatus={status} pollingProps={pollingProps} />],
  ['DBSpaceInfoSection', (status) => <DBSpaceInfoSection spaceInfo={[]} spaceInfoStatus={status} pollingProps={pollingProps} />],
  ['DBBrokersCASSection', (status) => <DBBrokersCASSection brokersCAS={[]} casStatus={status} pollingProps={pollingProps} />],
];

describe.each(tableSections)('%s empty state', (_name, ui) => {
  it('shows loading before the first fetch settles', async () => {
    await render(ui(undefined));
    expect(container.textContent).toContain(CM.loadingLabel);
    expect(container.textContent).not.toContain(CM.noDataAvailableMsg);
  });

  it('shows "no data" only after a successful empty fetch', async () => {
    await render(ui('loaded'));
    expect(container.textContent).toContain(CM.noDataAvailableMsg);
    expect(container.textContent).not.toContain(CM.loadingLabel);
  });

  it('shows an unavailable state after a failed fetch', async () => {
    await render(ui('error'));
    expect(container.textContent).toContain(CM.dataUnavailableTitle);
    expect(container.textContent).not.toContain(CM.noDataAvailableMsg);
  });
});

describe('DBVolumesSection rows', () => {
  it('keeps showing loaded rows when the latest refresh failed', async () => {
    const volumes = [{ name: '/data/demodb_x001', type: 'PERMANENT', purpose: '-', free: '1', total: '2', date: '-', path: '/data' }];
    await render(<DBVolumesSection volumes={volumes} volumesStatus="error" pollingProps={pollingProps} />);
    expect(container.textContent).toContain('demodb_x001');
    expect(container.textContent).not.toContain(CM.dataUnavailableTitle);
  });

  it('shows used / total pages, and "-" for a log volume with no free page count, as the CSV export does', async () => {
    const volumes = [
      { name: '/data/demodb', type: 'PERMANENT', purpose: 'PERMANENT', free: '3,904 pages', total: '8,192 pages', date: '-', path: '/data' },
      { name: '/data/demodb_lgat', type: 'ACTIVE_LOG', purpose: '-', free: '-', total: '32,768 pages', date: '-', path: '/data' },
    ];
    await render(<DBVolumesSection volumes={volumes} volumesStatus="ok" pollingProps={pollingProps} />);
    const rows = [...container.querySelectorAll('tr')].map((tr) => tr.textContent);
    expect(rows.find((t) => t.includes('demodb_lgat') === false && t.includes('demodb'))).toContain('4,288 / 8,192');
    const logRow = rows.find((t) => t.includes('demodb_lgat'));
    expect(logRow).not.toContain('32,768 / 32,768');
    expect(logRow).toContain('-');
  });
});

describe('DBJobAutomationSection empty state', () => {
  it('shows loading for both lists before their first fetch', async () => {
    await render(<DBJobAutomationSection pollingProps={pollingProps} />);
    expect(container.textContent).toContain(CM.loadingLabel);
    expect(container.textContent).not.toContain(CM.noBackupPlansTitle);
    expect(container.textContent).not.toContain(CM.noQueryPlansTitle);
  });

  it('shows "no plans" after successful empty fetches', async () => {
    await render(
      <DBJobAutomationSection pollingProps={pollingProps} />,
      makeStore({ backupSchedules: { [KEY]: [] }, queryPlans: { [KEY]: [] } })
    );
    expect(container.textContent).toContain(CM.noBackupPlansTitle);
    expect(container.textContent).toContain(CM.noQueryPlansTitle);
    expect(container.textContent).not.toContain(CM.loadingLabel);
  });

  it('shows an unavailable state for a list whose fetch failed', async () => {
    await render(
      <DBJobAutomationSection pollingProps={pollingProps} />,
      makeStore({ backupSchedulesError: { [KEY]: true }, queryPlans: { [KEY]: [] } })
    );
    expect(container.textContent).toContain(CM.dataUnavailableTitle);
    expect(container.textContent).not.toContain(CM.noBackupPlansTitle);
    expect(container.textContent).toContain(CM.noQueryPlansTitle);
  });
});

describe('DBBrokersCASSection', () => {
  const cas = (id, status, qps) => ({ broker: 'query_editor', id: String(id), pid: String(100 + id), qps, lqs: '0', status, lastConn: '-', _idNum: id, _pidNum: 100 + id, _qpsNum: qps ?? 0, _lqsNum: 0 });

  it('counts IDLE CASes as ready and BUSY, CLIENT WAIT and CLOSE WAIT ones as busy', async () => {
    const brokersCAS = [cas(1, 'IDLE', 1.25), cas(2, 'BUSY', 11.8), cas(3, 'CLIENT WAIT', null), cas(4, 'RESTART', 0)];
    await render(<DBBrokersCASSection brokersCAS={brokersCAS} casStatus="loaded" pollingProps={pollingProps} />);

    expect(container.textContent).toContain(CM.readyCount(1));
    expect(container.textContent).toContain(CM.busyCount(2));
    // Each CAS's rate with one decimal.
    expect(container.textContent).toContain('11.8');
    expect(container.textContent).toContain('1.3');
  });
});
