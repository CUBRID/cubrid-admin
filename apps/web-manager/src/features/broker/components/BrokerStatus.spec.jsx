import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../brokerApi', () => ({
  brokerApi: {
    getBrokerList: vi.fn(),
    getBrokerStatus: vi.fn(),
  },
}));
// Unrelated to what's under test, and otherwise drags in the real
// userSlice.js -> userApi.js -> apiClient.js chain (which touches
// localStorage at import time) just for a popover this test never opens.
vi.mock('../../user/components/MonitoringSettingsPopover', () => ({ default: () => null }));

import { brokerApi } from '../brokerApi';
import brokerReducer, { fetchBrokerList } from '../brokerSlice';
import BrokerStatus from './BrokerStatus';
import { CM } from '../../../constants/cmLabels';

const HOST_UID = 'host1';
const BROKER_NAME = 'broker1';

const rawBroker = (overrides = {}) => ({
  name: BROKER_NAME,
  state: 'ON',
  pid: '123',
  port: '30000',
  jq: '2',
  auto: 'ON',
  sqll: 'ERROR',
  long_tran_time: '1',
  long_query_time: '1',
  ...overrides,
});

const statusResponse = () => ({ bname: BROKER_NAME, asinfo: [], jobinfo: [] });

let container;
let root;
let store;

// usePollingRefresh/useCM only ever read a handful of fields off host/user/
// layout state — fake those slices instead of pulling in the real
// hostSlice/userSlice modules, which (via hostApi -> apiClient) touch
// localStorage at import time and are unrelated to what's under test here.
const hostState = { authorizedHosts: [HOST_UID] };
const userState = { preferences: { uiLocale: 'en', brokerStatusInterval: 0 } };
const layoutState = { refreshCounter: 0, activeMainTab: null };

const makeStore = () => configureStore({
  reducer: {
    broker: brokerReducer,
    host: (state = hostState) => state,
    user: (state = userState) => state,
    layout: (state = layoutState) => state,
  },
});

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  store = makeStore();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = async () => act(async () => {
  root.render(
    <StrictMode>
      <Provider store={store}>
        <BrokerStatus hostUid={HOST_UID} brokerName={BROKER_NAME} />
      </Provider>
    </StrictMode>
  );
});

const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

const refreshButton = () => container.querySelector(`button[title="${CM.refreshBrokerStatus}"]`);

describe('BrokerStatus basic information refresh', () => {
  it('fetches the broker list without the per-broker status enrichment loop', async () => {
    brokerApi.getBrokerList.mockResolvedValue({ result: [rawBroker()] });
    brokerApi.getBrokerStatus.mockResolvedValue(statusResponse());

    await render();
    await flush();

    // Only fetchDetailedBrokerStatus's own call for the viewed broker — the
    // list fetch must not also call getBrokerStatus once per broker.
    expect(brokerApi.getBrokerStatus).toHaveBeenCalledTimes(1);
    expect(brokerApi.getBrokerStatus).toHaveBeenCalledWith(HOST_UID, BROKER_NAME);
    expect(container.textContent).toContain('123'); // pid from the list
    expect(container.textContent).toContain('30000'); // port from the list
  });

  it('does not multiply requests by broker count on this host', async () => {
    brokerApi.getBrokerList.mockResolvedValue({
      result: [rawBroker(), rawBroker({ name: 'broker2' }), rawBroker({ name: 'broker3' })],
    });
    brokerApi.getBrokerStatus.mockResolvedValue(statusResponse());

    await render();
    await flush();

    expect(brokerApi.getBrokerList).toHaveBeenCalledTimes(1);
    // Still just the one call for the currently-viewed broker, regardless of
    // how many brokers are on the host.
    expect(brokerApi.getBrokerStatus).toHaveBeenCalledTimes(1);
  });

  it('shows a stale-data indicator and keeps the last known values when the broker list refresh fails', async () => {
    brokerApi.getBrokerList.mockResolvedValueOnce({ result: [rawBroker()] });
    brokerApi.getBrokerStatus.mockResolvedValue(statusResponse());

    await render();
    await flush();
    expect(container.textContent).toContain('123');
    expect(container.textContent).not.toContain(CM.staleDataBadge);

    brokerApi.getBrokerList.mockRejectedValueOnce(new Error('list unavailable'));
    await act(async () => { refreshButton().click(); });
    await flush();

    // Basic Information keeps showing the last known pid/port instead of
    // collapsing to "—"/"0"/"OFF" (indistinguishable from a genuinely idle
    // broker), and a distinct stale-data badge appears.
    expect(container.textContent).toContain('123');
    expect(container.textContent).toContain('30000');
    expect(container.textContent).toContain(CM.staleDataBadge);
    // The detailed-status fetch itself still succeeded, so the big danger
    // banner (tied to that other fetch) must not show.
    expect(container.textContent).not.toContain(CM.failedToLoadStatus);
  });

  it('does not pick up a same-named broker from a different host sharing state.broker.brokers', async () => {
    brokerApi.getBrokerList.mockImplementation((hostUid) => Promise.resolve({
      result: [rawBroker(hostUid === HOST_UID ? { pid: '123', port: '30000' } : { pid: '999', port: '40000' })],
    }));
    brokerApi.getBrokerStatus.mockResolvedValue(statusResponse());

    await render();
    await flush();
    expect(container.textContent).toContain('123');
    expect(container.textContent).toContain('30000');

    // Simulate another, still-mounted tab refreshing the SAME-NAMED broker
    // on a DIFFERENT host. fetchBrokerList.fulfilled replaces the whole
    // shared state.broker.brokers array, so if this component read from
    // that selector directly (instead of its own request-scoped result) it
    // would now show host2's pid/port under host1's broker.
    await act(async () => { await store.dispatch(fetchBrokerList('host2')); });

    expect(container.textContent).toContain('123');
    expect(container.textContent).toContain('30000');
    expect(container.textContent).not.toContain('999');
    expect(container.textContent).not.toContain('40000');
  });
});

