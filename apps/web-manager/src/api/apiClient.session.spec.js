import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// One /auth/refresh stand-in shared by every copy of the module, as the one
// server is shared by every tab, and one cookie jar, as the browser's is.
// The refresh token rotates: each one works once, and a reused one revokes
// the session (as the server does). The page never sees the jar.
const server = vi.hoisted(() => ({
  post: null, issued: 0, used: new Set(), revoked: false, calls: [], bodies: [], lifetime: 0,
  jar: { access: 0, refresh: null },
}));
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal();
  const axios = actual.default;
  axios.post = (...args) => server.post(...args);
  return { ...actual, default: axios };
});
// Each tab's store runs the real auth reducer.
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
const KEY = 'cwm-session-expires-at';

/** The browser holds a session whose access cookie ends `ms` from now. */
const signedIn = (ms, lifetimeSec = DAY / 1000, user) => {
  server.jar = { access: Date.now() + ms, refresh: 'r1' };
  server.lifetime = lifetimeSec;
  localStorage.setItem(KEY, JSON.stringify({ expiresAt: Date.now() + ms, expiresIn: lifetimeSec, ...(user ? { user } : {}) }));
};

/** What another tab's write of the shared session looks like here. */
const otherTabWrites = (value) => {
  if (value === null) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(value));
  window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: value === null ? null : JSON.stringify(value) }));
};

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
  // App API calls answer 401 once the access cookie has expired.
  mod.default.defaults.adapter = (config) => {
    if (!config.withCredentials || config.headers?.['X-CWM-Request'] !== '1' || !(server.jar.access > Date.now())) {
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
  server.bodies = [];
  server.jar = { access: 0, refresh: null };
  server.lifetime = DAY / 1000;
  server.post = vi.fn(async (_url, body, config) => {
    const refreshToken = server.jar.refresh;
    server.calls.push(refreshToken);
    server.bodies.push({ body, config });
    if (!refreshToken || server.used.has(refreshToken) || server.revoked) {
      server.revoked = true;
      throw Object.assign(new Error('reused'), { response: { status: 401 } });
    }
    server.used.add(refreshToken);
    server.issued += 1;
    server.jar = { access: Date.now() + server.lifetime * 1000, refresh: `r${server.issued + 1}` };
    return { data: { data: { expiresIn: server.lifetime } } };
  });
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

it('removes the tokens older builds kept in localStorage', async () => {
  localStorage.setItem('token', 'old-access');
  localStorage.setItem('refreshToken', 'old-refresh');
  localStorage.setItem('cwm-ui-locale', 'ko');
  await openTab();
  expect(localStorage.getItem('token')).toBeNull();
  expect(localStorage.getItem('refreshToken')).toBeNull();
  expect(localStorage.getItem('cwm-ui-locale')).toBe('ko');
});

it('sends the refresh with the cookies and the request header, and no token in the body', async () => {
  signedIn(-HOUR);
  const { refreshSession } = await openTab();
  await refreshSession();
  expect(server.bodies[0].body).toEqual({});
  expect(server.bodies[0].config).toEqual(expect.objectContaining({ withCredentials: true }));
  expect(server.bodies[0].config.headers['X-CWM-Request']).toBe('1');
  expect(JSON.parse(localStorage.getItem(KEY)).expiresAt).toBe(Date.now() + DAY);
});

it('refreshes 5 minutes before the access token expires', async () => {
  signedIn(10 * 60 * 1000);
  await openTab();

  await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
  expect(server.post).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(60 * 1000 + 10);
  expect(server.calls).toEqual(['r1']);
  expect(server.jar.refresh).toBe('r2');
});

it('refreshes an expired token when the window becomes visible again (after a sleep)', async () => {
  signedIn(HOUR);
  await openTab();
  // Asleep: no timer ran, and the token ran out meanwhile.
  vi.setSystemTime(Date.now() + 2 * HOUR);
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(server.calls).toEqual(['r1']);
});

it('refreshes an expired session before the first request when the app opens', async () => {
  signedIn(-HOUR);
  const { default: apiClient } = await openTab();
  // apiClient hands back the body.
  const answer = await apiClient.get('/hosts');
  expect(answer).toEqual({ ok: true });
  expect(server.calls).toEqual(['r1']);
});

it('two tabs refreshing at once call the server once and do not reuse a refresh token', async () => {
  signedIn(-HOUR);
  const tabA = await openTab();
  const tabB = await openTab();

  // Both tabs poll with the expired cookie at the same moment.
  const [a, b] = await Promise.all([tabA.default.get('/a'), tabB.default.get('/b')]);
  expect(a).toEqual({ ok: true });
  expect(b).toEqual({ ok: true });
  expect(server.calls).toEqual(['r1']);
  expect(server.revoked).toBe(false);
});

it("takes another tab's refresh from the stored expiry and refreshes again only when that one runs out", async () => {
  signedIn(HOUR);
  const tabA = await openTab();
  await openTab(); // tab B

  // A refreshes: r1 is spent, r2 is in the jar.
  await tabA.refreshSession();
  // B hears of it through storage.
  window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: localStorage.getItem(KEY) }));
  await vi.advanceTimersByTimeAsync(0);

  // The next refresh (a day later) is one call with r2, not r1 again.
  await vi.advanceTimersByTimeAsync(DAY);
  expect(server.calls).toEqual(['r1', 'r2']);
  expect(server.revoked).toBe(false);
});

