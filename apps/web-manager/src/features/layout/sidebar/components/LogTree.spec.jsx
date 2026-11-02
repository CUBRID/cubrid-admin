import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
vi.mock('../../../broker/brokerApi', () => ({
  brokerApi: { getDatabaseLogs: vi.fn(), getBrokerList: vi.fn(), getBrokerLogs: vi.fn() },
}));
import { brokerApi } from '../../../broker/brokerApi';
import hostReducer from '../../../host/hostSlice';
import databaseReducer, { loginDatabase } from '../../../database/databaseCoreSlice';
import brokerReducer from '../../../broker/brokerSlice';
import layoutReducer from '../../layoutSlice';
import LogTree from './LogTree';

let container;
let root;
let store;

const makeStore = ({ loggedIn = [], authorized = ['h1'] } = {}) => {
  const reducer = combineReducers({ host: hostReducer, database: databaseReducer, broker: brokerReducer, layout: layoutReducer });
  const initial = reducer(undefined, { type: '@@init' });
  return configureStore({
    reducer,
    preloadedState: {
      ...initial,
      host: { ...initial.host, authorizedHosts: authorized, reconnectQueue: [] },
      database: {
        ...initial.database,
        navigatorDatabasesByHost: { h1: [{ dbname: 'demodb' }] },
        loggedInDatabases: loggedIn,
      },
    },
  });
};

const render = async () => act(async () => root.render(<Provider store={store}><LogTree hostUid="h1" /></Provider>));
const settle = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });
const summaryOf = (details) => [...details.children].find((child) => child.tagName === 'SUMMARY');
const dbNode = () => [...container.querySelectorAll('details')]
  .find((d) => summaryOf(d)?.textContent.trim().endsWith('demodb'));
// Opening a <details> makes jsdom fire one toggle event, as a browser does.
const openDbNode = async () => {
  await act(async () => { dbNode().open = true; });
  await settle();
};
const closeDbNode = async () => {
  await act(async () => { dbNode().open = false; });
  await settle();
};
const login = () => act(async () => {
  store.dispatch(loginDatabase.fulfilled({ dbname: 'demodb' }, 'login', { hostUid: 'h1', dbname: 'demodb' }, { seq: 1 }));
});
// Unrelated store changes, which re-render the tree and re-run its effects.
const churn = () => act(async () => {
  for (let i = 0; i < 5; i++) {
    store.dispatch(loginDatabase.fulfilled({ dbname: `other${i}` }, `o${i}`, { hostUid: 'h1', dbname: `other${i}` }, { seq: 10 + i }));
  }
});

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  brokerApi.getDatabaseLogs.mockReset();
  // The host never answers: every read fails.
  brokerApi.getDatabaseLogs.mockRejectedValue(new Error('Network Error'));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it('reads a logged-in database\'s list once when opened, and not again while the read keeps failing', async () => {
  store = makeStore({ loggedIn: ['h1:demodb'] });
  await render();

  await openDbNode();
  await churn();
  await settle();
  await closeDbNode();

  expect(brokerApi.getDatabaseLogs).toHaveBeenCalledTimes(1);
});

it('reads again only when the user opens the node again', async () => {
  store = makeStore({ loggedIn: ['h1:demodb'] });
  await render();
  await openDbNode();
  await closeDbNode();

  await openDbNode();

  expect(brokerApi.getDatabaseLogs).toHaveBeenCalledTimes(2);
});

it('reads a node opened before its login once when the login arrives, and does not retry a failure', async () => {
  store = makeStore();
  await render();
  await openDbNode();
  await settle();
  expect(brokerApi.getDatabaseLogs).not.toHaveBeenCalled();
  expect(dbNode().textContent).toContain('Not logged in');

  await login();
  await settle();
  await churn();
  await settle();

  expect(brokerApi.getDatabaseLogs).toHaveBeenCalledTimes(1);
});

it('reads nothing while the host is not connected', async () => {
  store = makeStore({ authorized: [] });
  await render();
  await openDbNode();
  await login();
  await settle();
  await churn();

  expect(brokerApi.getDatabaseLogs).not.toHaveBeenCalled();
});
