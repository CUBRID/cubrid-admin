import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

vi.mock('../userApi', () => ({
  userApi: {
    getDatabaseUsers: vi.fn(),
    createDatabaseUser: vi.fn(),
    updateDatabaseUser: vi.fn(),
  },
}));
import { userApi } from '../userApi';
import userReducer from '../userSlice';
import CreateUserModal from './CreateUserModal';

const HOST_UID = 'host-1';
const DBNAME = 'demodb';

let container;
let root;
let store;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  userApi.getDatabaseUsers.mockResolvedValue({
    user: [{ '@name': 'alice', comment: 'reporting account' }],
  });
  userApi.createDatabaseUser.mockResolvedValue({});
  userApi.updateDatabaseUser.mockResolvedValue({ success: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  store = configureStore({
    reducer: combineReducers({
      host: (state = { selectedHostUid: HOST_UID }) => state,
      user: userReducer,
    }),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = async (editingUser) => act(async () => {
  root.render(
    <StrictMode>
      <Provider store={store}>
        <CreateUserModal isOpen onClose={vi.fn()} dbname={DBNAME} editingUser={editingUser} />
      </Provider>
    </StrictMode>
  );
});

const el = (testId) => container.querySelector(`[data-testid="${testId}"]`);

function setValue(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function expectNoDescriptionField() {
  expect(container.querySelector('input[name="memo"]')).toBeNull();
  expect(container.textContent).not.toContain('Description');
  const values = Array.from(container.querySelectorAll('input')).map((i) => i.value);
  expect(values).not.toContain('reporting account');
}

it('does not render a description field in create mode', async () => {
  await render(undefined);
  expect(el('create-user-username-input')).toBeTruthy();
  expectNoDescriptionField();
});

it('does not render a description field in edit mode, even when the user has a comment', async () => {
  await render('alice');
  expect(el('create-user-username-input').value).toBe('alice');
  expectNoDescriptionField();
});

it('saves an empty password in edit mode as no password, as the engine allows', async () => {
  await render('alice');
  const saveBtn = el('create-user-save-btn');
  expect(saveBtn.disabled).toBe(false);
  await act(async () => saveBtn.click());

  expect(userApi.updateDatabaseUser).toHaveBeenCalledTimes(1);
  const [, , , payload] = userApi.updateDatabaseUser.mock.calls[0];
  expect(payload.userpass).toBe('');
});

it('sends only the password in edit mode and shows the password-changed message', async () => {
  await render('alice');
  await act(async () => {
    setValue(el('create-user-password-input'), 'newpass1');
    setValue(el('create-user-confirm-password-input'), 'newpass1');
  });
  await act(async () => el('create-user-save-btn').click());

  expect(userApi.updateDatabaseUser).toHaveBeenCalledTimes(1);
  const [hostUid, dbname, userName, payload] = userApi.updateDatabaseUser.mock.calls[0];
  expect([hostUid, dbname, userName]).toEqual([HOST_UID, DBNAME, 'alice']);
  expect(payload.userpass).toBe('newpass1');
  expect(payload).not.toHaveProperty('memo');
  expect(payload).not.toHaveProperty('comment');

  expect(container.textContent).toContain('Password Changed');
  expect(container.textContent).toContain('Password for user @alice was changed.');
  expect(container.textContent).not.toContain('User Updated');
});

it('creates a user without a memo/comment in the payload', async () => {
  await render(undefined);
  const saveBtn = el('create-user-save-btn');
  await act(async () => {
    setValue(el('create-user-username-input'), 'bob');
    setValue(el('create-user-password-input'), 'bobpass1');
    setValue(el('create-user-confirm-password-input'), 'bobpass1');
  });
  expect(saveBtn.disabled).toBe(false);
  await act(async () => saveBtn.click());

  expect(userApi.createDatabaseUser).toHaveBeenCalledTimes(1);
  const [, , payload] = userApi.createDatabaseUser.mock.calls[0];
  expect(payload).toMatchObject({ username: 'bob', userpass: 'bobpass1' });
  expect(payload).not.toHaveProperty('memo');
  expect(payload).not.toHaveProperty('comment');
  expect(container.textContent).toContain('User Created');
});

it('creates a user with no password, as the engine allows', async () => {
  await render(undefined);
  await act(async () => setValue(el('create-user-username-input'), 'nopass'));
  await act(async () => el('create-user-save-btn').click());

  expect(userApi.createDatabaseUser).toHaveBeenCalledTimes(1);
  const [, , payload] = userApi.createDatabaseUser.mock.calls[0];
  expect(payload).toMatchObject({ username: 'nopass', userpass: '' });
});

it('rejects a password longer than the engine accepts (31 bytes)', async () => {
  await render(undefined);
  const tooLong = 'a'.repeat(32);
  await act(async () => {
    setValue(el('create-user-username-input'), 'bob');
    setValue(el('create-user-password-input'), tooLong);
    setValue(el('create-user-confirm-password-input'), tooLong);
  });
  await act(async () => el('create-user-save-btn').click());

  expect(userApi.createDatabaseUser).not.toHaveBeenCalled();
  expect(container.textContent).toContain('at most 31 bytes');
});