it('keeps polling for more than a day', async () => {
  signedIn(DAY);
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
    signedIn(6 * 60 * 1000);
    const { default: apiClient } = await openTab();
    let sent;
    apiClient.defaults.adapter = (config) => { sent = config; return Promise.resolve({ data: { ok: true }, status: 200, headers: {}, config }); };
    await apiClient.post('/host', {});
    expect(sent.withCredentials).toBeFalsy();
    expect(sent.headers['X-CWM-Request']).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(server.post).not.toHaveBeenCalled();
  } finally {
    delete window.desktopConfig;
  }
});

it('refreshes a short-lived token at half its life, not again and again', async () => {
  signedIn(120 * 1000, 120);
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

it('changes the session key on login and logout, not on a refresh', async () => {
  signedIn(-HOUR);
  const tab = await openTab();
  const first = tab.appSessionKey();
  await tab.refreshSession();
  expect(tab.appSessionKey()).toBe(first);
  tab.setAppSession(null);
  expect(tab.appSessionKey()).not.toBe(first);
});

it('loads the page again when another tab logs in as another account', async () => {
  signedIn(HOUR, DAY / 1000, 'alice');
  const tab = await openTab();
  const reload = vi.spyOn(tab.pageActions, 'reload').mockImplementation(() => {});
  otherTabWrites({ expiresAt: Date.now() + DAY, expiresIn: DAY / 1000, user: 'bob' });
  await vi.advanceTimersByTimeAsync(0);
  expect(reload).toHaveBeenCalledTimes(1);
});

it("takes the same account's login or refresh from another tab without loading again", async () => {
  signedIn(HOUR, DAY / 1000, 'alice');
  const tab = await openTab();
  const reload = vi.spyOn(tab.pageActions, 'reload').mockImplementation(() => {});
  otherTabWrites({ expiresAt: Date.now() + DAY, expiresIn: DAY / 1000, user: 'alice' });
  // A session kept by an older build has no user: taken as before.
  otherTabWrites({ expiresAt: Date.now() + 2 * DAY, expiresIn: DAY / 1000 });
  await vi.advanceTimersByTimeAsync(0);
  expect(reload).not.toHaveBeenCalled();
});

it('goes to the login screen at once when another tab logs out', async () => {
  signedIn(HOUR, DAY / 1000, 'alice');
  const tab = await openTab();
  const { store } = await import('../app/store');
  expect(store.getState().auth.isAuthenticated).toBe(true);
  const reload = vi.spyOn(tab.pageActions, 'reload').mockImplementation(() => {});
  otherTabWrites(null);
  await vi.advanceTimersByTimeAsync(0);
  expect(store.getState().auth.isAuthenticated).toBe(false);
  expect(reload).not.toHaveBeenCalled();
});

it('keeps the account in the shared session across a refresh, and a login stores it', async () => {
  signedIn(-HOUR, DAY / 1000, 'alice');
  const { refreshSession } = await openTab();
  await refreshSession();
  expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ expiresAt: Date.now() + DAY, expiresIn: DAY / 1000, user: 'alice' });

  const { store } = await import('../app/store');
  const { loginSuccess } = await import('../features/auth/authSlice');
  store.dispatch(loginSuccess({ expiresIn: 3600, user: { id: 'bob' } }));
  expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ expiresAt: Date.now() + 3600 * 1000, expiresIn: 3600, user: 'bob' });
});
