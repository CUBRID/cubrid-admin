import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// authSlice/layoutSlice read localStorage at import time. Under Node 25 the
// global localStorage shadows jsdom's and has no methods unless
// --localstorage-file is set, so install a working in-memory one first.
vi.hoisted(() => {
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
  });
  // jsdom has no matchMedia; the theme default reads prefers-color-scheme.
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
});
vi.mock('../authApi', () => ({ authApi: {} }));

import { version as rootVersion } from '../../../../../../package.json';
import LoginPage from './LoginPage';

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it('shows the product version from the root package.json in the footer', async () => {
  const state = { auth: { loading: false }, layout: { theme: 'light' }, user: { preferences: { uiLocale: 'en' } } };
  await act(async () => {
    root.render(
      <Provider store={configureStore({ reducer: () => state })}>
        <MemoryRouter initialEntries={['/login']}>
          <LoginPage />
        </MemoryRouter>
      </Provider>
    );
  });

  expect(container.querySelector('[data-testid="login-app-version"]').textContent).toBe(`v${rootVersion}`);
  expect(container.textContent).not.toContain('12.4.0');
});
