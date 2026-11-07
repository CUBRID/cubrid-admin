import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The real volume table, slice and thunk; only the HTTP call is a stand-in,
// so these count the volume-info requests that actually go out.
vi.mock('../../database/databaseApi', () => ({
  databaseApi: { getVolumeInfo: vi.fn() },
}));
import { databaseApi } from '../../database/databaseApi';
import databaseMonitoringReducer, { volumesChanged } from '../../database/databaseMonitoringSlice';
import DatabaseVolumes from './DatabaseVolumes';

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  databaseApi.getVolumeInfo.mockResolvedValue({ spaceinfo: [], freespace: '0' });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const makeStore = () => configureStore({
  reducer: {
    host: (state = { authorizedHosts: ['host1'] }) => state,
    // 'test/sameLogins' rebuilds the list with the same names, as a login
    // elsewhere does.
    database: (state = { loggedInDatabases: ['host1:demodb'], activeDatabasesByHost: {} }, action) => (
      action.type === 'test/sameLogins' ? { ...state, loggedInDatabases: [...state.loggedInDatabases] } : state
    ),
    user: (state = { preferences: { uiLocale: 'en' } }) => state,
    databaseMonitoring: databaseMonitoringReducer,
  },
});

const render = (store, refreshKey, isShown = true) => act(async () => {
  root.render(
    <Provider store={store}>
      <DatabaseVolumes hostUid="host1" activeDatabases={['demodb']} dbListStatus="loaded" refreshKey={refreshKey} isShown={isShown} />
    </Provider>
  );
});

const requests = () => databaseApi.getVolumeInfo.mock.calls.length;

it('sends a volume-info request on each dashboard refresh (the button and the background ticks bump refreshKey)', async () => {
  const store = makeStore();
  await render(store, 0);
  expect(requests()).toBe(1);

  await render(store, 1);
  expect(requests()).toBe(2);
  await render(store, 2);
  expect(requests()).toBe(3);
  expect(databaseApi.getVolumeInfo).toHaveBeenLastCalledWith('host1', 'demodb');
});

it('sends a volume-info request after a volume was added on the host', async () => {
  const store = makeStore();
  await render(store, 0);
  expect(requests()).toBe(1);

  await act(async () => store.dispatch(volumesChanged('host1')));
  expect(requests()).toBe(2);
});

it('does not read again when the database lists are rebuilt with the same names', async () => {
  const store = makeStore();
  await render(store, 0);
  expect(requests()).toBe(1);

  await act(async () => store.dispatch({ type: 'test/sameLogins' }));
  await render(store, 0); // a new activeDatabases array with the same name
  expect(requests()).toBe(1);
});

it('reads nothing while its host tab is hidden, then once when shown again', async () => {
  const store = makeStore();
  await render(store, 0);
  expect(requests()).toBe(1);

  await render(store, 1, false);
  await act(async () => store.dispatch(volumesChanged('host1')));
  expect(requests()).toBe(1);

  await render(store, 1, true);
  expect(requests()).toBe(2);
  await render(store, 1, true);
  expect(requests()).toBe(2);
});
