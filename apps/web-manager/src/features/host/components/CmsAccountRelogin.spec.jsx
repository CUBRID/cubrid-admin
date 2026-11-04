import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
vi.mock('../hostApi', () => ({
  hostApi: {
    setHostPassword: vi.fn().mockResolvedValue({}),
    updateCmsUser: vi.fn().mockResolvedValue({}),
    getCmsUsers: vi.fn().mockResolvedValue([]),
    connectHost: vi.fn().mockResolvedValue({ success: true }),
    loginToHost: vi.fn().mockResolvedValue({ success: true }),
    getHaInfo: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../../server/monitoringSlice', () => ({
  clearMonitoring: () => ({ type: 'test/noop' }),
  fetchMonitoringData: () => ({ type: 'test/noop' }),
}));
vi.mock('../../server/globalMonitoringSlice', () => ({
  clearHostSummary: () => ({ type: 'test/noop' }),
  fetchHostSummary: () => ({ type: 'test/noop' }),
}));
import { hostApi } from '../hostApi';
import hostReducer from '../hostSlice';
import EditCMSUserModal from './EditCMSUserModal';
import ReconnectHostModal from './ReconnectHostModal';

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

// Host h1 is logged in to with the CMS account "admin".
const renderEditing = async (user) => {
  const reducer = combineReducers({ host: hostReducer, user: () => ({ preferences: { uiLocale: 'en' } }) });
  const initial = reducer(undefined, { type: '@@init' });
  const store = configureStore({
    reducer,
    preloadedState: {
      ...initial,
      host: {
        ...initial.host,
        hosts: [{ uid: 'h1', id: 'admin', alias: 'h1', address: '10.0.0.1', port: 8001 }],
        authorizedHosts: ['h1'],
        selectedHostUid: 'h1',
        isEditCmsUserModalOpen: true,
        cmsUserToEdit: { hostUid: 'h1', user: { id: user } },
      },
    },
  });
  await act(async () => root.render(<Provider store={store}><EditCMSUserModal /><ReconnectHostModal /></Provider>));
  return store;
};
const q = (id) => document.querySelector(`[data-testid="${id}"]`);
const setValue = (input, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const changePasswordAndClose = async () => {
  await act(async () => q('edit-cms-user-change-password-toggle').click());
  await act(async () => {
    setValue(q('edit-cms-user-password-input'), 'newpass1');
    setValue(q('edit-cms-user-confirm-password-input'), 'newpass1');
  });
  await act(async () => q('edit-cms-user-save-btn').click());
  // The success view's confirm button closes the window.
  await act(async () => q('modal-status-confirm-btn').click());
};

it('asks for the new password of the account this host logs in with, and logs in with it', async () => {
  const store = await renderEditing('admin');
  await changePasswordAndClose();

  expect(store.getState().host.reconnectQueue).toEqual(['h1']);
  expect(q('reconnect-host-reconnect-btn').disabled).toBe(true);
  expect(hostApi.loginToHost).not.toHaveBeenCalled();

  await act(async () => setValue(q('reconnect-host-password-input'), 'newpass1'));
  await act(async () => q('reconnect-host-reconnect-btn').click());
  expect(hostApi.connectHost).toHaveBeenCalledWith('h1', { password: 'newpass1' });
  expect(store.getState().host.reconnectQueue).toEqual([]);
  expect(store.getState().host.reconnectPasswordHosts).toEqual([]);
});

it('asks nothing when another account\'s password changes', async () => {
  const store = await renderEditing('user1');
  await changePasswordAndClose();

  expect(store.getState().host.reconnectQueue).toEqual([]);
  expect(q('reconnect-host-password-input')).toBeNull();
});
