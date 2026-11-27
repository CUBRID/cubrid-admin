import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../authSlice', () => ({ checkSession: () => ({ type: 'test/checkSession' }), fetchUser: () => ({ type: 'test/fetchUser' }) }));
vi.mock('../../user/userSlice', () => ({ fetchPreferences: () => ({ type: 'test/fetchPreferences' }) }));
vi.mock('./ForcedPasswordChangePage', () => ({ default: () => <div data-testid="forced" /> }));
vi.mock('../../../components/common/LoadingOverlay', () => ({ default: () => <div data-testid="loading" /> }));
import { ProtectedRoute } from './AuthRoutes';

let container;
let root;
let actions;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  actions = [];
  delete window.desktopConfig;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = async (auth) => {
  const state = { auth: { isAuthenticated: true, user: null, userFetchSettled: false, ...auth } };
  const store = configureStore({
    reducer: (s = state, action) => {
      actions.push(action.type);
      return s;
    },
  });
  await act(async () =>
    root.render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/home']}>
          <Routes>
            <Route path="/login" element={<div data-testid="login" />} />
            <Route path="/*" element={<ProtectedRoute><div data-testid="dashboard" /></ProtectedRoute>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    )
  );
};
const shown = (id) => container.querySelector(`[data-testid="${id}"]`) !== null;

// The login page stores only the typed id: the account must still be read,
// or an admin gets no User Accounts button and a pending password change
// is skipped.
it('reads the account right after login, though the id is already known', async () => {
  await render({ user: { id: 'admin' } });
  expect(actions).toContain('test/fetchUser');
  expect(actions).toContain('test/fetchPreferences');
  expect(shown('loading')).toBe(true);
  expect(shown('dashboard')).toBe(false);
});

it('reads the account after a reload, when nothing is known yet', async () => {
  await render({ user: null });
  expect(actions).toContain('test/fetchUser');
  expect(shown('loading')).toBe(true);
});

it('shows the dashboard once the account was read, also when the read failed', async () => {
  await render({ user: { id: 'admin', isAdmin: true }, userFetchSettled: true });
  expect(shown('dashboard')).toBe(true);
  expect(actions).not.toContain('test/fetchUser');

  await act(async () => root.unmount());
  root = createRoot(container);
  await render({ user: { id: 'admin' }, userFetchSettled: true });
  expect(shown('dashboard')).toBe(true);
});

it('shows the password change instead of the dashboard while one is pending', async () => {
  await render({ user: { id: 'alice', mustChangePassword: true }, userFetchSettled: true });
  expect(shown('forced')).toBe(true);
  expect(shown('dashboard')).toBe(false);
});

it('sends a signed-out visitor to the login page', async () => {
  await render({ isAuthenticated: false });
  expect(shown('login')).toBe(true);
  expect(actions).not.toContain('test/fetchUser');
});

it('reads nothing in the desktop app, which has no app account', async () => {
  window.desktopConfig = { isDesktop: true };
  await render({ user: null });
  expect(shown('dashboard')).toBe(true);
  expect(actions).not.toContain('test/fetchUser');
  delete window.desktopConfig;
});
