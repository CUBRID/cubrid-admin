import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserInfo = vi.hoisted(() => vi.fn());
vi.mock('../authApi', () => ({ authApi: { getUserInfo: (...args) => getUserInfo(...args) } }));

const KEY = 'cwm-session-expires-at';
const LOGIN_PAGE = 'login page';
const DASHBOARD = 'dashboard';
let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  getUserInfo.mockReset();
  localStorage.removeItem(KEY);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  delete window.desktopConfig;
  localStorage.removeItem(KEY);
  vi.resetModules();
});

// A fresh authSlice (it reads the stored session and the desktop flag as it loads).
const freshAuth = async () => {
  vi.resetModules();
  const slice = await import('../authSlice');
  const routes = await import('./AuthRoutes');
  const store = configureStore({ reducer: { auth: slice.default } });
  return { slice, routes, store };
};

const render = async (store, routes, path) => {
  const { SessionGate, LoginRoute, ProtectedRoute } = routes;
  await act(async () => root.render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <SessionGate>
          <Routes>
            <Route path="/login" element={<LoginRoute><p>{LOGIN_PAGE}</p></LoginRoute>} />
            <Route path="/home" element={<ProtectedRoute><p>{DASHBOARD}</p></ProtectedRoute>} />
          </Routes>
        </SessionGate>
      </MemoryRouter>
    </Provider>,
  ));
  await act(async () => { await Promise.resolve(); });
};

describe('checkSession: the cookies decide, not the session kept in localStorage', () => {
  it('signs in a browser the server knows, even with no session kept at this address', async () => {
    getUserInfo.mockResolvedValue({ id: 'alice' });
    const { slice, store } = await freshAuth();
    expect(store.getState().auth).toEqual(expect.objectContaining({ isAuthenticated: false, sessionChecked: false }));
    await store.dispatch(slice.checkSession());
    expect(store.getState().auth).toEqual(expect.objectContaining({ isAuthenticated: true, sessionChecked: true, user: { id: 'alice' } }));
  });

  it('signs out on a 401, also with a session kept from an earlier visit', async () => {
    localStorage.setItem(KEY, JSON.stringify({ expiresAt: Date.now() + 60_000, expiresIn: 86400 }));
    getUserInfo.mockRejectedValue({ response: { status: 401 } });
    const { slice, store } = await freshAuth();
    expect(store.getState().auth.isAuthenticated).toBe(true);
    await store.dispatch(slice.checkSession());
    expect(store.getState().auth).toEqual(expect.objectContaining({ isAuthenticated: false, sessionChecked: true, user: null }));
  });

  it('keeps what the kept session says when the server does not answer', async () => {
    localStorage.setItem(KEY, JSON.stringify({ expiresAt: Date.now() + 60_000, expiresIn: 86400 }));
    getUserInfo.mockRejectedValue(new Error('Network Error'));
    const { slice, store } = await freshAuth();
    await store.dispatch(slice.checkSession());
    expect(store.getState().auth).toEqual(expect.objectContaining({ isAuthenticated: true, sessionChecked: true }));
  });

  it('stays checked after a logout (the root reducer resets every slice)', async () => {
    const { slice } = await freshAuth();
    const afterReset = slice.default(undefined, slice.logout());
    expect(afterReset).toEqual(expect.objectContaining({ isAuthenticated: false, sessionChecked: true }));
  });

  it('needs no check in the desktop app, which has no app login', async () => {
    window.desktopConfig = { isDesktop: true };
    const { store, routes } = await freshAuth();
    expect(store.getState().auth).toEqual(expect.objectContaining({ isAuthenticated: true, sessionChecked: true }));
    await render(store, routes, '/home');
    expect(getUserInfo).not.toHaveBeenCalled();
    expect(container.textContent).toBe('dashboard');
  });
});

describe('routes', () => {
  it('opens the dashboard from /login at a second address of the host, where the cookies sign in', async () => {
    // Nothing kept at this address (another port, a proxy): the login page used to show.
    getUserInfo.mockResolvedValue({ id: 'alice' });
    const { store, routes } = await freshAuth();
    await render(store, routes, '/login');
    expect(getUserInfo).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('dashboard');
  });

  it('opens the dashboard from /login after another tab signed in and this one reloads', async () => {
    localStorage.setItem(KEY, JSON.stringify({ expiresAt: Date.now() + 60_000, expiresIn: 86400 }));
    getUserInfo.mockResolvedValue({ id: 'alice' });
    const { store, routes } = await freshAuth();
    await render(store, routes, '/login');
    expect(container.textContent).toBe('dashboard');
  });

  it('shows nothing until the server answers, then the login page for a browser it does not know', async () => {
    let answer;
    getUserInfo.mockReturnValue(new Promise((_, reject) => { answer = reject; }));
    const { store, routes } = await freshAuth();
    await render(store, routes, '/home');
    expect(container.textContent).toBe('');
    await act(async () => { answer({ response: { status: 401 } }); });
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toBe('login page');
  });
});
