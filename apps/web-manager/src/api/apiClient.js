import axios from 'axios';

export const hostActions = {
  revokeHostLogin: (hostUid) => ({ type: 'host/revokeHostLogin', payload: hostUid }),
  openReconnectModal: (hostUid) => ({ type: 'host/openReconnectModal', payload: hostUid }),
  loginToHost: null,
  clearReconnectingHost: null,
};

// Plain action-type objects (not imported slice creators) to avoid a
// circular import — most feature slices import this module, so this module
// can't import back from databaseCoreSlice. Must stay in sync with that
// slice's name ('databaseCore') and action name (clearDatabaseLogin).
export const databaseActions = {
  clearDatabaseLogin: ({ hostUid, dbname }) => ({
    type: 'databaseCore/clearDatabaseLogin',
    payload: { hostUid, dbname },
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
const lastLoginSuccessAt = new Map();
const STALE_TOKEN_GRACE_MS = 5000;

// Directly export so ReconnectHostModal can clear the guard on close.
export const clearReconnectingHost = (hostUid) => {
  reconnectingHosts.delete(hostUid);
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
  return config;
});

export const setAuthToken = (token) => {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
};

const initialToken = localStorage.getItem('token');
if (initialToken) {
  setAuthToken(initialToken);
}

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

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    throw new Error('No refresh token');
  }

  const response = await axios.post(
    `${resolveApiBaseUrl()}/auth/refresh`,
    { refreshToken },
    {
      headers: { 'Content-Type': 'application/json' },
      ...(isDesktopRuntime() ? { adapter: 'fetch' } : {}),
    }
  );

  const tokens = unwrapAuthTokens(response.data);
  if (!tokens?.token) {
    throw new Error('Refresh response missing access token');
  }

  localStorage.setItem('token', tokens.token);
  if (tokens.refreshToken) {
    localStorage.setItem('refreshToken', tokens.refreshToken);
  }
  setAuthToken(tokens.token);

  const { store } = await import('../app/store');
  const { sessionRefreshed } = await import('../features/auth/authSlice');
  store.dispatch(sessionRefreshed(tokens));

  return tokens.token;
}

async function handleSystemSessionExpired() {
  if (isHandlingSystemSessionExpiry) {
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
    if (successHostUid) hostAutoReloginFailures.delete(successHostUid);

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
    // path exposes a meaningful message via err.response.data.message.
    // Priority: our StandardResponse.note → nested data.message → data.detail
    // → data.title → existing message (e.g. NestJS default "Internal Server Error")
    if (apiData && typeof apiData === 'object' && !Array.isArray(apiData)) {
      const normalizedMessage = apiData.note
        || apiData.data?.message
        || apiData.data?.detail
        || apiData.data?.title
        || apiData.message
        || 'An unexpected error occurred';

      apiData.message = normalizedMessage;
      // Also overwrite error.message so every catch(err) block that reads
      // err.message directly gets the meaningful server message instead of
      // Axios's generic "Request failed with status code NNN".
      error.message = normalizedMessage;
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
          // A request in flight before a fresh (re)login can still land its 401
          // after that login already succeeded — that's a stale race, not an
          // actual takeover, so don't second-guess the session that's already valid.
          const sinceLogin = Date.now() - (lastLoginSuccessAt.get(hostUid) || 0);
          if (sinceLogin < STALE_TOKEN_GRACE_MS) {
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
        } catch (refreshError) {
          refreshingHosts.delete(hostUid);
          if (reconnectingHosts.has(hostUid)) {
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

    // ensureDbLogin (api-server) grants access via a short-lived session
    // cache or a saved db-login profile — never both indefinitely. A login
    // made without "Save Password" only lives in that cache, so once it
    // expires (or the host token rotates) with no profile to fall back on,
    // the *next* database action fails here even though nothing the user
    // did looks like a logout. Bring the UI in line with that: this db no
    // longer has a usable session, whatever the tree's padlock icon (driven
    // by loggedInDatabases, set only at explicit login/logout) still shows.
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
