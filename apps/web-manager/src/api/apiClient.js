import axios from 'axios';
import { nextSeq } from '../infrastructure/utils/singleFlight';
import { isDesktopApp } from '../features/desktop/isDesktopApp';
import { getCM, getStoredLocale } from '../constants/useCM';
import { serverErrorText } from '../infrastructure/errors/serverErrorText';

export const hostActions = {
  revokeHostLogin: (hostUid) => ({ type: 'host/revokeHostLogin', payload: hostUid }),
  openReconnectModal: (hostUid) => ({ type: 'host/openReconnectModal', payload: hostUid }),
  // The host's CMS could not be reached (stopped, its port changed, the host
  // down): the same reconnect window, saying so.
  hostUnreachable: (hostUid) => ({ type: 'host/hostUnreachable', payload: hostUid }),
  // Its CMS did not answer a request / answered one again (status dot).
  hostNotResponding: (hostUid) => ({ type: 'host/hostNotResponding', payload: hostUid }),
  hostResponding: (hostUid) => ({ type: 'host/hostResponding', payload: hostUid }),
  loginToHost: null,
  clearReconnectingHost: null,
};

// Plain action-type objects (not imported slice creators) to avoid a
// circular import — most feature slices import this module, so this module
// can't import back from databaseCoreSlice. Must stay in sync with that
// slice's name ('databaseCore') and action name (clearDatabaseLogin), and
// with its prepare callback: the reducer reads meta.seq, so an action
// without meta throws inside the reducer and the login is never cleared.
export const databaseActions = {
  clearDatabaseLogin: ({ hostUid, dbname }) => ({
    type: 'databaseCore/clearDatabaseLogin',
    payload: { hostUid, dbname },
    meta: { seq: nextSeq() },
  }),
};

export const registerLoginToHost = (fn) => {
  hostActions.loginToHost = fn;
};

export const registerClearReconnectingHost = (fn) => {
  hostActions.clearReconnectingHost = fn;
};

// Tracks hosts currently awaiting a user reconnect decision.
// Suppresses duplicate 401 modal triggers while the modal is visible.
const reconnectingHosts = new Set();

// Timestamp of each host's last successful CMS (re)login. A request issued
// just before a password-change relogin can still be in flight when CMS
// invalidates its (now superseded) token, so its 401 lands after the fresh
// login already succeeded — without this, that stale rejection alone pops a
// confusing reconnect prompt for a host the user just finished reconnecting.
//
// Root cause of the "modal opens twice for one takeover" bug: this used to be
// guarded by a fixed STALE_TOKEN_GRACE_MS (5s) window measured from "now" —
// `Date.now() - lastLoginSuccessAt.get(hostUid) < 5000`. Any straggler
// request that was in flight at the moment of takeover but didn't itself
// land its 401 until more than 5s after the user reconnected (slow query,
// a queue of concurrent polls, etc.) fell outside that window and was
// treated as a brand-new takeover, reopening the modal right after it had
// just been closed. Comparing the request's own issue time against the
// login timestamp instead removes the arbitrary window entirely: any
// request issued before the last successful login is unconditionally stale,
// regardless of how long it took to fail.
const lastLoginSuccessAt = new Map();
const isStaleHostRequest = (hostUid, originalRequest) =>
  (originalRequest?.__issuedAt || 0) < (lastLoginSuccessAt.get(hostUid) || 0);

// Directly export so ReconnectHostModal can clear the guard on close.
export const clearReconnectingHost = (hostUid) => {
  reconnectingHosts.delete(hostUid);
};

// A host-scoped request the server could not send to its CMS
// (/errors/cms/no_response, or a TLS failure). A refused or unreachable
// connection (CMS stopped, its port changed, the host down) opens the
// reconnect window at once. A timeout, or a connection CMS reset, can be a
// busy CMS (it stalls for 30 s or more under CPU contention) or an idle
// keep-alive socket CMS had closed, so those count as separate moments: the
// requests of one refresh time out together and count once (within
// CMS_NO_RESPONSE_SAME_MOMENT_MS of the last counted one), and it takes
// CMS_NO_RESPONSE_MAX_TIMEOUTS such moments within the window. Requests
// that take long by nature (log reads) and the host connect's own deadline
// (no socket code) are not counted. Without this the host stayed
// "connected" and every screen kept its last values. Polling pauses for a
// host in the reconnect queue, so nothing keeps asking.
const CMS_NO_RESPONSE_TYPE = '/errors/cms/no_response';
const CMS_TLS_ERROR_TYPE = '/errors/cms/tls_error';
const CMS_REQUEST_FAILED_TYPE = '/errors/cms/request_failed';
const CMS_UNREACHABLE_REASONS = new Set(['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN']);
const CMS_SLOW_REASONS = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET']);
const CMS_LONG_REQUEST_PATHS = ['/log/', '/cms-auth/'];
export const CMS_NO_RESPONSE_MAX_TIMEOUTS = 3;
export const CMS_NO_RESPONSE_SAME_MOMENT_MS = 10000;
const CMS_NO_RESPONSE_WINDOW_MS = 5 * 60 * 1000;
const hostNoResponseFailures = new Map(); // hostUid -> { count, firstAt, lastAt }

