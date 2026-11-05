import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
vi.mock('../hostApi', () => ({ hostApi: { testSavedHostConnection: vi.fn(), editHost: vi.fn() } }));
import { hostApi } from '../hostApi';
import EditHostModal from './EditHostModal';
import { UNGROUPED_GROUP_ID } from '../hostGroupUtils';

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

const host = { uid: 'h1', alias: 'web1', address: '10.0.0.1', port: 8001, id: 'admin' };
const render = (authorizedHosts) => {
  const state = {
    host: {
      isEditHostModalOpen: true, hostToEditUid: 'h1', hosts: [host], loading: false, error: null, authorizedHosts,
      hostGroups: { [UNGROUPED_GROUP_ID]: { name: '', hosts: { h1: host } } },
    },
    layout: { statusModal: { isOpen: false } },
    user: { preferences: { uiLocale: 'en' } },
  };
  return act(async () => root.render(<Provider store={configureStore({ reducer: () => state })}><EditHostModal /></Provider>));
};
const q = (testId) => container.querySelector(`[data-testid="${testId}"]`);

it('tests a host that is not connected with its saved password, saving nothing', async () => {
  hostApi.testSavedHostConnection.mockResolvedValue({ success: true });
  await render([]);
  await act(async () => q('edit-host-test-connection-btn').click());

  expect(hostApi.testSavedHostConnection).toHaveBeenCalledWith('h1', { id: 'admin', address: '10.0.0.1', port: 8001 });
  expect(hostApi.editHost).not.toHaveBeenCalled();
  expect(q('edit-host-test-result').querySelector('p').textContent).toBe('Connected. Nothing was saved.');
});

it('does not test a connected host and says why', async () => {
  await render(['h1']);
  const button = q('edit-host-test-connection-btn');
  expect(button.disabled).toBe(true);
  expect(button.parentElement.getAttribute('title')).toBe("Can't test a connected host (it could end the current connection).");
});
