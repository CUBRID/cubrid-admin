import type { CookieOptions, Request, Response } from 'express';
import { ACCESS_TOKEN_EXPIRES_SEC, REFRESH_TOKEN_EXPIRES_MS } from './token.constants';

/** The server-mode route prefix (main.ts setGlobalPrefix); the desktop app has none. */
export const API_PREFIX = 'api';

/** Access JWT, sent with every API request. */
export const ACCESS_COOKIE = 'cwm_access';
/** Refresh token, sent only to the auth routes (refresh, logout). */
export const REFRESH_COOKIE = 'cwm_refresh';

/**
 * Every state-changing request must carry this header with the value '1'.
 * A page on another origin cannot add it without a CORS preflight, which
 * the server refuses, so a forged form post or fetch never gets through.
 */
export const CSRF_HEADER = 'x-cwm-request';

/** Internal: the pair the auth service issues; only the cookies carry it to the browser. */
export type AuthTokens = {
  token: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
};

const baseOptions: CookieOptions = { httpOnly: true, secure: true, sameSite: 'strict' };
const accessPath = `/${API_PREFIX}`;
const refreshPath = `/${API_PREFIX}/auth`;

export function setAuthCookies(res: Response, tokens: AuthTokens): void {
  res.cookie(ACCESS_COOKIE, tokens.token, {
    ...baseOptions,
    path: accessPath,
    maxAge: ACCESS_TOKEN_EXPIRES_SEC * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions,
    path: refreshPath,
    maxAge: REFRESH_TOKEN_EXPIRES_MS,
  });
}

/** Same name, path and flags as when set; otherwise the browser keeps the cookie. */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions, path: accessPath });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions, path: refreshPath });
}

export function readCookie(req: Request, name: string): string | undefined {
  const value = (req as Request & { cookies?: Record<string, unknown> }).cookies?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