// Host-scoped paths whose answer says nothing about the host's saved CMS:
// the server answers them without CMS (the host record, a database logout),
// or they may go elsewhere (cms-auth: Edit Host's connection test can use
// another address). Neither clears "Not responding".
const reachesCms = (requestUrl) => {
  const path = (requestUrl || '').replace(/^https?:\/\/[^/]+/i, '').replace(/^\/?api\//i, '').replace(/^\//, '');
  return !path.startsWith('host/') && !path.includes('/logout/') && !path.includes('/cms-auth/');
};

// The "Not responding" dot (hostSlice.hostNotResponding): set by a request
// CMS did not answer that did not open the reconnect window, cleared by the
// next one it answers. Only reads the store and dispatches when the flag
// changes; never sends a request.
let storeModule = null;
const setHostNotResponding = async (hostUid, notResponding) => {
  try {
    // One import for all responses (this runs on every host response).
    storeModule ??= import('../app/store');
    const { store } = await storeModule;
    const host = store.getState().host;
    if (Boolean(host?.hostNotResponding?.[hostUid]) === notResponding) return;
    if (notResponding && !host?.authorizedHosts?.includes(hostUid)) return;
    store.dispatch(notResponding ? hostActions.hostNotResponding(hostUid) : hostActions.hostResponding(hostUid));
  } catch (e) {
    storeModule = null;
    console.error('Failed to update the host response state:', e);
  }
};

const isHostUnreachableError = (hostUid, requestUrl, apiData) => {
  const type = apiData?.data?.type || apiData?.type || '';
  if (type === CMS_TLS_ERROR_TYPE) return true;
  if (type !== CMS_NO_RESPONSE_TYPE) return false;
  const reason = apiData?.data?.reason || apiData?.reason;
  if (CMS_UNREACHABLE_REASONS.has(reason)) return true;
  if (!CMS_SLOW_REASONS.has(reason)) return false;
  if (CMS_LONG_REQUEST_PATHS.some((part) => requestUrl.includes(part))) return false;
  const now = Date.now();
  const entry = hostNoResponseFailures.get(hostUid);
  if (entry && now - entry.lastAt < CMS_NO_RESPONSE_SAME_MOMENT_MS) return false;
  if (entry && now - entry.firstAt < CMS_NO_RESPONSE_WINDOW_MS) {
    entry.count += 1;
    entry.lastAt = now;
  } else {
    hostNoResponseFailures.set(hostUid, { count: 1, firstAt: now, lastAt: now });
  }
  return hostNoResponseFailures.get(hostUid).count >= CMS_NO_RESPONSE_MAX_TIMEOUTS;
};

const isDesktopRuntime = () =>
  typeof window !== 'undefined' &&
  (Boolean(window.desktopConfig?.apiBaseUrl) || window.location.protocol === 'app:');

const resolveApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_API_BASE_URL || 'https://localhost:8080';
  }

  const configured =
    window.desktopConfig?.apiBaseUrl || import.meta.env.VITE_API_BASE_URL;
  if (configured) {
    return configured;
  }

  if (window.location.protocol === 'app:') {
    return '/api';
  }

  if (
    window.location.protocol === 'https:' ||
    window.location.protocol === 'http:'
  ) {
    return '/api';
  }

  return 'https://localhost:8080';
};

const apiClient = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
  ...(isDesktopRuntime() ? { adapter: 'fetch' } : {}),
});

apiClient.interceptors.request.use((config) => {
  config.baseURL = resolveApiBaseUrl();
  if (typeof window !== 'undefined' && window.location.protocol === 'app:') {
    config.adapter = 'fetch';
  }
  // Stamp when THIS attempt was actually sent (re-stamped on every retry,
  // since apiClient(originalRequest) re-enters this interceptor). Lets the
  // 401 handler below tell a stale straggler — issued before a reconnect
  // that has since succeeded — from a genuinely new failure, no matter how
  // long that straggler took to come back. See STALE_TOKEN_GRACE_MS removal
  // note further down for why a fixed time window isn't enough.
  config.__issuedAt = Date.now();
  return config;
});

// This tab's app session: { expiresAt, expiresIn, user? } or null (see setAppSession).
let knownSession = null;
let appSessionGeneration = 0;

/**
 * Changes with every login and logout in this tab (not with a refresh), so
 * a shared read is never handed to another login session.
 */
export const appSessionKey = () => appSessionGeneration;

// The app session's tokens live in httpOnly cookies the server sets; page
// scripts never see them. A state-changing request must carry this header,
// which a page on another origin cannot add (the server refuses the rest).
export const CSRF_HEADER = 'X-CWM-Request';

