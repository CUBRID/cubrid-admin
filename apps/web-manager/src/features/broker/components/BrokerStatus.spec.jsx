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
import brokerReducer from '../brokerSlice';
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
});
