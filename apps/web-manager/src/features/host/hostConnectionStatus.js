// What a host's status dot shows: green connected, yellow not logged in
// (blinking while logging in), red login failed, connection lost or its CMS
// not answering.
export const HOST_CONNECTED = 'connected';
export const HOST_LOGGING_IN = 'loggingIn';
export const HOST_NOT_LOGGED_IN = 'notLoggedIn';
export const HOST_LOGIN_FAILED = 'loginFailed';
export const HOST_DISCONNECTED = 'disconnected';
export const HOST_NOT_RESPONDING = 'notResponding';

/**
 * A host waiting on the reconnect window stays in authorizedHosts (apiClient
 * keeps its UI state for a seamless reconnect), so the queue is read first.
 */
export function hostConnectionStatus(hostUid, host = {}) {
  const { authorizedHosts = [], reconnectQueue = [], hostAuthErrors = {}, hostNotResponding = {}, isLoggingIntoHost = false, selectedHostUid = null } = host;
  if (!hostUid) return HOST_NOT_LOGGED_IN;
  if (reconnectQueue.includes(hostUid)) return HOST_DISCONNECTED;
  if (authorizedHosts.includes(hostUid)) return hostNotResponding[hostUid] ? HOST_NOT_RESPONDING : HOST_CONNECTED;
  // A login is started on the selected host (double-click selects it first).
  if (isLoggingIntoHost && selectedHostUid === hostUid) return HOST_LOGGING_IN;
  if (hostAuthErrors[hostUid]) return HOST_LOGIN_FAILED;
  return HOST_NOT_LOGGED_IN;
}

export function hostConnectionStatusText(status, hostUid, host, CM) {
  switch (status) {
    case HOST_CONNECTED: return CM.connected;
    case HOST_LOGGING_IN: return CM.hostLoginInProgressHint;
    case HOST_LOGIN_FAILED: return CM.hostLoginFailedWith(host?.hostAuthErrors?.[hostUid] ?? '');
    case HOST_DISCONNECTED: return CM.disconnectedLabel;
    case HOST_NOT_RESPONDING: return CM.hostNotRespondingLabel;
    default: return CM.hostNotLoggedIn;
  }
}
