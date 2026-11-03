import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../database/databaseCoreSlice', () => ({
  fetchDatabaseStartInfo: (hostUid) => ({ type: 'fetchStartInfo', payload: hostUid }),
}));
vi.mock('../../broker/brokerSlice', () => ({
  fetchBrokerList: (hostUid) => ({ type: 'fetchBrokerList', payload: hostUid }),
}));
import { useRefillNavigatorLists } from './useRefillNavigatorLists';

let container;
let root;
let dispatched;

const makeStore = (state) => configureStore({
  reducer: (current = state, action) => {
    if (action.type === 'fetchStartInfo' || action.type === 'fetchBrokerList') dispatched.push(action);
    if (action.type === 'set') return action.payload;
    return current;
  },
});

const baseState = (patch = {}) => ({
  host: { selectedHostUid: 'A', authorizedHosts: ['A', 'B'] },
  database: { navigatorDatabasesByHost: {}, loadingByHost: {} },
  broker: { navigatorBrokersByHost: {}, loadingByHost: {} },
  ...patch,
});

function Probe() {
  useRefillNavigatorLists();
  return null;
}

const render = (store) => act(async () => root.render(<Provider store={store}><Probe /></Provider>));

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dispatched = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it('reads both lists of a selected host whose lists were dropped', async () => {
  await render(makeStore(baseState()));

  expect(dispatched).toEqual([
    { type: 'fetchStartInfo', payload: 'A' },
    { type: 'fetchBrokerList', payload: 'A' },
  ]);
});

it('reads nothing when the lists are there, even if empty', async () => {
  await render(makeStore(baseState({
    database: { navigatorDatabasesByHost: { A: [] }, loadingByHost: {} },
    broker: { navigatorBrokersByHost: { A: [{ name: 'broker1' }] }, loadingByHost: {} },
  })));

  expect(dispatched).toEqual([]);
});

it('does not add a second read while one is already running for that host', async () => {
  await render(makeStore(baseState({
    database: { navigatorDatabasesByHost: {}, loadingByHost: { A: true } },
    broker: { navigatorBrokersByHost: {}, loadingByHost: { A: true } },
  })));

  expect(dispatched).toEqual([]);
});

it('does nothing for a host that is not logged in', async () => {
  await render(makeStore(baseState({ host: { selectedHostUid: 'C', authorizedHosts: ['A'] } })));

  expect(dispatched).toEqual([]);
});

it('reads once when the user comes back to a host after its lists were dropped', async () => {
  const store = makeStore(baseState({
    host: { selectedHostUid: 'B', authorizedHosts: ['A', 'B'] },
    database: { navigatorDatabasesByHost: { B: [] }, loadingByHost: {} },
    broker: { navigatorBrokersByHost: { B: [] }, loadingByHost: {} },
  }));
  await render(store);
  expect(dispatched).toEqual([]);

  await act(async () => store.dispatch({ type: 'set', payload: { ...store.getState(), host: { selectedHostUid: 'A', authorizedHosts: ['A', 'B'] } } }));

  expect(dispatched).toEqual([
    { type: 'fetchStartInfo', payload: 'A' },
    { type: 'fetchBrokerList', payload: 'A' },
  ]);
});
