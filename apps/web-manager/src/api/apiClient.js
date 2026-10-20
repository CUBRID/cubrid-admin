import axios from 'axios';

export const hostActions = {
  revokeHostLogin: (hostUid) => ({ type: 'host/revokeHostLogin', payload: hostUid }),
  openReconnectModal: (hostUid) => ({ type: 'host/openReconnectModal', payload: hostUid }),
  loginToHost: null,
  clearReconnectingHost: null,
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

        // If the server explicitly signals an invalid/stolen token (CMS session takeover),
        // do NOT silently re-login — show the Reconnect modal so the user can decide.
        // We keep the host in authorizedHosts so all UI state stays intact.
        const errorCode = apiData?.data?.code || apiData?.code;
        const isInvalidTokenError = errorCode === 'INVALID_TOKEN';

        if (isInvalidTokenError) {
          // If we're already waiting for the user to reconnect, silently drop this 401.
          if (reconnectingHosts.has(hostUid)) {
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

    return Promise.reject(error);
  }
);

export default apiClient;
