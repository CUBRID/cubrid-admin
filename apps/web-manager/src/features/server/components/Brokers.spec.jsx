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
    startBroker: vi.fn(),
    stopBroker: vi.fn(),
  },
}));
import { brokerApi } from '../../broker/brokerApi';
import brokerReducer, { fetchBrokerList, resetBrokerState } from '../../broker/brokerSlice';
import layoutReducer, { setActiveMainTab } from '../../layout/layoutSlice';
import { startBrokerAndRefresh, stopBrokerAndRefresh } from '../../broker/brokerSidebarActions';
import Brokers from './Brokers';

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
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
});

function makeStore(activeMainTab) {
  const store = configureStore({
    reducer: {
      broker: brokerReducer,
      layout: layoutReducer,
      host: () => ({ authorizedHosts: ['h1'] }),
      user: () => ({ preferences: { uiLocale: 'en', brokerStatusInterval: 0 } }),
    },
  });
  store.dispatch(setActiveMainTab(activeMainTab));
  return store;
}

const brokerList = (pid, state = 'ON') => ({ result: [{ name: 'broker1', state, pid, port: '30000' }] });

const render = (store, props) => act(async () => {
  root.render(<Provider store={store}><Brokers hostUid="h1" {...props} /></Provider>);
});

// Stands in for ServerContent's own per-tick fetch on the host dashboard.
const hostDashboardTick = (store, pid, state) => act(async () => {
  brokerApi.getBrokerList.mockResolvedValueOnce(brokerList(pid, state));
  await store.dispatch(fetchBrokerList('h1'));
});

describe('Brokers embedded in the host dashboard', () => {
  it('does not fetch on its own', async () => {
    await render(makeStore('host:h1'), { isSection: true });
    expect(brokerApi.getBrokerList).not.toHaveBeenCalled();
  });

  it("follows the host dashboard's broker list fetches", async () => {
    const store = makeStore('host:h1');
    await render(store, { isSection: true });

    await hostDashboardTick(store, '1111');
    expect(container.textContent).toContain('1111');

    await hostDashboardTick(store, '2222');
    expect(container.textContent).toContain('2222');
    expect(container.textContent).not.toContain('1111');
  });

  it('shows the new state right after a sidebar broker action', async () => {
    const store = makeStore('host:h1');
    await render(store, { isSection: true });
    await hostDashboardTick(store, '1111', 'OFF');

    brokerApi.startBroker.mockResolvedValue({});
    brokerApi.getBrokerList.mockResolvedValue(brokerList('3333', 'ON'));
    await act(async () => {
      await store.dispatch(startBrokerAndRefresh({ hostUid: 'h1', brokerName: 'broker1' }));
    });

    expect(container.textContent).toContain('3333');
  });

  it('shows the new state as soon as the post-action fetch returns, even with a background poll in flight', async () => {
    const store = makeStore('host:h1');
    await render(store, { isSection: true });
    await hostDashboardTick(store, '1111', 'ON');

    const held = [];
    brokerApi.getBrokerList.mockImplementation(() => new Promise((resolve) => held.push(resolve)));
    brokerApi.stopBroker.mockResolvedValue({});
    await act(async () => {
      await store.dispatch(stopBrokerAndRefresh({ hostUid: 'h1', brokerName: 'broker1' }));
    });
    // A host dashboard poll starts while the post-action fetch is in flight
    // and shares it instead of sending its own.
    await act(async () => { store.dispatch(fetchBrokerList({ hostUid: 'h1', isBackground: true })); });

    await act(async () => { held[0](brokerList('', 'OFF')); });
    expect(container.textContent).toContain('OFF');
    expect(held).toHaveLength(1);
  });

  it('keeps the last list when focus leaves the host and its shared entry is evicted', async () => {
    const store = makeStore('host:h1');
    await render(store, { isSection: true });
    await hostDashboardTick(store, '1111');

    await act(async () => { store.dispatch(resetBrokerState('h1')); });

    expect(container.textContent).toContain('1111');
  });

  it('keeps the last list when a broker list fetch fails', async () => {
    const store = makeStore('host:h1');
    await render(store, { isSection: true });
    await hostDashboardTick(store, '1111');

    brokerApi.getBrokerList.mockRejectedValueOnce(new Error('network'));
    await act(async () => { await store.dispatch(fetchBrokerList('h1')); });
    expect(container.textContent).toContain('1111');

    await hostDashboardTick(store, '2222');
    expect(container.textContent).toContain('2222');
  });

  it('shows an empty list after a failure once a fetch really returns none', async () => {
    const store = makeStore('host:h1');
    await render(store, { isSection: true });
    await hostDashboardTick(store, '1111');

    brokerApi.getBrokerList.mockRejectedValueOnce(new Error('network'));
    await act(async () => { await store.dispatch(fetchBrokerList('h1')); });
    brokerApi.getBrokerList.mockResolvedValueOnce({ result: [] });
    await act(async () => { await store.dispatch(fetchBrokerList('h1')); });

    expect(container.textContent).not.toContain('1111');
  });

  it('shows OFF for brokers CMS lists without a state (broker service stopped)', async () => {
    const store = makeStore('host:h1');
    await render(store, { isSection: true });
    await act(async () => {
      brokerApi.getBrokerList.mockResolvedValueOnce({ result: [
        { name: 'broker1', port: '30000', appl_server_shm_id: '30000' },
        { name: 'query_editor', port: '30001', appl_server_shm_id: '30001' },
      ] });
      await store.dispatch(fetchBrokerList('h1'));
    });

    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.querySelectorAll('td')[1].textContent.trim()).toBe('OFF');
    expect(store.getState().broker.brokersByHost.h1.map((b) => b.state)).toEqual(['OFF', 'OFF']);
  });
});

