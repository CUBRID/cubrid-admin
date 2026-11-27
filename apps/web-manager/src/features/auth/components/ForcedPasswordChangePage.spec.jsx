import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../authApi', () => ({ authApi: { setInitialPassword: vi.fn(), logout: vi.fn() } }));
import { authApi } from '../authApi';
import ForcedPasswordChangePage from './ForcedPasswordChangePage';

let container;
let root;
let actions;

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  actions = [];
  const state = { auth: { user: { id: 'alice', mustChangePassword: true } }, user: { preferences: { uiLocale: 'en' } } };
  const store = configureStore({
    reducer: (s = state, action) => {
      actions.push(action);
      return s;
    },
  });
  await act(async () => root.render(<Provider store={store}><ForcedPasswordChangePage /></Provider>));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const el = (testId) => document.querySelector(`[data-testid="${testId}"]`);
function setValue(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const fill = async (next, confirm = next) =>
  act(async () => {
    setValue(el('forced-password-new-input'), next);
    setValue(el('forced-password-confirm-input'), confirm);
  });

it('cannot be closed and waits for a valid new password', async () => {
  expect(document.querySelector('[data-testid="forced-password-change-modal-close"]')).toBeNull();
  expect(el('forced-password-submit-btn').disabled).toBe(true);

  await fill('weak');
  expect(el('forced-password-submit-btn').disabled).toBe(true);
  await fill('Mine5678', 'Mine5679');
  expect(el('forced-password-submit-btn').disabled).toBe(true);
  await fill('Mine5678');
  expect(el('forced-password-submit-btn').disabled).toBe(false);
});

it('does not ask for the temporary password again', async () => {
  expect(el('forced-password-current-input')).toBeNull();
  expect(document.body.textContent).not.toContain('Temporary password');
});

it('sets the password and lets the dashboard through', async () => {
  authApi.setInitialPassword.mockResolvedValue(undefined);
  await fill('Mine5678');
  await act(async () => el('forced-password-submit-btn').click());

  expect(authApi.setInitialPassword).toHaveBeenCalledWith('Mine5678');
  expect(actions.map((a) => a.type)).toContain('auth/passwordChangeCompleted');
});

it("shows the server's reason, e.g. reusing the temporary password", async () => {
  authApi.setInitialPassword.mockRejectedValue({ response: { data: { message: 'Choose a password different from the temporary one.' } } });
  await fill('Temp1234');
  await act(async () => el('forced-password-submit-btn').click());

  expect(document.body.textContent).toContain('Choose a password different from the temporary one.');
  expect(actions.map((a) => a.type)).not.toContain('auth/passwordChangeCompleted');
});
