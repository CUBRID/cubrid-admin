import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { usePollingRefresh } from './usePollingRefresh';

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

let container;
let root;
let store;
let fetchCalls;

function Harness({ pollingIntervalSeconds = 1, onFetch }) {
  usePollingRefresh({ hostUid: 'host1', tabId: 'tab1', pollingIntervalSeconds, onFetch });
  return null;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  fetchCalls = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const state = {
    host: { authorizedHosts: ['host1'] },
    layout: { refreshCounter: 0, activeMainTab: 'tab1' },
  };
  store = configureStore({ reducer: () => state });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  vi.useRealTimers();
});

const render = async (props) => act(async () => {
  root.render(
    <Provider store={store}>
      <Harness {...props} />
    </Provider>
  );
});

it('does not start a new polling tick while the previous one is still in flight', async () => {
  // Each call hangs until its own deferred is resolved, simulating a CMS
  // response slower than the polling interval.
  const pending = [];
  const onFetch = (silent) => () => {
    const d = deferred();
    pending.push(d);
    fetchCalls.push(silent);
    return d.promise;
  };

  await render({ pollingIntervalSeconds: 1, onFetch });
  // Initial load fetch (from usePollingRefresh's "Initial Load" effect).
  expect(fetchCalls.length).toBe(1);

  // Advance well past several polling intervals while the first fetch is
  // still unresolved — without the in-flight guard, each tick would start
  // its own overlapping fetch.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(fetchCalls.length).toBe(1);

  // Resolve the in-flight fetch, then advance one more interval — a new
  // tick should now be allowed to start.
  await act(async () => {
    pending[0].resolve();
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(fetchCalls.length).toBe(2);

  // Clean up the still-pending second fetch so it doesn't leak into another test.
  await act(async () => {
    pending.forEach((d) => d.resolve());
    await vi.advanceTimersByTimeAsync(0);
  });
});

it('does not fire an extra fetch or reset the timer when another host joins or leaves the reconnect queue', async () => {
  const initial = {
    host: { authorizedHosts: ['host1', 'host2'], reconnectQueue: [] },
    layout: { refreshCounter: 0, activeMainTab: 'tab1' },
  };
  store = configureStore({
    reducer: (state = initial, action) => (action.type === 'test/setReconnectQueue'
      ? { ...state, host: { ...state.host, reconnectQueue: action.payload } }
      : state),
  });
  const onFetch = (silent) => () => {
    fetchCalls.push(silent);
    return Promise.resolve();
  };

  await render({ pollingIntervalSeconds: 10, onFetch });
  expect(fetchCalls.length).toBe(1);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
    store.dispatch({ type: 'test/setReconnectQueue', payload: ['host2'] });
    store.dispatch({ type: 'test/setReconnectQueue', payload: [] });
  });
  expect(fetchCalls.length).toBe(1);

  // Timer phase is preserved: the next tick still lands 10s after mount.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(fetchCalls.length).toBe(2);
});