// The desktop app has no app login (no cookies, no header check).
const withAppSession = (config) => {
  if (isDesktopRuntime()) return config;
  config.withCredentials = true;
  config.headers = config.headers || {};
  if (typeof config.headers.set === 'function') config.headers.set(CSRF_HEADER, '1');
  else config.headers[CSRF_HEADER] = '1';
  return config;
};

apiClient.interceptors.request.use(withAppSession);

// An expired session (the app opened after the access cookie ran out, or a
// request right after waking) is refreshed before the request goes out,
// instead of sending it to get a 401 first.
apiClient.interceptors.request.use(async (config) => {
  const url = config.url || '';
  if (!sessionRefreshEnabled() || url.includes('/auth/')) return config;
  if (!knownSession || knownSession.expiresAt > Date.now()) return config;
  try {
    await refreshSession();
  } catch (err) {
    if (err?.response?.status === 401) await handleSystemSessionExpired();
  }
  return config;
});

const refreshingHosts = new Map();
// Circuit breaker for the silent "session expired -> revoke, re-login,
// retry" path below: each cycle is one dispatch(revokeHostLogin) +
// dispatch(loginToHost) + one retried request. If the underlying CMS
// session can't actually be restored (host unreachable, stale creds that
// "succeed" but still don't authenticate, etc.), every poll tick and every
// in-flight request independently re-triggers this same cycle with no
// timer gating it — each retry's own 401 fires it again, spinning as fast
// as the promises resolve (seen live: ~10 requests/sec). After
// AUTO_RELOGIN_MAX_ATTEMPTS failures for a host within the window, stop
// silently retrying and fall back to the reconnect modal instead.
const hostAutoReloginFailures = new Map();
const AUTO_RELOGIN_MAX_ATTEMPTS = 3;
const AUTO_RELOGIN_WINDOW_MS = 15000;
let isHandlingSystemSessionExpiry = false;
let isRefreshingAccessToken = false;
/** @type {Array<{ resolve: () => void, reject: (err: Error) => void }>} */
let accessTokenRefreshWaiters = [];

function notifyAccessTokenRefreshed() {
  accessTokenRefreshWaiters.forEach(({ resolve }) => resolve());
  accessTokenRefreshWaiters = [];
}

function notifyAccessTokenRefreshFailed(err) {
  accessTokenRefreshWaiters.forEach(({ reject }) => reject(err));
  accessTokenRefreshWaiters = [];
}

// The refresh is a plain axios call (not apiClient, whose 401 handling would
// loop back here), so it gets its own limit. Without one, a refresh that
// never answers (a connection left half-open by a sleep or a network change)
// kept isRefreshingAccessToken set for good: every later 401 then waited on
// it forever and the screens stopped refreshing until the page was reloaded.
export const ACCESS_TOKEN_REFRESH_TIMEOUT_MS = 15000;

// ── App session refresh ─────────────────────────────────────────────────
// The server rotates the refresh token on every refresh and, if an old one
// is used again, revokes the whole session. So one refresh path serves the
// 401 handler, the timer before expiry, the window becoming visible again
// (a laptop waking up) and the first request of an expired session; within
// a tab one refresh runs at a time, and across tabs the Web Locks API lets
// one tab refresh while the others use the cookies it got (the browser
// shares them between tabs).
//
// The page cannot read the httpOnly cookies, so it keeps when the access
// token ends (from the server's expiresIn) in localStorage: not a secret,
// only what the timers and the other tabs need.

/** Refresh this long before the access token expires. */
export const SESSION_REFRESH_LEAD_MS = 5 * 60 * 1000;

/**
 * localStorage key of the session's expiry: { expiresAt (epoch ms), expiresIn (s), user? }.
 * user is the ID the session logged in with (not a secret): the other tabs
 * tell from it that the browser's cookies now belong to another account.
 */
export const SESSION_EXPIRY_KEY = 'cwm-session-expires-at';

// Tokens kept by builds before the cookies; no longer used.
const LEGACY_TOKEN_KEYS = ['token', 'refreshToken'];

const parseSession = (raw) => {
  try {
    const session = JSON.parse(raw);
    return Number.isFinite(session?.expiresAt) && Number.isFinite(session?.expiresIn) ? session : null;
  } catch {
    return null;
  }
};

const readStoredSession = () => {
  try {
    return parseSession(localStorage.getItem(SESSION_EXPIRY_KEY));
  } catch {
    return null;
  }
};

const writeStoredSession = (session) => {
  try {
    if (session) localStorage.setItem(SESSION_EXPIRY_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_EXPIRY_KEY);
  } catch { /* storage unusable: this tab's timers still run */ }
};

/** A session from a login or refresh answer ({ expiresIn } seconds), or null. */
export function sessionFromResponse(raw) {
  const payload = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
  const expiresIn = Number(payload?.expiresIn);
  return Number.isFinite(expiresIn) && expiresIn > 0
    ? { expiresAt: Date.now() + expiresIn * 1000, expiresIn }
    : null;
}

