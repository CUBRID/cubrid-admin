import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

vi.mock('../brokerApi', () => ({
  brokerApi: {
    getBrokerList: vi.fn(),
    getBrokerStatus: vi.fn(),
  },
}));
import { brokerApi } from '../brokerApi';
import brokerReducer from '../brokerSlice';
import layoutReducer, { setActiveMainTab } from '../../layout/layoutSlice';
import BrokerStatus from './BrokerStatus';
import { CM } from '../../../constants/cmLabels';

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  brokerApi.getBrokerList.mockResolvedValue({ result: [{ name: 'broker1', state: 'ON', pid: '100', port: '30000' }] });
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
  store.dispatch(setActiveMainTab('broker_status:h1:broker1'));
  return store;
}

const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
};

const status = (asinfo) => ({ bname: 'broker1', asinfo, jobinfo: [] });
const as = { as_id: '1', as_pid: '4321', as_num_query: '1', as_num_tran: '1', as_psize: '2048', as_status: 'IDLE', as_dbname: 'demodb' };

const render = (store) => act(async () => {
  root.render(<Provider store={store}><BrokerStatus hostUid="h1" brokerName="broker1" /></Provider>);
});

describe('BrokerStatus fetch states', () => {
  it('shows the loading view until the first status fetch settles, never the empty tables', async () => {
    const request = deferred();
    brokerApi.getBrokerStatus.mockReturnValueOnce(request.promise);

    await render(makeStore());
    expect(container.textContent).toContain(CM.loadingBrokerStatus);
    expect(container.textContent).not.toContain(CM.noAppServersActiveMsg);

    await act(async () => request.resolve(status([])));
    expect(container.textContent).toContain(CM.noAppServersActiveMsg);
  });

  it('shows the full error view when the first fetch fails', async () => {
    brokerApi.getBrokerStatus.mockRejectedValueOnce({ response: { data: { message: 'boom' } } });

    await render(makeStore());

    expect(container.textContent).toContain(CM.failedToLoadStatus);
    expect(container.textContent).not.toContain(CM.noAppServersActiveMsg);
  });

  it('keeps the loaded tables and flags them stale when a refresh fails', async () => {
    brokerApi.getBrokerStatus.mockResolvedValueOnce(status([as]));
    await render(makeStore());
    expect(container.textContent).toContain('4321');

    brokerApi.getBrokerStatus.mockRejectedValueOnce({ response: { data: { message: 'boom' } } });
    const refreshBtn = container.querySelector(`button[title="${CM.refreshBrokerStatus}"]`);
    await act(async () => refreshBtn.click());

    expect(brokerApi.getBrokerStatus).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('4321');
    expect(container.textContent).toContain(CM.staleDataBadge);
    expect(container.textContent).not.toContain(CM.failedToLoadStatus);
  });
});
