import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { thunk, action } = vi.hoisted(() => ({
  thunk: () => vi.fn(() => () => ({ unwrap: () => Promise.resolve() })),
  action: (type) => () => ({ type }),
}));
vi.mock('../hostSlice', () => ({
  editHost: thunk(),
  moveHost: thunk(),
  fetchHosts: thunk(),
  loginToHostWithSideEffects: thunk(),
  fetchHostEnv: thunk(),
  closeEditHostModal: action('host/closeEditHostModal'),
  clearHostError: action('host/clearHostError'),
  setSelectedHost: action('host/setSelectedHost'),
}));
vi.mock('../../database/databaseSlice', () => ({ fetchDatabaseStartInfo: thunk() }));
vi.mock('../../broker/brokerSlice', () => ({ fetchBrokerList: thunk() }));
vi.mock('../../layout/layoutSlice', () => ({ setActiveMainTab: action('layout/setActiveMainTab') }));
import EditHostModal from './EditHostModal';

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = async (editHostPasswordRejected) => {
  const state = {
    host: {
      isEditHostModalOpen: true,
      hostToEditUid: 'h1',
      editHostPasswordRejected,
      hosts: [{ uid: 'h1', id: 'admin', address: '10.0.0.1', port: 8001, alias: 'Prod' }],
      hostGroups: {},
      loading: false,
      error: editHostPasswordRejected ? 'Incorrect password' : null,
      authorizedHosts: [],
    },
    layout: { statusModal: { isOpen: false } },
    user: { preferences: { uiLocale: 'en' } },
  };
  const store = configureStore({ reducer: () => state });
  await act(async () => root.render(<Provider store={store}><EditHostModal /></Provider>));
  // Modal and the password focus both wait a frame.
  await act(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};
const passwordInput = () => container.ownerDocument.querySelector('input[name="password"]');

it('opens the password field and focuses it when the saved password was turned down', async () => {
  await render(true);
  expect(passwordInput().disabled).toBe(false);
  expect(document.activeElement).toBe(passwordInput());
});

it('keeps the saved password locked on a normal edit', async () => {
  await render(false);
  expect(passwordInput().disabled).toBe(true);
  expect(document.activeElement).not.toBe(passwordInput());
});
