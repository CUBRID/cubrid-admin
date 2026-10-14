import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

vi.mock('../../auth/authApi', () => ({ authApi: { updatePassword: vi.fn() } }));
import { authApi } from '../../auth/authApi';
import UserProfileModal from './UserProfileModal';

let container;
let root;
let store;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const state = {
    auth: { user: { id: 'test' }, loading: false, error: null },
    user: { preferences: { uiLocale: 'en' } },
  };
  store = configureStore({ reducer: () => state });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = async () => act(async () => {
  root.render(
    <StrictMode>
      <Provider store={store}>
        <UserProfileModal isOpen onClose={() => {}} />
      </Provider>
    </StrictMode>
  );
});

const el = (testId) => container.querySelector(`[data-testid="${testId}"]`);

async function openChangePasswordMode() {
  await render();
  const changePasswordBtn = Array.from(container.querySelectorAll('button'))
    .find((b) => b.textContent.includes('Change Password'));
  await act(async () => changePasswordBtn.click());
}

function setValue(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

it('keeps the submit button disabled until old/new/confirm are all filled and the new password meets policy', async () => {
  await openChangePasswordMode();
  const submitBtn = el('change-password-submit-btn');
  const confirmInput = container.querySelectorAll('input[type="password"]')[2];
  expect(submitBtn.disabled).toBe(true);

  await act(async () => {
    setValue(el('change-password-old-input'), 'CurrentPass1');
    setValue(el('change-password-new-input'), 'onlyletters');
    setValue(confirmInput, 'onlyletters');
  });
  // Weak new password (no digit) — must stay disabled even with all fields filled.
  expect(submitBtn.disabled).toBe(true);

  await act(async () => {
    setValue(el('change-password-new-input'), 'valid1234');
  });
  // Confirm field still holds the old (mismatched) value.
  expect(submitBtn.disabled).toBe(true);
});

it('enables the submit button once old/new/confirm are consistent and the policy is met, and calls authApi with the new password', async () => {
  await openChangePasswordMode();
  const submitBtn = el('change-password-submit-btn');
  const oldInput = el('change-password-old-input');
  const newInput = el('change-password-new-input');
  const confirmInput = container.querySelectorAll('input[type="password"]')[2];

  await act(async () => {
    setValue(oldInput, 'CurrentPass1');
    setValue(newInput, 'valid1234');
    setValue(confirmInput, 'valid1234');
  });

  expect(submitBtn.disabled).toBe(false);

  authApi.updatePassword.mockResolvedValue({});
  await act(async () => submitBtn.click());
  expect(authApi.updatePassword).toHaveBeenCalledWith('CurrentPass1', 'valid1234');
});

it('shows the current-password-incorrect message for the real nested server error shape', async () => {
  await openChangePasswordMode();
  const submitBtn = el('change-password-submit-btn');

  await act(async () => {
    setValue(el('change-password-old-input'), 'WrongOldPass1');
    setValue(el('change-password-new-input'), 'valid1234');
    setValue(container.querySelectorAll('input[type="password"]')[2], 'valid1234');
  });

  // The global exception filter nests Problem Details under `data`
  // (StandardResponse = { data, status, note }) — apiClient's response
  // interceptor only promotes a message onto err.response.data, never the
  // code, so the real failure shape has `code` one level deeper than a
  // flat err.response.data.code read would expect.
  authApi.updatePassword.mockRejectedValue({
    response: { data: { data: { code: 'OLD_PASSWORD_MISMATCH' }, status: 400, note: 'Old password is incorrect' } },
  });

  await act(async () => submitBtn.click());

  expect(container.textContent).toContain('The current password is incorrect.');
  expect(container.textContent).not.toContain('An unexpected error occurred');
});

it('shows a live pass/fail hint that flips from red to green as the new password starts meeting the policy', async () => {
  await openChangePasswordMode();
  const newInput = el('change-password-new-input');

  await act(async () => setValue(newInput, 'short'));
  expect(container.textContent).toMatch(/8|letter|digit|policy/i);

  await act(async () => setValue(newInput, 'valid1234'));
  expect(container.querySelector('.text-emerald-500')).toBeTruthy();
});