// The refresh token outlives the access token by this much at most (server:
// 14 days); past that a stored expiry means nothing.
const REFRESH_TOKEN_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

/** Whether this browser holds a session from an earlier login (the cookies decide the rest). */
export const hasStoredSession = () => {
  const session = readStoredSession();
  return Boolean(session && session.expiresAt + REFRESH_TOKEN_LIFETIME_MS > Date.now());
};

// How long before expiry to refresh: SESSION_REFRESH_LEAD_MS, but at most
// half the token's life, so a short-lived token isn't refreshed at once
// again and again.
const refreshLeadMs = (session) => Math.min(SESSION_REFRESH_LEAD_MS, (session.expiresIn * 1000) / 2);

const refreshesSoon = (session, now = Date.now()) => session.expiresAt - now <= refreshLeadMs(session);

// The desktop app has no app login (no token), so none of this runs there.
const sessionRefreshEnabled = () => !isDesktopRuntime();

/**
 * Starts (session) or ends (null) this tab's app session: stores the expiry
 * for the other tabs and schedules the refresh before it.
 */
export const setAppSession = (session) => {
  appSessionGeneration += 1;
  knownSession = session;
  writeStoredSession(session);
  scheduleSessionRefresh(session);
};

// Web Locks exist only in a secure context (https, or localhost). A server
// opened over plain http on another address has none, so there tabs take
// turns through a lease in localStorage instead: a tab writes its own lease,
// waits a moment and reads it back; only the tab whose lease is still there
// refreshes, and the others wait for it to finish and then take the session
// it stored. A lease left by a closed tab ends on its own.
const STORAGE_LOCK_KEY = 'cwm-session-refresh-lock';
const STORAGE_LOCK_LEASE_MS = ACCESS_TOKEN_REFRESH_TIMEOUT_MS + 5000;
export const STORAGE_LOCK_SETTLE_MS = 100;
const STORAGE_LOCK_POLL_MS = 100;
const tabLockId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const readStorageLease = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_LOCK_KEY));
  } catch {
    return null;
  }
};

async function withStorageLock(run) {
  let lease;
  try {
    for (;;) {
      const held = readStorageLease();
      if (!held || !(held.until > Date.now())) {
        lease = { owner: tabLockId, until: Date.now() + STORAGE_LOCK_LEASE_MS };
        localStorage.setItem(STORAGE_LOCK_KEY, JSON.stringify(lease));
        await sleep(STORAGE_LOCK_SETTLE_MS);
        // Two tabs that wrote at once: the later write is the one both read back.
        // A hidden tab's timers can run late, past its own lease, which another
        // tab may then already take: an expired one is taken again from the start.
        const back = readStorageLease();
        if (back?.owner === tabLockId && back.until > Date.now()) {
          // The whole lease for the refresh, however long the wait above took.
          lease = { owner: tabLockId, until: Date.now() + STORAGE_LOCK_LEASE_MS };
          localStorage.setItem(STORAGE_LOCK_KEY, JSON.stringify(lease));
          break;
        }
        lease = null;
      } else {
        await sleep(STORAGE_LOCK_POLL_MS);
      }
    }
  } catch {
    // Storage unusable: refresh as this tab alone.
    lease = null;
  }
  try {
    return await run();
  } finally {
    try {
      if (lease && readStorageLease()?.owner === tabLockId) localStorage.removeItem(STORAGE_LOCK_KEY);
    } catch { /* storage unusable */ }
  }
}

// One tab at a time across the browser. Web Locks exist only in a secure
// context (https, or localhost); an http page (behind a reverse proxy or on
// a LAN address, where the cookies come without Secure) takes turns through
// the localStorage lease above.
const withSessionRefreshLock = (run) => (
  typeof navigator !== 'undefined' && navigator.locks?.request
    ? navigator.locks.request('cwm-session-refresh', run)
    : withStorageLock(run)
);

const accountOf = (session) => (typeof session?.user === 'string' && session.user ? session.user : null);

/** The page reload; an object so tests can watch it (jsdom cannot reload). */
export const pageActions = { reload: () => window.location.reload() };

// The browser's cookies now belong to another account (another tab logged in
// as someone else): load the page again, so the header, the host list and the
// open tabs are that account's. Unsaved edits get the usual leave-page
// question (beforeunload).
const otherAccount = (session) => {
  const mine = accountOf(knownSession);
  const theirs = accountOf(session);
  return Boolean(mine && theirs && mine !== theirs);
};

const SERVER_SESSION_SAME_MS = 5000;

/**
 * Takes the session the server says the cookies hold (GET /auth/session:
 * { expiresIn, expiresLeft, user }) when this tab keeps none (another port of
 * the same host name shares the cookies, not localStorage), another account's,
 * or an older expiry; with it come the refresh before expiry and following
 * the other tabs' logout and account changes.
 */
