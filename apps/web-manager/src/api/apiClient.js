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
const CMS_UNREACHABLE_REASONS = new Set(['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN']);
const CMS_SLOW_REASONS = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET']);
const CMS_LONG_REQUEST_PATHS = ['/log/', '/cms-auth/'];
export const CMS_NO_RESPONSE_MAX_TIMEOUTS = 3;
export const CMS_NO_RESPONSE_SAME_MOMENT_MS = 10000;
const CMS_NO_RESPONSE_WINDOW_MS = 5 * 60 * 1000;
const hostNoResponseFailures = new Map(); // hostUid -> { count, firstAt, lastAt }

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

// An expired session (the app opened after the token ran out, or a request
// right after waking) is refreshed before the request goes out, instead of
// sending it to get a 401 first.
apiClient.interceptors.request.use(async (config) => {
  const url = config.url || '';
  if (!sessionRefreshEnabled() || url.includes('/auth/')) return config;
  const token = currentAccessToken();
  const expiresAt = token ? accessTokenExpiresAt(token) : null;
  if (expiresAt === null || expiresAt > Date.now()) return config;
  try {
    const fresh = await refreshSession();
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${fresh}`;
  } catch (err) {
    if (err?.response?.status === 401) await handleSystemSessionExpired();
  }
  return config;
});

export const setAuthToken = (token) => {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
  scheduleSessionRefresh(token);
};


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
/** @type {Array<{ resolve: (token: string) => void, reject: (err: Error) => void }>} */
let accessTokenRefreshWaiters = [];

function unwrapAuthTokens(raw) {
  const payload = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
  if (!payload?.token) return null;
  return {
    token: payload.token,
    refreshToken: payload.refreshToken,
  };
}

function notifyAccessTokenRefreshed(token) {
  accessTokenRefreshWaiters.forEach(({ resolve }) => resolve(token));
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
// a tab one refresh runs at a time, and across tabs the Web Locks API (or,
// without it, a lease in localStorage) lets one tab refresh while the others
// take the tokens it stored.

/** Refresh this long before the access token expires. */
export const SESSION_REFRESH_LEAD_MS = 5 * 60 * 1000;

const jwtClaims = (token) => {
  try {
    const part = String(token).split('.')[1];
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')));
  } catch {
    return null;
  }
};

/** The access token's expiry (epoch ms) from its JWT `exp`, or null. */
export function accessTokenExpiresAt(token) {
  const exp = jwtClaims(token)?.exp;
  return Number.isFinite(exp) ? exp * 1000 : null;
}

// How long before expiry to refresh: SESSION_REFRESH_LEAD_MS, but at most
// half the token's life, so a short-lived token isn't refreshed at once
// again and again.
const refreshLeadMs = (token) => {
  const { exp, iat } = jwtClaims(token) ?? {};
  return Number.isFinite(exp) && Number.isFinite(iat)
    ? Math.min(SESSION_REFRESH_LEAD_MS, ((exp - iat) * 1000) / 2)
    : SESSION_REFRESH_LEAD_MS;
};

const currentAccessToken = () => {
  const header = apiClient.defaults.headers.common['Authorization'];
  return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
};

const refreshesSoon = (token, now = Date.now()) => {
  const expiresAt = accessTokenExpiresAt(token);
  return expiresAt !== null && expiresAt - now <= refreshLeadMs(token);
};

// The desktop app has no app login (no token), so none of this runs there.
const sessionRefreshEnabled = () => !isDesktopRuntime();

// Web Locks exist only in a secure context (https, or localhost). A server
// opened over plain http on another address has none, so there tabs take
// turns through a lease in localStorage instead: a tab writes its own lease,
// waits a moment and reads it back; only the tab whose lease is still there
// refreshes, and the others wait for it to finish and then take the tokens
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
  let lease = null;
  try {
    for (;;) {
      const held = readStorageLease();
      if (!held || !(held.until > Date.now())) {
        lease = { owner: tabLockId, until: Date.now() + STORAGE_LOCK_LEASE_MS };
        localStorage.setItem(STORAGE_LOCK_KEY, JSON.stringify(lease));
        await sleep(STORAGE_LOCK_SETTLE_MS);
        // Two tabs that wrote at once: the later write is the one both read back.
        if (readStorageLease()?.owner === tabLockId) break;
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

// One tab at a time across the browser.
const withSessionRefreshLock = (run) => (
  typeof navigator !== 'undefined' && navigator.locks?.request
    ? navigator.locks.request('cwm-session-refresh', run)
    : withStorageLock(run)
);

// Another tab's refresh (or login) stored new tokens: use them here too.
async function adoptStoredTokens(token, refreshToken) {
  setAuthToken(token);
  const { store } = await import('../app/store');
  const { sessionRefreshed } = await import('../features/auth/authSlice');
  store.dispatch(sessionRefreshed({ token, refreshToken }));
  return token;
}

async function requestSessionRefresh(tokenInUse) {
  return withSessionRefreshLock(async () => {
    // Another tab refreshed while this one waited for the lock: its tokens
    // are in storage, and the refresh token this tab knew is already spent.
    const stored = localStorage.getItem('token');
    const storedExpiresAt = stored ? accessTokenExpiresAt(stored) : null;
    if (stored && stored !== tokenInUse && storedExpiresAt !== null && !refreshesSoon(stored)) {
      return adoptStoredTokens(stored, localStorage.getItem('refreshToken'));
    }

    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      throw new Error(getCM(getStoredLocale()).sessionRefreshFailedMsg);
    }

    const response = await axios.post(
      `${resolveApiBaseUrl()}/auth/refresh`,
      { refreshToken },
      {
        timeout: ACCESS_TOKEN_REFRESH_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
        ...(isDesktopRuntime() ? { adapter: 'fetch' } : {}),
      }
    );

    const tokens = unwrapAuthTokens(response.data);
    if (!tokens?.token) {
      throw new Error(getCM(getStoredLocale()).sessionRefreshFailedMsg);
    }

    localStorage.setItem('token', tokens.token);
    if (tokens.refreshToken) {
      localStorage.setItem('refreshToken', tokens.refreshToken);
    }
    return adoptStoredTokens(tokens.token, tokens.refreshToken);
  });
}

let sessionRefreshInFlight = null;

/** Refreshes the app session once per tab at a time; resolves to the new access token. */
export function refreshSession() {
  if (!sessionRefreshInFlight) {
    sessionRefreshInFlight = requestSessionRefresh(currentAccessToken())
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

function scheduleSessionRefresh(token) {
  if (sessionRefreshTimer) {
    clearTimeout(sessionRefreshTimer);
    sessionRefreshTimer = null;
  }
  if (!token || !sessionRefreshEnabled()) return;
  const expiresAt = accessTokenExpiresAt(token);
  if (expiresAt === null) return;
  // setTimeout's limit is about 24.8 days; a longer token is checked again then.
  const delay = Math.min(Math.max(expiresAt - refreshLeadMs(token) - Date.now(), 0), 2_000_000_000);
  sessionRefreshTimer = setTimeout(() => {
    sessionRefreshTimer = null;
    if (currentAccessToken() === token) void refreshSessionAhead();
  }, delay);
}

// Timers stop while a laptop sleeps: check again when the window is back.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const checkOnReturn = () => {
    if (document.visibilityState !== 'visible' || !sessionRefreshEnabled()) return;
    const token = currentAccessToken();
    if (token && refreshesSoon(token)) void refreshSessionAhead();
  };
  document.addEventListener('visibilitychange', checkOnReturn);
  window.addEventListener('focus', checkOnReturn);
  // A token another tab stored (refresh or login) is used here at once.
  window.addEventListener('storage', (event) => {
    if (event.key !== 'token' || !event.newValue || event.newValue === currentAccessToken()) return;
    void adoptStoredTokens(event.newValue, localStorage.getItem('refreshToken'));
  });
}

async function refreshAccessToken() {
  return refreshSession();
}

// After the session refresh above is set up: the token kept from the last
// visit, with its refresh scheduled.
const initialToken = localStorage.getItem('token');
if (initialToken) {
  setAuthToken(initialToken);
}

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
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
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

        if (isRefreshingAccessToken) {
          try {
            const token = await new Promise((resolve, reject) => {
              accessTokenRefreshWaiters.push({ resolve, reject });
            });
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          } catch {
            return Promise.reject(error);
          }
        }

        isRefreshingAccessToken = true;
        try {
          const token = await refreshAccessToken();
          notifyAccessTokenRefreshed(token);
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        } catch (refreshErr) {
          notifyAccessTokenRefreshFailed(refreshErr);
          await handleSystemSessionExpired();
          return Promise.reject(error);
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
      if (hostUid && !reconnectingHosts.has(hostUid) && isHostUnreachableError(hostUid, requestUrl, apiData)) {
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
