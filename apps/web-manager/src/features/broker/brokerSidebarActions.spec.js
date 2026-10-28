import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

vi.mock('./brokerApi', () => ({
  brokerApi: {
    getBrokerList: vi.fn(),
    getBrokerStatus: vi.fn(),
    startBroker: vi.fn(),
    stopBroker: vi.fn(),
    startAllBrokers: vi.fn(),
    stopAllBrokers: vi.fn(),
  },
}));

import { brokerApi } from './brokerApi';
import brokerReducer from './brokerSlice';
import layoutReducer, { setActiveMainTab } from '../layout/layoutSlice';
import {
  isBrokerTabOfHost,
  refreshAfterBrokerAction,
  startBrokerAndRefresh,
  stopBrokerAndRefresh,
  startAllBrokersAndRefresh,
  stopAllBrokersAndRefresh,
  restartAllBrokersAndRefresh,
} from './brokerSidebarActions';

beforeEach(() => {
  vi.resetAllMocks();
  brokerApi.getBrokerList.mockResolvedValue({ result: [] });
});

function makeStore(activeMainTab) {
  const store = configureStore({ reducer: { broker: brokerReducer, layout: layoutReducer } });
  if (activeMainTab) store.dispatch(setActiveMainTab(activeMainTab));
  return store;
}

const refreshState = (store) => {
  const { refreshCounter, refreshTabId } = store.getState().layout;
  return { refreshCounter, refreshTabId };
};

describe('isBrokerTabOfHost', () => {
  it.each([
    ['brokers_status:h1', true],
    ['broker_status:h1:query_editor', true],
    ['brokers_status:h10', false],
    ['broker_status:h10:query_editor', false],
    ['brokers_status:h2', false],
    ['host:h1', false],
    ['edit_config:h1:cubridconf', false],
    ['broker_config:h1', false],
    [null, false],
  ])('%s → %s', (tabId, expected) => {
    expect(isBrokerTabOfHost(tabId, 'h1')).toBe(expected);
  });
});

describe('refreshAfterBrokerAction', () => {
  it('refreshes the active broker tab of the same host', () => {
    const store = makeStore('broker_status:h1:broker1');
    store.dispatch(refreshAfterBrokerAction('h1'));
    expect(refreshState(store)).toEqual({ refreshCounter: 1, refreshTabId: 'broker_status:h1:broker1' });
  });

  // A config editor reloads on this signal and would drop unsaved edits.
  it.each(['edit_config:h1:cubridconf', 'broker_config:h1', 'host:h1', 'brokers_status:h2'])(
    'leaves a non-broker or other-host tab (%s) alone',
    (tabId) => {
      const store = makeStore(tabId);
      store.dispatch(refreshAfterBrokerAction('h1'));
      expect(refreshState(store).refreshCounter).toBe(0);
    }
  );
});

describe('broker actions with refresh', () => {
  const cases = [
    ['startAllBrokersAndRefresh', () => startAllBrokersAndRefresh('h1'), [brokerApi.startAllBrokers]],
    ['stopAllBrokersAndRefresh', () => stopAllBrokersAndRefresh('h1'), [brokerApi.stopAllBrokers]],
    ['restartAllBrokersAndRefresh', () => restartAllBrokersAndRefresh('h1'), [brokerApi.stopAllBrokers, brokerApi.startAllBrokers]],
    ['startBrokerAndRefresh', () => startBrokerAndRefresh({ hostUid: 'h1', brokerName: 'broker1' }), [brokerApi.startBroker]],
    ['stopBrokerAndRefresh', () => stopBrokerAndRefresh({ hostUid: 'h1', brokerName: 'broker1' }), [brokerApi.stopBroker]],
  ];

  it.each(cases)('%s refreshes the active broker dashboard on success', async (_name, action, apis) => {
    apis.forEach((api) => api.mockResolvedValue({}));
    const store = makeStore('brokers_status:h1');
    await store.dispatch(action());
    apis.forEach((api) => expect(api).toHaveBeenCalled());
    expect(refreshState(store)).toEqual({ refreshCounter: 1, refreshTabId: 'brokers_status:h1' });
  });

  it.each(cases)('%s rejects and does not refresh when the action fails', async (_name, action, apis) => {
    apis.forEach((api) => api.mockRejectedValue({ response: { status: 500, data: { message: 'boom' } } }));
    const store = makeStore('brokers_status:h1');
    await expect(store.dispatch(action())).rejects.toBeTruthy();
    expect(refreshState(store).refreshCounter).toBe(0);
  });

  it('restart does not start brokers when stop fails', async () => {
    brokerApi.stopAllBrokers.mockRejectedValue({ response: { status: 500, data: { message: 'boom' } } });
    const store = makeStore('brokers_status:h1');
    await expect(store.dispatch(restartAllBrokersAndRefresh('h1'))).rejects.toBeTruthy();
    expect(brokerApi.startAllBrokers).not.toHaveBeenCalled();
  });

  // Each extra list fetch queues on CMS ahead of the one that updates the
  // view, so every action refetches the list exactly once.
  it.each(cases)('%s refetches the shared broker list once on the host dashboard', async (_name, action, apis) => {
    apis.forEach((api) => api.mockResolvedValue({}));
    const store = makeStore('host:h1');
    await store.dispatch(action());
    expect(brokerApi.getBrokerList).toHaveBeenCalledTimes(1);
    expect(brokerApi.getBrokerList).toHaveBeenCalledWith('h1');
    expect(refreshState(store).refreshCounter).toBe(0);
  });

  it.each(cases)('%s refetches once and refreshes an open broker status tab', async (_name, action, apis) => {
    apis.forEach((api) => api.mockResolvedValue({}));
    const store = makeStore('broker_status:h1:broker1');
    await store.dispatch(action());
    expect(brokerApi.getBrokerList).toHaveBeenCalledTimes(1);
    expect(refreshState(store).refreshCounter).toBe(1);
  });

  it.each(cases)('%s leaves the list fetch to an open broker list tab', async (_name, action, apis) => {
    apis.forEach((api) => api.mockResolvedValue({}));
    const store = makeStore('brokers_status:h1');
    await store.dispatch(action());
    expect(brokerApi.getBrokerList).not.toHaveBeenCalled();
    expect(refreshState(store).refreshCounter).toBe(1);
  });

  it('restart still refreshes when start fails after the brokers were stopped', async () => {
    brokerApi.stopAllBrokers.mockResolvedValue({});
    brokerApi.startAllBrokers.mockRejectedValue({ response: { status: 500, data: { message: 'boom' } } });
    const store = makeStore('broker_status:h1:broker1');
    await expect(store.dispatch(restartAllBrokersAndRefresh('h1'))).rejects.toBeTruthy();
    expect(brokerApi.getBrokerList).toHaveBeenCalledTimes(1);
    expect(refreshState(store).refreshCounter).toBe(1);
  });
});
