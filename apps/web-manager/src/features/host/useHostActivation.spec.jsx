import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { login } = vi.hoisted(() => ({ login: { result: null } }));
vi.mock('../database/databaseCoreSlice', () => ({
  resetDatabaseState: (uid) => ({ type: 'test/resetDb', payload: uid }),
  fetchDatabaseStartInfo: (uid) => ({ type: 'test/startInfo', payload: uid }),
}));
vi.mock('../broker/brokerSlice', () => ({
  resetBrokerState: (uid) => ({ type: 'test/resetBroker', payload: uid }),
  fetchBrokerList: (uid) => ({ type: 'test/brokerList', payload: uid }),
}));
vi.mock('../layout/layoutSlice', () => ({ setActiveMainTab: (id) => ({ type: 'test/tab', payload: id }) }));
// The login stand-in runs `login.result(dispatch)`: it may store what a real
// login stores, then resolves or rejects as the real thunk's unwrap would.
vi.mock('./hostSlice', () => ({
  loginToHostWithSideEffects: () => (dispatch) => ({ unwrap: () => login.result(dispatch) }),
  fetchHostEnv: (uid) => ({ type: 'test/env', payload: uid }),
  openEditHostModal: (payload) => ({ type: 'test/edit', payload }),
  setSelectedHost: (uid) => ({ type: 'test/select', payload: uid }),
}));
vi.mock('../server/monitoringSlice', () => ({ fetchHaHeartbeatOnly: (uid) => ({ type: 'test/hb', payload: uid }) }));

import { useHostActivation } from './useHostActivation';

let container;
let root;
let actions;
let activate;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  actions = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

function Probe() {
  activate = useHostActivation();
  return null;
}

const render = async (host = {}) => {
  const initial = { authorizedHosts: [], selectedHostUid: null, haInfo: {}, ...host };
  const reducer = (state = { host: initial }, a) => {
    actions.push(a);
    if (a.type === 'test/loggedIn') {
      return { host: { ...state.host, authorizedHosts: [a.payload.uid], haInfo: { [a.payload.uid]: a.payload.haInfo } } };
    }
    return state;
  };
  const store = configureStore({ reducer });
  await act(async () => root.render(<Provider store={store}><Probe /></Provider>));
};
const of = (type) => actions.filter((a) => a.type === type);

it('opens Edit Host with the password field open when the saved password is turned down', async () => {
  login.result = () => Promise.reject('Incorrect password');
  await render();
  await act(async () => activate('h1'));
  expect(of('test/edit').map((a) => a.payload)).toEqual([{ hostUid: 'h1', passwordRejected: true }]);
});

it('opens Edit Host with the password kept when the login failed for another reason', async () => {
  login.result = () => Promise.reject('The host did not respond.');
  await render();
  await act(async () => activate('h1'));
  expect(of('test/edit').map((a) => a.payload)).toEqual([{ hostUid: 'h1', passwordRejected: false }]);
});

it('reads the HA heartbeat of an HA host right after logging in to it', async () => {
  // Logged out: no HA role known until the login answers.
  login.result = (dispatch) => {
    dispatch({ type: 'test/loggedIn', payload: { uid: 'h1', haInfo: { isHA: true, currentNodeType: 'master' } } });
    return Promise.resolve('h1');
  };
  await render();
  await act(async () => activate('h1'));
  expect(of('test/hb').map((a) => a.payload)).toEqual(['h1']);
});