describe('BrokerStatus job queue', () => {
  it('shows how long each job has waited, with its receive time as the tooltip', async () => {
    brokerApi.getBrokerList.mockResolvedValue({ result: [rawBroker()] });
    brokerApi.getBrokerStatus.mockResolvedValue({
      ...statusResponse(),
      time: '2026/10/27 00:00:03',
      jobinfo: [
        { job_id: '1', job_priority: '0', job_ip: '10.0.0.1', job_time: '23:59:58', job_request: ':cub_cas' },
        { job_id: '2', job_priority: '0', job_ip: '10.0.0.2', job_time: '', job_request: ':cub_cas' },
      ],
    });

    await render();
    await flush();

    const cell = container.querySelector(`span[title="${CM.jobReceivedAt('23:59:58')}"]`);
    expect(cell).not.toBeNull();
    expect(cell.textContent).toBe('5s');
    // A job without a receive time shows a dash and no tooltip.
    const elapsedCells = [...container.querySelectorAll('span.text-rose-500')].map((el) => [el.textContent, el.title]);
    expect(elapsedCells).toEqual([['5s', CM.jobReceivedAt('23:59:58')], ['—', '']]);
  });
});

describe('BrokerStatus basic information values', () => {
  const cell = (label) => [...container.querySelectorAll('span')].find((span) => span.textContent === label)?.parentElement;
  const isLit = (label) => !!cell(label)?.querySelector('.bg-emerald-50');

  it('shows SQL_LOG as off when the engine reports NONE', async () => {
    brokerApi.getBrokerList.mockResolvedValue({ result: [rawBroker({ sqll: 'NONE' })] });
    brokerApi.getBrokerStatus.mockResolvedValue(statusResponse());
    await render();
    await flush();

    expect(cell('SQL_LOG').textContent).toContain('NONE');
    expect(isLit('SQL_LOG')).toBe(false);
    expect(isLit('AUTO_ADD_APPL_SERVER')).toBe(true);
  });

  it('shows the settings as unknown when the broker service is off and the list has no state', async () => {
    brokerApi.getBrokerList.mockResolvedValue({ result: [{ name: BROKER_NAME }] });
    brokerApi.getBrokerStatus.mockResolvedValue(statusResponse());
    await render();
    await flush();

    for (const label of ['AUTO_ADD_APPL_SERVER', 'SQL_LOG', 'LONG_TRANSACTION_TIME', 'LONG_QUERY_TIME']) {
      expect(cell(label).textContent).toBe(`${label}-`);
    }
  });

  it('shows the settings of a stopped broker as unknown, not as defaults', async () => {
    brokerApi.getBrokerList.mockResolvedValue({ result: [{ name: BROKER_NAME, state: 'OFF' }] });
    brokerApi.getBrokerStatus.mockResolvedValue(statusResponse());
    await render();
    await flush();

    for (const label of ['AUTO_ADD_APPL_SERVER', 'SQL_LOG', 'LONG_TRANSACTION_TIME', 'LONG_QUERY_TIME']) {
      expect(cell(label).textContent).toBe(`${label}-`);
    }
  });
});

