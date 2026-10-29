import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
import layoutReducer from '../../layout/layoutSlice';
import DefaultCmsPasswordModal from './DefaultCmsPasswordModal';

let container;
let root;
let store;

const hostSlice = createSlice({
  name: 'host',
  initialState: {
    hosts: [{ uid: 'h1', alias: 'Prod', address: '10.0.0.1' }, { uid: 'h2', alias: '', address: '10.0.0.2' }],
    opened: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder.addMatcher((a) => a.type === 'host/openChangePasswordModal', (state, a) => { state.opened = a.payload; });
  },
});

const loggedIn = (hostUid, usesDefaultPassword) => ({
  type: 'host/loginToHost/fulfilled',
  payload: { hostUid, success: true, isHA: false, ...(usesDefaultPassword ? { usesDefaultPassword } : {}) },
});

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  store = configureStore({
    reducer: { layout: layoutReducer, host: hostSlice.reducer, user: () => ({ preferences: { uiLocale: 'en' } }) },
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = () => act(async () => {
  root.render(<Provider store={store}><DefaultCmsPasswordModal /></Provider>);
});
const q = (id) => document.querySelector(`[data-testid="${id}"]`);

it('lists hosts logged in with admin/admin, once per session', async () => {
  await render();
  expect(q('default-cms-password-modal')).toBeNull();

  await act(async () => {
    store.dispatch(loggedIn('h1', true));
    store.dispatch(loggedIn('h2', true));
    store.dispatch(loggedIn('h3', false));
  });
  expect(q('default-cms-password-modal').textContent).toContain('Prod');
  expect(q('default-cms-password-modal').textContent).toContain('10.0.0.2');
  expect(q('default-cms-password-change-h3')).toBeNull();

  await act(async () => q('default-cms-password-close-btn').click());
  expect(q('default-cms-password-modal')).toBeNull();

  await act(async () => store.dispatch(loggedIn('h1', true)));
  expect(q('default-cms-password-modal')).toBeNull();
});

it('opens the host password change for the chosen host', async () => {
  await render();
  await act(async () => {
    store.dispatch(loggedIn('h1', true));
    store.dispatch(loggedIn('h2', true));
  });

  await act(async () => q('default-cms-password-change-h1').click());
  expect(store.getState().host.opened).toBe('h1');
  expect(q('default-cms-password-change-h1')).toBeNull();
  expect(q('default-cms-password-change-h2')).not.toBeNull();
});
