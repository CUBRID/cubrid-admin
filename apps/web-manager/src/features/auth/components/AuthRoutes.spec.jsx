import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.hoisted(() => vi.fn());
vi.mock('../authApi', () => ({ authApi: { getSession: (...args) => getSession(...args) } }));

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
  getSession.mockReset();
  vi.useRealTimers();
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

// What GET /auth/session answers for a session signed in an hour ago.
const ALICE = { expiresIn: 86400, expiresLeft: 86400 - 3600, user: 'alice' };
const stored = () => JSON.parse(localStorage.getItem(KEY));

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
  it('signs in a browser the server knows, even with no session kept at this address, and keeps that session', async () => {
    getSession.mockResolvedValue(ALICE);
    const { slice, store } = await freshAuth();
    expect(store.getState().auth).toEqual(expect.objectContaining({ isAuthenticated: false, sessionChecked: false }));
    const before = Date.now();
    await store.dispatch(slice.checkSession());
    expect(store.getState().auth).toEqual(expect.objectContaining({ isAuthenticated: true, sessionChecked: true }));
    // The expiry and the account: the refresh before expiry, the other tabs'
    // logout and another account's login follow from them.
    expect(stored()).toEqual({ expiresAt: expect.any(Number), expiresIn: 86400, user: 'alice' });
    expect(stored().expiresAt - before).toBeGreaterThanOrEqual((86400 - 3600) * 1000);
    expect(stored().expiresAt - Date.now()).toBeLessThanOrEqual((86400 - 3600) * 1000);
  });

  it("takes the server's account over another account's session kept from an earlier visit", async () => {
    localStorage.setItem(KEY, JSON.stringify({ expiresAt: Date.now() + 60_000, expiresIn: 86400, user: 'bob' }));
    getSession.mockResolvedValue(ALICE);
    const { slice, store } = await freshAuth();
    await store.dispatch(slice.checkSession());
    expect(stored()).toEqual(expect.objectContaining({ expiresIn: 86400, user: 'alice' }));
  });

  it('asks once, with the session check marked and a way to stop it', async () => {
    getSession.mockResolvedValue(ALICE);
    const { slice, store } = await freshAuth();
    await store.dispatch(slice.checkSession());
    expect(getSession).toHaveBeenCalledWith(expect.objectContaining({ __sessionCheck: true, signal: expect.any(AbortSignal) }));
  });

  it('signs out on a 401, also with a session kept from an earlier visit, and drops that session', async () => {
    localStorage.setItem(KEY, JSON.stringify({ expiresAt: Date.now() + 60_000, expiresIn: 86400 }));
    getSession.mockRejectedValue({ response: { status: 401 } });
    const { slice, store } = await freshAuth();
    expect(store.getState().auth.isAuthenticated).toBe(true);
    await store.dispatch(slice.checkSession());
    expect(store.getState().auth).toEqual(expect.objectContaining({ isAuthenticated: false, sessionChecked: true, user: null }));
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it.each([
    ['the server does not answer', new Error('Network Error')],
    ['the refresh failed on a busy server (503)', { response: { status: 503 } }],
  ])('keeps what the kept session says when %s', async (_case, failure) => {
    localStorage.setItem(KEY, JSON.stringify({ expiresAt: Date.now() + 60_000, expiresIn: 86400 }));
    getSession.mockRejectedValue(failure);
    const { slice, store } = await freshAuth();
    await store.dispatch(slice.checkSession());
    expect(store.getState().auth).toEqual(expect.objectContaining({ isAuthenticated: true, sessionChecked: true }));
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it('stops waiting after SESSION_CHECK_TIMEOUT_MS and keeps what the kept session says', async () => {
    vi.useFakeTimers();
    localStorage.setItem(KEY, JSON.stringify({ expiresAt: Date.now() + 60_000, expiresIn: 86400 }));
    let signal;
    getSession.mockImplementation((config) => { signal = config.signal; return new Promise(() => {}); });
    const { slice, store } = await freshAuth();
    const done = store.dispatch(slice.checkSession());
    await vi.advanceTimersByTimeAsync(slice.SESSION_CHECK_TIMEOUT_MS - 100);
    expect(store.getState().auth.sessionChecked).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    await done;
    expect(store.getState().auth).toEqual(expect.objectContaining({ isAuthenticated: true, sessionChecked: true }));
    expect(signal.aborted).toBe(true);
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
    expect(getSession).not.toHaveBeenCalled();
    expect(container.textContent).toBe('dashboard');
  });
});

describe('routes', () => {
  it('opens the dashboard from /login at another port of the same host name, where the cookies sign in', async () => {
    // Nothing kept at this address (another port, a proxy): the login page used to show.
    getSession.mockResolvedValue(ALICE);
    const { store, routes } = await freshAuth();
    await render(store, routes, '/login');
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('dashboard');
  });

  it('opens the dashboard from /login after another tab signed in and this one reloads', async () => {
    localStorage.setItem(KEY, JSON.stringify({ expiresAt: Date.now() + 60_000, expiresIn: 86400 }));
    getSession.mockResolvedValue(ALICE);
    const { store, routes } = await freshAuth();
    await render(store, routes, '/login');
    expect(container.textContent).toBe('dashboard');
  });

  it('shows a spinner until the server answers, then the login page for a browser it does not know', async () => {
    let answer;
    getSession.mockReturnValue(new Promise((_, reject) => { answer = reject; }));
    const { store, routes } = await freshAuth();
    await render(store, routes, '/home');
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.textContent).not.toContain(LOGIN_PAGE);
    expect(container.textContent).not.toContain(DASHBOARD);
    await act(async () => { answer({ response: { status: 401 } }); });
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toBe('login page');
  });
});
