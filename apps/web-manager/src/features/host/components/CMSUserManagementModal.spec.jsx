import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
vi.mock('../hostSlice', () => ({
  fetchCmsUsers: vi.fn((hostUid) => ({ type: 'test/fetchCmsUsers', payload: hostUid })),
  deleteCmsUser: vi.fn(() => ({ type: 'test/deleteCmsUser' })),
  openEditCmsUserModal: vi.fn((payload) => ({ type: 'test/openEditCmsUserModal', payload })),
  closeCmsUserManagementModal: vi.fn(() => ({ type: 'test/close' })),
}));
import { fetchCmsUsers, openEditCmsUserModal } from '../hostSlice';
import CMSUserManagementModal from './CMSUserManagementModal';
import { ConfirmProvider } from '../../../infrastructure/context/ConfirmContext';

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

// Opened from host B's menu while host A is the one selected.
it('lists and edits the CMS users of the host it was opened for', async () => {
  const state = {
    host: {
      isCmsUserManagementModalOpen: true,
      selectedHostUid: 'A',
      cmsUserManagementHostUid: 'B',
      hosts: [{ uid: 'A', alias: 'hostA' }, { uid: 'B', alias: 'hostB' }],
      cmsUsers: { B: [{ '@id': 'user1' }] },
      cmsUsersLoading: {},
    },
    user: { preferences: { uiLocale: 'en' } },
  };
  await act(async () => root.render(<Provider store={configureStore({ reducer: () => state })}><ConfirmProvider><CMSUserManagementModal /></ConfirmProvider></Provider>));

  expect(fetchCmsUsers).toHaveBeenCalledWith('B');
  expect(document.body.textContent).toContain('hostB');
  await act(async () => document.querySelector('[data-testid="cms-user-management-add-btn"]').click());
  expect(openEditCmsUserModal).toHaveBeenCalledWith({ hostUid: 'B', user: null });
});
