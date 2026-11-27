import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// layoutSlice (LoginPage's theme toggle) reads the OS theme at import time.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
vi.mock('../authApi', () => ({ authApi: { getRegistration: vi.fn(), login: vi.fn(), register: vi.fn() } }));
vi.mock('../../layout/components/LanguageToggle', () => ({ default: () => null }));
import { authApi } from '../authApi';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';

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

const render = async (Page) => {
  const state = { auth: { loading: false }, layout: { theme: 'dark' }, user: { preferences: { uiLocale: 'en' } } };
  const store = configureStore({ reducer: () => state });
  await act(async () =>
    root.render(
      <Provider store={store}>
        <MemoryRouter>
          <Page />
        </MemoryRouter>
      </Provider>
    )
  );
};

const createLink = () => container.querySelector('a[href="/register"]');

it('hides the Create Account link while sign-up is closed', async () => {
  authApi.getRegistration.mockResolvedValue({ enabled: false });
  await render(LoginPage);
  expect(createLink()).toBeNull();
});

it('shows the link while sign-up is open, and when the check fails', async () => {
  authApi.getRegistration.mockResolvedValue({ enabled: true });
  await render(LoginPage);
  expect(createLink()).not.toBeNull();

  await act(async () => root.unmount());
  root = createRoot(container);
  authApi.getRegistration.mockRejectedValue(new Error('offline'));
  await render(LoginPage);
  expect(createLink()).not.toBeNull();
});

it('replaces the sign-up form with an explanation while closed', async () => {
  authApi.getRegistration.mockResolvedValue({ enabled: false });
  await render(RegisterPage);
  expect(container.querySelector('[data-testid="register-closed"]').textContent).toContain('Sign-up is closed');
  expect(container.querySelector('[data-testid="register-submit-btn"]')).toBeNull();
});

it('shows the sign-up form while open', async () => {
  authApi.getRegistration.mockResolvedValue({ enabled: true });
  await render(RegisterPage);
  expect(container.querySelector('[data-testid="register-closed"]')).toBeNull();
  expect(container.querySelector('[data-testid="register-submit-btn"]')).not.toBeNull();
});
