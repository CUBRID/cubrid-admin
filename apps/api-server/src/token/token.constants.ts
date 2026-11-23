/** Access JWT lifetime (Bearer API calls). */
export const ACCESS_TOKEN_EXPIRES = '1d';

export const ACCESS_TOKEN_EXPIRES_SEC = 24 * 60 * 60;

/** Refresh token lifetime (opaque, server-stored). */
export const REFRESH_TOKEN_EXPIRES_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * A refresh token used again this soon after its rotation, while the token
 * that replaced it is still unused, is taken as a lost answer (the page was
 * reloaded or closed while its refresh was in flight, so the browser never
 * stored the new cookies) instead of a stolen token: the session goes on
 * with a new pair rather than being revoked.
 */
export const REFRESH_TOKEN_REUSE_GRACE_MS = 10 * 1000;

/** How long a refresh waits for the same token's rotation already running. */
export const REFRESH_IN_FLIGHT_WAIT_MS = 3000;
export const REFRESH_IN_FLIGHT_POLL_MS = 50;
/** Retry-After (seconds) on a refresh that met another rotating the same token. */
export const REFRESH_RETRY_AFTER_SEC = 1;
/** A rotation lock older than this was left by a crash. */
export const REFRESH_LOCK_STALE_MS = 30 * 1000;

export const TOKEN_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