describe('BrokerStatus application server table', () => {
  // Header text without the sort icon's ligature name.
  const headers = () => [...container.querySelectorAll('th')].map((th) => th.textContent.replace(/(unfold_more|arrow_upward|arrow_downward|expand_more|expand_less)$/, '').trim());
  const asRow = (overrides = {}) => ({
    as_id: '1', as_pid: '4321', as_c: '10', as_psize: '20480', as_status: 'IDLE', as_cpu: '0.5', as_ctime: '0:01',
    as_lat: '2026/11/05 10:00:00', as_lct: '2026/11/05 09:59:00', as_cur: '',
    as_num_query: '100', as_num_tran: '50', as_long_query: '4', as_long_tran: '0', as_error_query: '0',
    as_dbname: 'demodb', as_dbhost: 'localhost', as_client_ip: '10.0.0.5',
    ...overrides,
  });

  it('shows the columns of broker status -f, with LQS from the rise in long queries per second', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    brokerApi.getBrokerList.mockResolvedValue({ result: [rawBroker()] });
    brokerApi.getBrokerStatus.mockResolvedValue({ ...statusResponse(), asinfo: [asRow()] });
    await render();
    await flush();

    expect(headers()).toEqual(expect.arrayContaining([
      CM.asRequestsCol, CM.qps, CM.lqs, CM.tps, CM.asCpuTimeCol, CM.asDbHostCol, CM.asLastConnectCol, CM.asCurrentSqlCol,
    ]));
    // CMS sends as_port on Windows only; without it there is no PORT column.
    expect(headers()).not.toContain(CM.port);
    expect(container.textContent).toContain('20.0 MiB');

    now += 2000;
    brokerApi.getBrokerStatus.mockResolvedValue({ ...statusResponse(), asinfo: [asRow({ as_num_query: '120', as_num_tran: '54', as_long_query: '10' })] });
    await act(async () => refreshButton().click());
    await flush();

    const row = [...container.querySelectorAll('tbody tr')][0];
    const cells = [...row.querySelectorAll('td')].map((td) => td.textContent.trim());
    const col = (label) => cells[headers().indexOf(label)];
    expect(col(CM.qps)).toBe('10.0');
    expect(col(CM.lqs)).toBe('3.0');
    expect(col(CM.tps)).toBe('2.0');
    vi.restoreAllMocks();
  });

  it('shows a time on the broker\'s current date as the time of day, the full value on hover', async () => {
    brokerApi.getBrokerList.mockResolvedValue({ result: [rawBroker()] });
    brokerApi.getBrokerStatus.mockResolvedValue({
      ...statusResponse(),
      time: '2026/11/05 07:40:00',
      asinfo: [asRow({ as_lat: '2026/11/05 07:35:40', as_lct: '2026/11/04 23:00:00', as_dbhost: 'a-very-long-database-host-name' })],
    });
    await render();
    await flush();

    const row = container.querySelector('tbody tr');
    const cellOf = (label) => row.querySelectorAll('td')[headers().indexOf(label)];
    const access = cellOf(CM.lastAccess).querySelector('span');
    expect(access.textContent).toBe('07:35:40');
    expect(access.title).toBe('2026/11/05 07:35:40');
    expect(cellOf(CM.asLastConnectCol).textContent).toBe('2026/11/04 23:00:00');
    // Long text is cut on screen; the whole value is the tooltip.
    expect(cellOf(CM.asDbHostCol).querySelector('span').title).toBe('a-very-long-database-host-name');
  });

  it('shows the PORT column when CMS sends each server\'s port (Windows)', async () => {
    brokerApi.getBrokerList.mockResolvedValue({ result: [rawBroker()] });
    brokerApi.getBrokerStatus.mockResolvedValue({ ...statusResponse(), asinfo: [asRow({ as_port: '30001' })] });
    await render();
    await flush();

    expect(headers()).toContain(CM.port);
  });
});
