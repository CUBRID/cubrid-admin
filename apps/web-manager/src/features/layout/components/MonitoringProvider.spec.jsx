import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

vi.mock('../../database/databaseSlice', () => ({
  fetchDatabaseStartInfo: (arg) => ({ type: 'test/fetchDatabaseStartInfo', payload: arg }),
  fetchDatabaseVolumes: (arg) => ({ type: 'test/fetchDatabaseVolumes', payload: arg }),
}));
vi.mock('../../broker/brokerSlice', () => ({
  fetchBrokerList: (arg) => ({ type: 'test/fetchBrokerList', payload: arg }),
}));

import MonitoringProvider from './MonitoringProvider';

let container;
let root;
let store;
let dispatched;
// While set, every start-info poll fails right away, as with an unreachable host.
let failStartInfo;
// While set, start-info polls stay pending until it is called.
let releaseStartInfo;

const initialState = {
  user: { preferences: { dashboardInterval: 10, brokerStatusInterval: 10 } },
  host: { selectedHostUid: 'host1', authorizedHosts: ['host1', 'host2'], reconnectQueue: [] },
  database: { activeDatabasesByHost: {}, loggedInDatabases: [] },
  layout: { activeMainTab: 'host:host1' },
};

const reducer = (state = initialState, action) => {
  // What a failed start-info does to the live list: a fresh empty array.
  if (action.type === 'test/startInfoFailed') {
    return { ...state, database: { ...state.database, activeDatabasesByHost: { host1: [] } } };
  }
  if (action.type === 'test/setReconnectQueue') {
    return { ...state, host: { ...state.host, reconnectQueue: action.payload } };
  }
  return state;
};

const countOf = (type) => dispatched.filter((a) => a.type === type).length;

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  dispatched = [];
  failStartInfo = false;
  releaseStartInfo = null;
  const recorder = (api) => (next) => (action) => {
    if (action.type.startsWith('test/fetch')) dispatched.push(action);
    const result = next(action);
    if (releaseStartInfo !== null && action.type === 'test/fetchDatabaseStartInfo') {
      return new Promise((resolve) => { releaseStartInfo = resolve; });
    }
    // Capped so a regression fails the count below instead of hanging the run.
    if (failStartInfo && action.type === 'test/fetchDatabaseStartInfo' && dispatched.length < 50) {
      Promise.resolve().then(() => api.dispatch({ type: 'test/startInfoFailed' }));
    }
    return result;
  };
  store = configureStore({ reducer, middleware: (gDM) => gDM().concat(recorder) });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <Provider store={store}>
        <MonitoringProvider>{null}</MonitoringProvider>
      </Provider>
    );
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  vi.useRealTimers();
});

const setReconnectQueue = (queue) => act(async () => {
  store.dispatch({ type: 'test/setReconnectQueue', payload: queue });
});

it('does not restart the selected host\'s polling when another host joins or leaves the reconnect queue', async () => {
  // Initial immediate refresh from both effects.
  expect(countOf('test/fetchDatabaseStartInfo')).toBe(1);
  expect(countOf('test/fetchBrokerList')).toBe(1);

  await setReconnectQueue(['host2']);
  await setReconnectQueue([]);

  expect(countOf('test/fetchDatabaseStartInfo')).toBe(1);
  expect(countOf('test/fetchBrokerList')).toBe(1);

  // The original timers keep their phase: next tick lands at the configured interval.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(countOf('test/fetchDatabaseStartInfo')).toBe(2);
  expect(countOf('test/fetchBrokerList')).toBe(2);
});

it('pauses polling while the selected host is pending reconnect and resumes when it leaves the queue', async () => {
  await setReconnectQueue(['host1']);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(countOf('test/fetchDatabaseStartInfo')).toBe(1);
  expect(countOf('test/fetchBrokerList')).toBe(1);

  await setReconnectQueue([]);
  expect(countOf('test/fetchDatabaseStartInfo')).toBe(2);
  expect(countOf('test/fetchBrokerList')).toBe(2);
});

it('waits for the interval after a failed poll instead of retrying at once', async () => {
  failStartInfo = true;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  // The first poll ran before failures were switched on; then one per interval.
  expect(countOf('test/fetchDatabaseStartInfo')).toBe(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(countOf('test/fetchDatabaseStartInfo')).toBe(3);
});

it('skips a tick while the previous poll is still waiting on the host', async () => {
  releaseStartInfo = () => {};
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(countOf('test/fetchDatabaseStartInfo')).toBe(2);

  // The host is busy with something slow: later ticks do not pile up.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(countOf('test/fetchDatabaseStartInfo')).toBe(2);
  expect(countOf('test/fetchBrokerList')).toBe(5);

  const release = releaseStartInfo;
  releaseStartInfo = null;
  await act(async () => { release(); });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(countOf('test/fetchDatabaseStartInfo')).toBe(3);
});
