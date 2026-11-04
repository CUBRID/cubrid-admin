import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

vi.mock('../../broker/brokerApi', () => ({
  brokerApi: {
    getBrokerList: vi.fn(),
    getBrokerStatus: vi.fn(),
    // Used instead of getBrokerStatus once the bulk status route lands
    // (fix/broker-status-bulk-fetch); unused before that.
    getBrokerStatusBulk: vi.fn(),
  },
}));
import { brokerApi } from '../../broker/brokerApi';
import brokerReducer from '../../broker/brokerSlice';
import layoutReducer, { setActiveMainTab } from '../../layout/layoutSlice';
import Brokers from './Brokers';
import { CM } from '../../../constants/cmLabels';

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  brokerApi.getBrokerStatus.mockResolvedValue({});
  brokerApi.getBrokerStatusBulk.mockImplementation(async (_hostUid, names) => ({ brokers: names.map((bname) => ({ bname })) }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  vi.restoreAllMocks();
});

function makeStore() {
  const store = configureStore({
    reducer: {
      broker: brokerReducer,
      layout: layoutReducer,
      host: () => ({ authorizedHosts: ['h1'] }),
      user: () => ({ preferences: { uiLocale: 'en', brokerStatusInterval: 0 } }),
    },
  });
  store.dispatch(setActiveMainTab('brokers_status:h1'));
  return store;
}

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const brokerList = (names) => ({ result: names.map((name) => ({ name, state: 'ON', pid: '100', port: '30000' })) });
const card = () => container.querySelector('[data-testid="server-dashboard-broker-status"]');

const render = (store) => act(async () => {
  root.render(<Provider store={store}><Brokers hostUid="h1" /></Provider>);
});

describe('Brokers broker list fetch states', () => {
  it('shows loading, not "no data", while the first broker list fetch is in flight', async () => {
    const request = deferred();
    brokerApi.getBrokerList.mockReturnValueOnce(request.promise);

    await render(makeStore());

    expect(card().textContent).toContain(CM.loadingLabel);
    expect(card().textContent).not.toContain(CM.noDataAvailableMsg);

    await act(async () => request.resolve(brokerList([])));
    expect(card().textContent).toContain(CM.noDataAvailableMsg);
    expect(card().textContent).not.toContain(CM.loadingLabel);
  });

  it('shows an unavailable state when the first fetch fails', async () => {
    brokerApi.getBrokerList.mockRejectedValueOnce(new Error('timeout'));

    await render(makeStore());

    expect(card().textContent).toContain(CM.dataUnavailableTitle);
    expect(card().textContent).not.toContain(CM.noDataAvailableMsg);
  });

  it('keeps the loaded brokers when a later refresh fails', async () => {
    brokerApi.getBrokerList.mockResolvedValueOnce(brokerList(['query_editor']));
    await render(makeStore());
    expect(card().textContent).toContain('query_editor');

    brokerApi.getBrokerList.mockRejectedValueOnce(new Error('timeout'));
    const refreshBtn = container.querySelector(`button[title="${CM.refreshBrokersList}"]`);
    await act(async () => refreshBtn.click());

    expect(brokerApi.getBrokerList).toHaveBeenCalledTimes(2);
    expect(card().textContent).toContain('query_editor');
    expect(card().textContent).not.toContain(CM.dataUnavailableTitle);
  });
});

describe('Brokers refresh button during background polls', () => {
  // The status tab polls every few seconds; each poll used to dim and spin
  // the refresh button, which read as the view flickering.
  const pollingStore = () => {
    const store = configureStore({
      reducer: {
        broker: brokerReducer,
        layout: layoutReducer,
        host: () => ({ authorizedHosts: ['h1'] }),
        user: () => ({ preferences: { uiLocale: 'en', brokerStatusInterval: 3 } }),
      },
    });
    store.dispatch(setActiveMainTab('brokers_status:h1'));
    return store;
  };
  const refreshButton = () => container.querySelector(`button[title="${CM.refreshBrokersList}"]`);

  it('leaves the button alone while a background poll waits', async () => {
    vi.useFakeTimers();
    const poll = deferred();
    try {
      brokerApi.getBrokerList.mockResolvedValue(brokerList(['broker1']));
      await render(pollingStore());
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(refreshButton().disabled).toBe(false);

      brokerApi.getBrokerList.mockReturnValue(poll.promise);
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(brokerApi.getBrokerList).toHaveBeenCalledTimes(2);
      expect(refreshButton().disabled).toBe(false);
      expect(refreshButton().querySelector('.animate-spin')).toBeNull();
    } finally {
      // Broker list reads are shared per host across the module; a poll left
      // waiting would hold up the next test's read.
      await act(async () => { poll.resolve(brokerList(['broker1'])); await vi.advanceTimersByTimeAsync(0); });
      vi.useRealTimers();
    }
  });

  it('still shows a refresh the user asked for', async () => {
    brokerApi.getBrokerList.mockResolvedValue(brokerList(['broker1']));
    await render(pollingStore());
    const read = deferred();
    brokerApi.getBrokerList.mockReturnValue(read.promise);
    await act(async () => refreshButton().click());
    expect(refreshButton().disabled).toBe(true);
    await act(async () => read.resolve(brokerList(['broker1'])));
    expect(refreshButton().disabled).toBe(false);
  });
});
