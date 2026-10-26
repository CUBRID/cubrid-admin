import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
// The real slices pull in apiClient/localStorage at import time; the map only
// needs their action creators, so fake them with the same action types.
vi.mock('../../layout/layoutSlice', () => ({
  openTab: (payload) => ({ type: 'layout/openTab', payload }),
  showStatusModal: (payload) => ({ type: 'layout/showStatusModal', payload }),
}));
vi.mock('../../layout/appBarSlice', () => ({
  setAboutCubrid: (payload) => ({ type: 'appBar/setAboutCubrid', payload }),
}));
vi.mock('../../host/hostSlice', () => Object.fromEntries(
  ['openAddHostModal', 'openEditHostModal', 'openServerVersionModal', 'openImportExportModal', 'openCmsUserManagementModal']
    .map((name) => [name, (payload) => ({ type: `host/${name}`, payload })])
));

import { useDesktopMenuActions } from './useDesktopMenuActions';
import { ALL_MENU_ACTIONS_DISABLED, MENU_ACTIONS } from '../../layout/menuActions';

const authSlice = createSlice({
  name: 'auth',
  initialState: { isAuthenticated: false },
  reducers: { setAuth: (state, action) => { state.isAuthenticated = action.payload; } },
});
const hostSlice = createSlice({
  name: 'host',
  initialState: { selectedHostUid: null, authorizedHosts: [] },
  reducers: {
    select: (state, action) => { state.selectedHostUid = action.payload; },
    touch: (state) => { state.authorizedHosts = [...state.authorizedHosts]; },
  },
});

let container;
let root;
let store;
let dispatched;
let emitMenuAction;
let unsubscribe;
let bridge;

function Harness() {
  useDesktopMenuActions();
  return null;
}

const render = async ({ isAuthenticated = true, selectedHostUid = null } = {}) => {
  dispatched = [];
  store = configureStore({
    reducer: {
      auth: authSlice.reducer,
      host: hostSlice.reducer,
      user: () => ({ preferences: { uiLocale: 'en' } }),
    },
    preloadedState: {
      auth: { isAuthenticated },
      host: { selectedHostUid, authorizedHosts: [] },
    },
    middleware: (getDefault) =>
      getDefault().concat(() => (next) => (action) => {
        dispatched.push(action);
        return next(action);
      }),
  });
  await act(async () => root.render(<Provider store={store}><Harness /></Provider>));
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  unsubscribe = vi.fn();
  bridge = {
    setMenuState: vi.fn().mockResolvedValue({ ok: true }),
    onMenuAction: vi.fn((callback) => {
      emitMenuAction = callback;
      return unsubscribe;
    }),
  };
  window.desktopBridge = bridge;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete window.desktopBridge;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it('reports every action disabled while signed out', async () => {
  await render({ isAuthenticated: false });
  expect(bridge.setMenuState).toHaveBeenCalledTimes(1);
  expect(bridge.setMenuState).toHaveBeenLastCalledWith(ALL_MENU_ACTIONS_DISABLED);
});

it('reports the enabled state only when it changes', async () => {
  await render();
  expect(bridge.setMenuState).toHaveBeenCalledTimes(1);
  expect(bridge.setMenuState.mock.lastCall[0][MENU_ACTIONS.editHost]).toBe(false);

  // A new authorizedHosts array with the same content changes nothing.
  await act(async () => store.dispatch(hostSlice.actions.touch()));
  expect(bridge.setMenuState).toHaveBeenCalledTimes(1);

  await act(async () => store.dispatch(hostSlice.actions.select('h1')));
  expect(bridge.setMenuState).toHaveBeenCalledTimes(2);
  expect(bridge.setMenuState.mock.lastCall[0][MENU_ACTIONS.editHost]).toBe(true);
});

it('runs a native menu action with the current host', async () => {
  await render();
  await act(async () => store.dispatch(hostSlice.actions.select('h1')));
  dispatched = [];
  await act(async () => emitMenuAction(MENU_ACTIONS.editHost));
  expect(dispatched).toEqual([{ type: 'host/openEditHostModal', payload: 'h1' }]);
});

it('drops actions that are currently disabled', async () => {
  await render();
  dispatched = [];
  await act(async () => emitMenuAction(MENU_ACTIONS.editHost));
  await act(async () => emitMenuAction('bogus'));
  expect(dispatched).toEqual([]);
});

it('unsubscribes on unmount and is a no-op without the desktop bridge', async () => {
  await render();
  await act(async () => root.unmount());
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  root = createRoot(container);

  delete window.desktopBridge;
  await expect(render()).resolves.toBeUndefined();
});
