import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Thunks resolve at once; each returns what dispatch(...).unwrap() needs.
const { thunk } = vi.hoisted(() => ({
  thunk: () => vi.fn(() => () => ({ unwrap: () => Promise.resolve() })),
}));
vi.mock('../hostSlice', () => ({
  addCmsUser: thunk(),
  updateCmsUser: thunk(),
  setHostPassword: thunk(),
  fetchCmsUsers: thunk(),
  closeEditCmsUserModal: () => ({ type: 'host/closeEditCmsUserModal' }),
}));
import { setHostPassword, updateCmsUser } from '../hostSlice';
import EditCMSUserModal from './EditCMSUserModal';

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
    host: { isEditCmsUserModalOpen: true, selectedHostUid: 'h1', cmsUserToEdit: { user: { id: 'user1', casauth: 'none' } } },
    user: { preferences: { uiLocale: 'en' } },
  };
  const store = configureStore({ reducer: () => state });
  return act(async () => root.render(<Provider store={store}><EditCMSUserModal /></Provider>));
};
const q = (id) => document.querySelector(`[data-testid="${id}"]`);
const setValue = (input, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

it('keeps the password when editing unless asked to change it', async () => {
  await render();
  expect(q('edit-cms-user-password-input').disabled).toBe(true);

  await act(async () => q('edit-cms-user-save-btn').click());
  expect(updateCmsUser).toHaveBeenCalledTimes(1);
  expect(setHostPassword).not.toHaveBeenCalled();
});

it('changes the password once asked, which CMS needs to be non-empty', async () => {
  await render();
  await act(async () => q('edit-cms-user-change-password-toggle').click());
  expect(q('edit-cms-user-save-btn').disabled).toBe(true);

  await act(async () => {
    setValue(q('edit-cms-user-password-input'), 'newpass');
    setValue(q('edit-cms-user-confirm-password-input'), 'newpass');
  });
  await act(async () => q('edit-cms-user-save-btn').click());
  expect(setHostPassword).toHaveBeenCalledWith({ hostUid: 'h1', payload: { targetid: 'user1', newpassword: 'newpass' } });
});
