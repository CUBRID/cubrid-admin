import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
vi.mock('../hostApi', () => ({
  hostApi: { addHost: vi.fn(async () => ({ host_groups: {} })), testConnection: vi.fn() },
}));
import { hostApi } from '../hostApi';
import AddHostModal from './AddHostModal';
import { UNGROUPED_GROUP_ID } from '../hostGroupUtils';
import { CM } from '../../../constants/cmLabels';

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

// Address, port, account and password filled in; no name yet.
const render = ({ hosts = [], authorizedHosts = [] } = {}) => {
  const host = {
    loading: false, error: null, hosts, authorizedHosts, hostGroups: { [UNGROUPED_GROUP_ID]: { name: '', hosts: {} } },
    initialHostData: { address: '10.0.0.9', port: 8001, id: 'admin', password: 'pw' },
  };
  const store = configureStore({
    reducer: {
      host: () => host,
      user: () => ({ preferences: { uiLocale: 'en' } }),
      layout: () => ({ statusModal: { isOpen: false } }),
    },
  });
  return act(async () => root.render(<Provider store={store}><AddHostModal isOpen onClose={vi.fn()} /></Provider>));
};
const q = (testId) => container.querySelector(`[data-testid="${testId}"]`);
const testConnection = () => act(async () => q('add-host-test-connection-btn').click());

it('checks the typed settings without saving and says it connected', async () => {
  hostApi.testConnection.mockResolvedValue({ success: true });
  await render();
  await testConnection();

  expect(hostApi.testConnection).toHaveBeenCalledWith(expect.objectContaining({ address: '10.0.0.9', port: 8001, id: 'admin', password: 'pw' }));
  expect(hostApi.addHost).not.toHaveBeenCalled();
  expect(q('add-host-test-result').querySelector('p').textContent).toBe('Connected. Nothing was saved.');
});

it('says why it could not connect', async () => {
  hostApi.testConnection.mockRejectedValue({ response: { data: { message: 'Incorrect password' } } });
  await render();
  await testConnection();

  expect(q('add-host-test-result').querySelector('p').textContent).toBe('Could not connect: Incorrect password');
});

it('clears the result once a field changes', async () => {
  hostApi.testConnection.mockResolvedValue({ success: true });
  await render();
  await testConnection();
  await act(async () => {
    const input = container.querySelector('input[name="password"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'other');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(q('add-host-test-result')).toBeNull();
});

it('is off, with the reason, while a connected host has the same address, port and CMS user', async () => {
  const other = { uid: 'h1', address: '10.0.0.9', port: 8001, id: 'admin' };
  await render({ hosts: [other], authorizedHosts: ['h1'] });

  expect(q('add-host-test-connection-btn').disabled).toBe(true);
  expect(q('add-host-test-connection-btn').parentElement.getAttribute('title')).toBe(CM.testConnectionSameServerConnectedHint);
  await testConnection();
  expect(hostApi.testConnection).not.toHaveBeenCalled();
});

it('stays on when that host is not connected', async () => {
  await render({ hosts: [{ uid: 'h1', address: '10.0.0.9', port: 8001, id: 'admin' }], authorizedHosts: [] });
  expect(q('add-host-test-connection-btn').disabled).toBe(false);
});
