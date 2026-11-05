import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// One /auth/refresh stand-in shared by every copy of the module, as the one
// server is shared by every tab. It rotates: each refresh token works once,
// and a reused one revokes the session (as the server does).
const server = vi.hoisted(() => ({ post: null, issued: 0, used: new Set(), revoked: false, calls: [] }));
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal();
  const axios = actual.default;
  axios.post = (...args) => server.post(...args);
  return { ...actual, default: axios };
});
// Each tab's store runs the real auth reducer, which is where tokens could
// be written back to storage.
vi.mock('../app/store', async () => {
  const { default: auth } = await import('../features/auth/authSlice');
  let state = auth(undefined, { type: '@@init' });
  return {
    store: {
      dispatch: (action) => { if (action && typeof action === 'object') state = auth(state, action); return action; },
      getState: () => ({ auth: state }),
    },
  };
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
/** An access JWT (unsigned; only `exp` is read) expiring `ms` from now. */
const jwt = (ms, id = Math.random()) => `${b64({ alg: 'none' })}.${b64({ exp: Math.floor((Date.now() + ms) / 1000), id })}.x`;
const expired = (token) => JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000 <= Date.now();

// A Web Locks stand-in that runs one holder at a time, shared by the "tabs".
const locks = { queue: Promise.resolve() };
const webLocks = {
  request: (_name, run) => {
    const result = locks.queue.then(() => run());
    locks.queue = result.catch(() => undefined);
    return result;
  },
};

/** A fresh copy of apiClient, like another tab of the same browser. */
const openTab = async () => {
  vi.resetModules();
  const mod = await import('./apiClient');
  // App API calls answer 401 once the access token has expired.
  mod.default.defaults.adapter = (config) => {
    const token = String(config.headers.Authorization || '').replace('Bearer ', '');
    if (!token || expired(token)) {
      return Promise.reject(Object.assign(new Error('401'), {
        config,
        response: { status: 401, data: { type: '/errors/auth/invalid_token' }, headers: {}, config },
      }));
    }
    return Promise.resolve({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config });
  };
  return mod;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-05T09:00:00Z'));
  Object.defineProperty(navigator, 'locks', { value: webLocks, configurable: true });
  locks.queue = Promise.resolve(); // each test is a fresh browser
  server.issued = 0;
  server.used = new Set();
  server.revoked = false;
  server.calls = [];
  server.post = vi.fn(async (_url, { refreshToken }) => {
    server.calls.push(refreshToken);
    if (server.used.has(refreshToken)) {
      server.revoked = true;
      throw Object.assign(new Error('reused'), { response: { status: 401 } });
    }
    server.used.add(refreshToken);
    server.issued += 1;
    return { data: { data: { token: jwt(DAY), refreshToken: `r${server.issued + 1}` } } };
  });
  localStorage.clear();
  localStorage.setItem('refreshToken', 'r1');
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

it('refreshes 5 minutes before the access token expires', async () => {
  localStorage.setItem('token', jwt(10 * 60 * 1000));
  await openTab();

  await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
  expect(server.post).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(60 * 1000 + 10);
  expect(server.calls).toEqual(['r1']);
  expect(localStorage.getItem('refreshToken')).toBe('r2');
});

it('refreshes an expired token when the window becomes visible again (after a sleep)', async () => {
  localStorage.setItem('token', jwt(HOUR));
  await openTab();
  // Asleep: no timer ran, and the token ran out meanwhile.
  vi.setSystemTime(Date.now() + 2 * HOUR);
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(server.calls).toEqual(['r1']);
});

it('refreshes an expired session before the first request when the app opens', async () => {
  localStorage.setItem('token', jwt(-HOUR));
  const { default: apiClient } = await openTab();
  // apiClient hands back the body.
  const answer = await apiClient.get('/hosts');
  expect(answer).toEqual({ ok: true });
  expect(server.calls).toEqual(['r1']);
});

it('two tabs refreshing at once call the server once and do not reuse a refresh token', async () => {
  localStorage.setItem('token', jwt(-HOUR));
  const tabA = await openTab();
  const tabB = await openTab();

  // Both tabs poll with the expired token at the same moment.
  const [a, b] = await Promise.all([tabA.default.get('/a'), tabB.default.get('/b')]);
  expect(a).toEqual({ ok: true });
  expect(b).toEqual({ ok: true });
  expect(server.calls).toEqual(['r1']);
  expect(server.revoked).toBe(false);
  // B uses the token A stored.
  expect(tabB.default.defaults.headers.common.Authorization).toBe(tabA.default.defaults.headers.common.Authorization);
});

it("keeps the newer refresh token when another tab's token arrives before its refresh token", async () => {
  localStorage.setItem('token', jwt(HOUR));
  const tabA = await openTab();
  await openTab(); // tab B

  // A refreshes: r1 is spent, r2 stored.
  await tabA.refreshSession();
  expect(localStorage.getItem('refreshToken')).toBe('r2');
  const t2 = localStorage.getItem('token');

  // In B's process the new access token arrives first: when its storage
  // event runs, B still sees r1; r2 reaches B just after.
  localStorage.setItem('refreshToken', 'r1');
  window.dispatchEvent(new StorageEvent('storage', { key: 'token', newValue: t2 }));
  localStorage.setItem('refreshToken', 'r2');
  await vi.advanceTimersByTimeAsync(0);
  expect(localStorage.getItem('refreshToken')).toBe('r2');

  // The next refresh uses r2, not the spent r1.
  await vi.advanceTimersByTimeAsync(DAY);
  expect(server.calls).toEqual(['r1', 'r2']);
  expect(server.revoked).toBe(false);
});

it('keeps polling for more than a day', async () => {
  localStorage.setItem('token', jwt(DAY));
  const { default: apiClient } = await openTab();
  let ok = 0;
  let failed = 0;
  const poll = setInterval(() => { apiClient.get('/start-info').then(() => { ok += 1; }, () => { failed += 1; }); }, 60_000);

  await vi.advanceTimersByTimeAsync(30 * HOUR);
  clearInterval(poll);
  expect(failed).toBe(0);
  expect(ok).toBe(30 * 60);
  expect(server.revoked).toBe(false);
  expect(server.calls.length).toBe(1);
});

it('stays off in the desktop app, which has no app login', async () => {
  window.desktopConfig = { apiBaseUrl: 'app://api' };
  try {
    localStorage.setItem('token', jwt(6 * 60 * 1000));
    await openTab();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(server.post).not.toHaveBeenCalled();
  } finally {
    delete window.desktopConfig;
  }
});

it('refreshes a short-lived token at half its life, not again and again', async () => {
  const now = Math.floor(Date.now() / 1000);
  const shortToken = () => `${b64({ alg: 'none' })}.${b64({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 120, n: Math.random() })}.x`;
  server.post = vi.fn(async (_url, { refreshToken }) => {
    server.calls.push(refreshToken);
    return { data: { data: { token: shortToken(), refreshToken: `${refreshToken}+` } } };
  });
  localStorage.setItem('token', `${b64({ alg: 'none' })}.${b64({ iat: now, exp: now + 120 })}.x`);
  await openTab();

  await vi.advanceTimersByTimeAsync(59_000);
  expect(server.calls.length).toBe(0);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(server.calls.length).toBe(1);
  // Ten minutes of 2-minute tokens: one refresh a minute.
  await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
  expect(server.calls.length).toBeGreaterThanOrEqual(10);
  expect(server.calls.length).toBeLessThanOrEqual(12);
});
