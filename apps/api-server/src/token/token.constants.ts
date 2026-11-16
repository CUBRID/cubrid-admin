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

export const TOKEN_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
