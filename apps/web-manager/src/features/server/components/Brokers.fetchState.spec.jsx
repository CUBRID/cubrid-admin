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
