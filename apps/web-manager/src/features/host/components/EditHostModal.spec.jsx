import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Thunks resolve at once; each returns what dispatch(...).unwrap() needs.
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
  closeEditHostModal: vi.fn(action('host/closeEditHostModal')),
  clearHostError: action('host/clearHostError'),
  setSelectedHost: action('host/setSelectedHost'),
}));
vi.mock('../../database/databaseSlice', () => ({ fetchDatabaseStartInfo: thunk() }));
vi.mock('../../broker/brokerSlice', () => ({ fetchBrokerList: thunk() }));
vi.mock('../../layout/layoutSlice', () => ({ setActiveMainTab: action('layout/setActiveMainTab') }));
import { closeEditHostModal, editHost, fetchHosts, loginToHostWithSideEffects } from '../hostSlice';
import EditHostModal from './EditHostModal';

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = () => {
  const state = {
    host: {
      isEditHostModalOpen: true,
      hostToEditUid: 'h1',
      hosts: [{ uid: 'h1', id: 'admin', address: '10.0.0.1', port: 8001, alias: 'Prod' }],
      hostGroups: {},
      loading: false,
      error: null,
    },
    layout: { statusModal: { isOpen: false } },
    user: { preferences: { uiLocale: 'en' } },
  };
  const store = configureStore({ reducer: () => state });
  return act(async () => root.render(<Provider store={store}><EditHostModal /></Provider>));
};
const q = (id) => document.querySelector(`[data-testid="${id}"]`);

it('keeps the stored password unless asked to change it', async () => {
  await render();
  await act(async () => q('edit-host-save-btn').click());
  expect(editHost).toHaveBeenCalledTimes(1);
  expect(editHost.mock.calls[0][0].payload).not.toHaveProperty('password');
});

it('saves an empty password when asked to change it and the field is left empty', async () => {
  await render();
  await act(async () => q('edit-host-change-password-toggle').click());
  await act(async () => q('edit-host-save-btn').click());
  expect(editHost.mock.calls[0][0].payload.password).toBe('');
});

it('logs in with the changed settings before saving anything', async () => {
  await render();
  await act(async () => q('edit-host-connect-save-btn').click());
  expect(editHost).not.toHaveBeenCalled();
  expect(loginToHostWithSideEffects).toHaveBeenCalledWith({
    hostUid: 'h1',
    changes: { id: 'admin', address: '10.0.0.1', port: 8001, alias: 'Prod' },
  });
  expect(fetchHosts).toHaveBeenCalledTimes(1);
  expect(closeEditHostModal).toHaveBeenCalled();
});

it('saves nothing and stays open when that login fails', async () => {
  loginToHostWithSideEffects.mockImplementationOnce(() => () => ({ unwrap: () => Promise.reject(new Error('Incorrect password')) }));
  await render();
  await act(async () => q('edit-host-connect-save-btn').click());
  expect(editHost).not.toHaveBeenCalled();
  expect(fetchHosts).not.toHaveBeenCalled();
  expect(closeEditHostModal).not.toHaveBeenCalled();
});