export function takeServerSession(answer) {
  if (!sessionRefreshEnabled()) return;
  const expiresIn = Number(answer?.expiresIn);
  const expiresLeft = Number(answer?.expiresLeft);
  if (!(expiresIn > 0) || !(expiresLeft > 0)) return;
  const user = typeof answer?.user === 'string' && answer.user ? answer.user : null;
  const session = { expiresAt: Date.now() + expiresLeft * 1000, expiresIn, ...(user ? { user } : {}) };
  // The same session (the expiry differs only by the request's round trip).
  if (knownSession && accountOf(knownSession) === user
    && Math.abs(knownSession.expiresAt - session.expiresAt) < SERVER_SESSION_SAME_MS) return;
  setAppSession(session);
}

// Another tab's refresh (or login) got new cookies: this tab already sends
// them; it only takes the new expiry, unless they are another account's.
async function adoptSession(session) {
  if (otherAccount(session)) {
    pageActions.reload();
    return session;
  }
  knownSession = session;
  scheduleSessionRefresh(session);
  const { store } = await import('../app/store');
  const { sessionRefreshed } = await import('../features/auth/authSlice');
  store.dispatch(sessionRefreshed());
  return session;
}

async function requestSessionRefresh(sessionInUse) {
  return withSessionRefreshLock(async () => {
    // Another tab refreshed while this one waited for the lock: the browser
    // already has its cookies, and the refresh cookie this tab sent before
    // is spent.
    const stored = readStoredSession();
    if (stored && stored.expiresAt !== sessionInUse?.expiresAt && !refreshesSoon(stored)) {
      return adoptSession(stored);
    }

    const response = await axios.post(
      `${resolveApiBaseUrl()}/auth/refresh`,
      {},
      withAppSession({
        timeout: ACCESS_TOKEN_REFRESH_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
        ...(isDesktopRuntime() ? { adapter: 'fetch' } : {}),
      })
    );

    const fresh = sessionFromResponse(response.data);
    if (!fresh) {
      throw new Error(getCM(getStoredLocale()).sessionRefreshFailedMsg);
    }
    // The same account as before the refresh.
    const user = accountOf(sessionInUse) ?? accountOf(knownSession);
    const session = user ? { ...fresh, user } : fresh;
    writeStoredSession(session);
    return adoptSession(session);
  });
}

let sessionRefreshInFlight = null;

/** Refreshes the app session once per tab at a time; resolves to the new session. */
export function refreshSession() {
  if (!sessionRefreshInFlight) {
    sessionRefreshInFlight = requestSessionRefresh(knownSession)
      .finally(() => { sessionRefreshInFlight = null; });
  }
  return sessionRefreshInFlight;
}

// Before expiry, on the visible window, or before a request: a refresh the
// session can't get (refresh token expired or revoked) ends the session as
// the 401 path does; one that only failed to answer leaves it to that path.
async function refreshSessionAhead() {
  try {
    await refreshSession();
  } catch (err) {
    if (err?.response?.status === 401) await handleSystemSessionExpired();
  }
}

let sessionRefreshTimer = null;

function scheduleSessionRefresh(session) {
  if (sessionRefreshTimer) {
    clearTimeout(sessionRefreshTimer);
    sessionRefreshTimer = null;
  }
  if (!session || !sessionRefreshEnabled()) return;
  // setTimeout's limit is about 24.8 days; a longer token is checked again then.
  const delay = Math.min(Math.max(session.expiresAt - refreshLeadMs(session) - Date.now(), 0), 2_000_000_000);
  sessionRefreshTimer = setTimeout(() => {
    sessionRefreshTimer = null;
    if (knownSession === session) void refreshSessionAhead();
  }, delay);
}

// Timers stop while a laptop sleeps: check again when the window is back.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const checkOnReturn = () => {
    if (document.visibilityState !== 'visible' || !sessionRefreshEnabled()) return;
    if (knownSession && refreshesSoon(knownSession)) void refreshSessionAhead();
  };
  document.addEventListener('visibilitychange', checkOnReturn);
  window.addEventListener('focus', checkOnReturn);
  // An expiry another tab stored (refresh or login) is used here at once.
  window.addEventListener('storage', (event) => {
    if (event.key !== SESSION_EXPIRY_KEY || !sessionRefreshEnabled()) return;
    // Another tab logged out (the server cleared the shared cookies): this
    // tab goes to the login screen now, not at its next request's 401.
    if (event.newValue === null) {
      if (knownSession) void handleSystemSessionExpired();
      return;
    }
    const session = parseSession(event.newValue);
    if (!session || session.expiresAt === knownSession?.expiresAt) return;
    void adoptSession(session);
  });
}

async function refreshAccessToken() {
  return refreshSession();
}

// After the session refresh above is set up: drop the tokens older builds
// kept, and take the session kept from the last visit, with its refresh
// scheduled.
try {
  LEGACY_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
} catch { /* storage unusable */ }
if (sessionRefreshEnabled()) {
  const initialSession = readStoredSession();
  if (initialSession) {
    knownSession = initialSession;
    scheduleSessionRefresh(initialSession);
  }
}