describe('a SUSPENDED broker on the host dashboard', () => {
  it('shows an orange SUSPENDED chip and counts it as active', async () => {
    const store = makeStore('host:h1');
    await render(store, { isSection: true });
    await act(async () => {
      brokerApi.getBrokerList.mockResolvedValueOnce({ result: [
        { name: 'off1', port: '30001' },
        { name: 'sus1', state: 'SUSPENDED', pid: '42', port: '30002' },
        { name: 'on1', state: 'ON', pid: '43', port: '30003' },
      ] });
      await store.dispatch(fetchBrokerList('h1'));
    });

    const chip = (name) => [...container.querySelectorAll('tbody tr')]
      .find((tr) => tr.querySelector('td').textContent.trim() === name).querySelectorAll('td')[1];
    expect(chip('sus1').textContent.trim()).toBe('SUSPENDED');
    expect(chip('sus1').innerHTML).toContain('text-amber-600');
    expect(chip('on1').innerHTML).toContain('text-emerald-600');
    expect(chip('off1').innerHTML).toContain('text-rose');

    await act(async () => container.querySelector('[data-testid="server-dashboard-broker-status"] button').click());
    expect(container.textContent).toMatch(/2\s*Active/i);
  });
});

describe('Brokers as its own tab', () => {
  it('still fetches its own list', async () => {
    brokerApi.getBrokerList.mockResolvedValue(brokerList('4444'));
    await render(makeStore('brokers_status:h1'), {});
    expect(brokerApi.getBrokerList).toHaveBeenCalledWith('h1');
    expect(container.textContent).toContain('4444');
  });

  it('refetches after a sidebar broker action that lands while its own fetch is in flight', async () => {
    let resolveFirst;
    brokerApi.getBrokerList
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValue(brokerList('2222', 'ON'));
    brokerApi.startBroker.mockResolvedValue({});
    const store = makeStore('brokers_status:h1');
    await render(store, {});

    await act(async () => {
      await store.dispatch(startBrokerAndRefresh({ hostUid: 'h1', brokerName: 'broker1' }));
    });
    // The fetch sent before the start returns pre-action values.
    await act(async () => { resolveFirst(brokerList('1111', 'OFF')); });

    expect(container.textContent).toContain('2222');
    expect(container.textContent).not.toContain('1111');
  });
});