/** An answer that means "try again shortly", not "the session is over". */
const isRetryLaterStatus = (status) => status === 429 || status === 503;

async function handleSystemSessionExpired() {
  // The desktop app has no app login to go back to.
  if (isHandlingSystemSessionExpiry || isDesktopApp()) {
    return;
  }

  const path = window.location.pathname;
  if (path === '/login' || path === '/register') {
    return;
  }

  isHandlingSystemSessionExpiry = true;
  try {
    const { store } = await import('../app/store');
    const { logout } = await import('../features/auth/authSlice');
    store.dispatch(logout());
  } finally {
    isHandlingSystemSessionExpiry = false;
  }
}

const getHostUidFromUrl = (url) => {
  if (!url) return null;
  // Handle absolute URLs by extracting pathname
  let path = url;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      path = new URL(url).pathname;
    } catch {
      path = url.replace(/^https?:\/\/[^/]+/i, '');
    }
  }
  // Strip leading /api/ or api/ if present
  let cleanUrl = path.replace(/^\/?api\//i, '');
  cleanUrl = cleanUrl.replace(/^\//, '');
  const segments = cleanUrl.split('/');
  let hostUid = segments[0];

  if (hostUid === 'host' && segments[1]) {
    hostUid = segments[1];
  }

  return (hostUid && hostUid.length > 15) ? hostUid : null;
};

apiClient.interceptors.response.use(
  (response) => {
    if (response.config?.url?.includes('/cms-auth/login')) {
      const hostUid = getHostUidFromUrl(response.config.url);
      if (hostUid) lastLoginSuccessAt.set(hostUid, Date.now());
    }

    // Any successful response for a host means its session is genuinely
    // fine again — reset the circuit breaker so a future real disconnect
    // gets its own fresh attempts instead of inheriting an old count.
    const successHostUid = getHostUidFromUrl(response.config?.url);
    if (successHostUid) {
      hostAutoReloginFailures.delete(successHostUid);
      hostNoResponseFailures.delete(successHostUid);
      // 202: the server took a job without asking CMS yet (CmsJobService).
      if (response.status !== 202 && reachesCms(response.config?.url)) void setHostNotResponding(successHostUid, false);
    }

    const rawData = response.data;
    if (rawData && typeof rawData === 'object' && Object.prototype.hasOwnProperty.call(rawData, 'data')) {
      if (rawData.data === false || rawData.data === null || rawData.data === 0) {
        return rawData;
      }
      const payload = rawData.data;
      if (payload && typeof payload === 'object') {
        if (rawData.note) payload.note = rawData.note;
        if (rawData.status !== undefined) {
          payload.httpStatus = rawData.status;
          const isJobPayload = Object.prototype.hasOwnProperty.call(payload, 'jobId');
          if (!isJobPayload && !Object.prototype.hasOwnProperty.call(payload, 'status')) {
            payload.status = rawData.status;
          }
        }
      }
      return payload;
    }
    return rawData;
  },
  async (error) => {
    const originalRequest = error.config;
    const apiData = error.response?.data;
    const statusCode = error.response?.status;
    const requestUrl = originalRequest?.url ?? '';

    // Normalize the error message before any early returns so every rejection
    // path exposes a meaningful message via err.response.data.message, in the
    // UI language (serverErrorText).
    if (apiData && typeof apiData === 'object' && !Array.isArray(apiData)) {
      const normalizedMessage = serverErrorText(apiData, getCM(getStoredLocale()));

      apiData.message = normalizedMessage;
      // Also overwrite error.message so every catch(err) block that reads
      // err.message directly gets the meaningful server message instead of
      // Axios's generic "Request failed with status code NNN".
      error.message = normalizedMessage;
    } else if (error.request && !error.response && error.code !== 'ERR_CANCELED') {
      // No reply at all; Axios says "Network Error" or "timeout of …".
      const CM = getCM(getStoredLocale());
      error.message = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
        ? CM.serverTimeoutMsg
        : CM.networkErrorMsg;
    }

    if (statusCode === 401 && !originalRequest._retry) {
      const hostUid = getHostUidFromUrl(requestUrl);
      const isHostLoginRequest = requestUrl.includes('/cms-auth/login');
      const isAuthRefreshRequest = requestUrl.includes('/auth/refresh');
      const isAuthLoginRequest = requestUrl.includes('/auth/login');
      const isAuthLogoutRequest = requestUrl.includes('/auth/logout');

      // Both our own app-session JWT errors (JwtAuthGuard, AppError kind "AUTH")
      // and CMS host-token errors (kind "CMS") use the same `code:
      // "INVALID_TOKEN"` string, so `code` alone can't tell them apart. Every
      // host-scoped route (including /:hostUid/cms-auth/login) also happens to
      // carry a `hostUid` parsed from its URL, so without this check an expired
      // APP session on a host-scoped page would be mistaken for a CMS
      // host-token problem below — triggering a Reconnect-host prompt that can
      // never succeed, since it itself needs a valid app JWT to even make the
      // request. `kind` itself isn't sent to the client (see AppError.toProblemDetails),
      // but it's embedded as the first path segment of `type`, e.g. "/errors/auth/invalid_token".
      const errorType = apiData?.data?.type || apiData?.type || '';
      const isAppSessionError = errorType.startsWith('/errors/auth/');

      if (hostUid && !isAppSessionError) {
        if (isHostLoginRequest) {
          return Promise.reject(error);
        }

        // Once the reconnect modal is already up for this host, every branch
        // below (INVALID_TOKEN and the generic-401 counter) must stay quiet —
        // otherwise the generic-401 branch's own 15s window resets on its
        // own schedule and, unaware the modal is already open, walks back
        // through up to AUTO_RELOGIN_MAX_ATTEMPTS more full revoke+re-login+
        // retry cycles every time it lapses, as long as polling keeps firing
        // new requests against a host that never actually reconnected —
        // reproducing the exact "~10 requests/sec" storm this file already
        // has a breaker for, just on a ~15s duty cycle instead of instantly.
        if (reconnectingHosts.has(hostUid)) {
          return Promise.reject(error);
        }

        // If the server explicitly signals an invalid/stolen token (CMS session takeover),
        // do NOT silently re-login — show the Reconnect modal so the user can decide.
        // We keep the host in authorizedHosts so all UI state stays intact.
        const errorCode = apiData?.data?.code || apiData?.code;
        const isInvalidTokenError = errorCode === 'INVALID_TOKEN';

        if (isInvalidTokenError) {
          // (Already-reconnecting hosts are dropped by the guard above.)
          // A request issued before a fresh (re)login can still land its 401
          // after that login already succeeded — that's a stale race, not an
          // actual takeover, so don't second-guess the session that's already valid.
          if (isStaleHostRequest(hostUid, originalRequest)) {
            return Promise.reject(error);
          }
          console.warn(`Host token for ${hostUid} was invalidated (session taken over). Showing reconnect modal.`);
          reconnectingHosts.add(hostUid);
          try {
            const { store } = await import('../app/store');
            // Do NOT revokeHostLogin here — preserve all UI state so reconnect is seamless.
            store.dispatch(hostActions.openReconnectModal(hostUid));
          } catch (e) {
            reconnectingHosts.delete(hostUid);
            console.error('Failed to dispatch reconnect modal:', e);
          }
          return Promise.reject(error);
        }

        // Same staleness check as above: a straggler 401 issued before the
        // last successful (re)login shouldn't feed the circuit breaker below
        // either — it's not a new failure, and letting it count (or, once
        // the count trips, reopen the modal) reproduces the same
        // already-reconnected-but-modal-pops-again bug via this branch
        // instead of the INVALID_TOKEN one above.
        if (isStaleHostRequest(hostUid, originalRequest)) {
          return Promise.reject(error);
        }

        const failureEntry = hostAutoReloginFailures.get(hostUid);
        const now = Date.now();
        if (failureEntry && now - failureEntry.windowStart < AUTO_RELOGIN_WINDOW_MS) {
          failureEntry.count += 1;
        } else {
          hostAutoReloginFailures.set(hostUid, { count: 1, windowStart: now });
        }

        if (hostAutoReloginFailures.get(hostUid).count > AUTO_RELOGIN_MAX_ATTEMPTS) {
          console.warn(
            `Host ${hostUid} exceeded ${AUTO_RELOGIN_MAX_ATTEMPTS} silent re-login attempts within ${AUTO_RELOGIN_WINDOW_MS}ms — its session can't actually be restored, stopping the retry loop and showing the reconnect modal instead.`
          );
          if (!reconnectingHosts.has(hostUid)) {
            reconnectingHosts.add(hostUid);
            try {
              const { store } = await import('../app/store');
              store.dispatch(hostActions.openReconnectModal(hostUid));
            } catch (e) {
              reconnectingHosts.delete(hostUid);
              console.error('Failed to dispatch openReconnectModal:', e);
            }
          }
          return Promise.reject(error);
        }

        console.warn(`Host session for ${hostUid} expired. Initiating revocation and re-login...`);

        try {
          const { store } = await import('../app/store');

          store.dispatch(hostActions.revokeHostLogin(hostUid));

          if (hostActions.loginToHost) {
            if (!refreshingHosts.has(hostUid)) {
              const refreshPromise = hostActions.loginToHost(hostUid);
              refreshingHosts.set(hostUid, refreshPromise);
            }

            await refreshingHosts.get(hostUid);
            refreshingHosts.delete(hostUid);
          }

          originalRequest._retry = true;
          return apiClient(originalRequest);
        } catch {
          refreshingHosts.delete(hostUid);
          if (reconnectingHosts.has(hostUid) || isStaleHostRequest(hostUid, originalRequest)) {
            return Promise.reject(error);
          }
          reconnectingHosts.add(hostUid);
          try {
            const { store } = await import('../app/store');
            store.dispatch(hostActions.openReconnectModal(hostUid));
          } catch (e) {
            reconnectingHosts.delete(hostUid);
            console.error('Failed to dispatch openReconnectModal:', e);
          }
          return Promise.reject(error);
        }
      }

      if (!isAuthRefreshRequest && !isAuthLoginRequest && !isAuthLogoutRequest) {
        originalRequest._retry = true;

        // The check when the app opens (checkSession) ends nothing itself: a
        // refresh the server refused (401) is its answer "signed out" (it
        // signs out then), one that only failed (no answer, 503 busy) is no
        // answer, and the session kept from the last visit stays.
        const sessionCheck = Boolean(originalRequest.__sessionCheck);
        const refusedBy = (refreshErr) => (
          sessionCheck && refreshErr?.response?.status !== 401 ? refreshErr ?? error : error
        );

        if (isRefreshingAccessToken) {
          try {
            await new Promise((resolve, reject) => {
              accessTokenRefreshWaiters.push({ resolve, reject });
            });
            return apiClient(originalRequest);
          } catch (refreshErr) {
            return Promise.reject(refusedBy(refreshErr));
          }
        }

        isRefreshingAccessToken = true;
        try {
          await refreshAccessToken();
          notifyAccessTokenRefreshed();
          return apiClient(originalRequest);
        } catch (refreshErr) {
          notifyAccessTokenRefreshFailed(refreshErr);
          // "Try again shortly" (429, or 503 while another refresh of the same
          // token runs) says nothing about the session: it stays, and the
          // next request refreshes again. The check when the app opens ends
          // nothing itself (above).
          if (!sessionCheck && !isRetryLaterStatus(refreshErr?.response?.status)) {
            await handleSystemSessionExpired();
          }
          return Promise.reject(refusedBy(refreshErr));
        } finally {
          isRefreshingAccessToken = false;
        }
      }

      // auth/login and auth/logout 401 = credential failure, not session expiry.
      // Don't trigger session expiry for these — just surface the error.
      if (isAuthLoginRequest || isAuthLogoutRequest) {
        return Promise.reject(error);
      }

      await handleSystemSessionExpired();
      return Promise.reject(error);
    }

    // The server could not reach the host's CMS (see isHostUnreachableError):
    // the host goes to the reconnect window, where Reconnect tries the login
    // again and Disconnect closes its screens, instead of staying "connected"
    // with its last values on screen. A host login reports its own failure.
    if (!requestUrl.includes('/cms-auth/login')) {
      const hostUid = getHostUidFromUrl(requestUrl);
      const unreachable = Boolean(hostUid) && !reconnectingHosts.has(hostUid) && isHostUnreachableError(hostUid, requestUrl, apiData);
      // CMS did not answer, but not (yet) enough to open the reconnect
      // window: the host is shown as not responding until it answers again.
      // A long read (log) that timed out is not counted, as above.
      const errorType = apiData?.data?.type || apiData?.type;
      if (hostUid && !unreachable && !reconnectingHosts.has(hostUid) &&
          [CMS_NO_RESPONSE_TYPE, CMS_TLS_ERROR_TYPE].includes(errorType) &&
          !CMS_LONG_REQUEST_PATHS.some((part) => requestUrl.includes(part))) {
        await setHostNotResponding(hostUid, true);
      } else if (hostUid && errorType === CMS_REQUEST_FAILED_TYPE && reachesCms(requestUrl)) {
        // CMS answered with status:fail: it responds again.
        await setHostNotResponding(hostUid, false);
      }
      if (unreachable) {
        try {
          const { store } = await import('../app/store');
          if (store.getState().host?.authorizedHosts?.includes(hostUid)) {
            reconnectingHosts.add(hostUid);
            store.dispatch(hostActions.hostUnreachable(hostUid));
          }
        } catch (e) {
          reconnectingHosts.delete(hostUid);
          console.error('Failed to dispatch hostUnreachable:', e);
        }
        return Promise.reject(error);
      }
    }

    // ensureDbLogin (api-server) only accepts a live login the user made; a
    // saved profile is never used to log in on its own. Once that login
    // expires (2h), the host token rotates without a re-login, or the user
    // logged out, the next database action fails here even though nothing
    // the user did here looks like a logout. Bring the UI in line with that:
    // this db is not logged in, whatever the tree's padlock still shows.
    if (statusCode === 400 && (apiData?.data?.code || apiData?.code) === 'MISSING_DB_CREDENTIALS') {
      const hostUid = getHostUidFromUrl(requestUrl);
      const dbname = apiData?.data?.dbname || apiData?.dbname;
      if (hostUid && dbname) {
        try {
          const { store } = await import('../app/store');
          store.dispatch(databaseActions.clearDatabaseLogin({ hostUid, dbname }));
        } catch (e) {
          console.error('Failed to dispatch clearDatabaseLogin:', e);
        }
      }
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
