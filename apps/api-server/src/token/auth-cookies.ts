import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { CookieOptions, Request, Response } from 'express';
import { getStoragePath } from '../util/resolve-storage-path';
import { ACCESS_TOKEN_EXPIRES_SEC, REFRESH_TOKEN_EXPIRES_MS } from './token.constants';

/** The server-mode route prefix (main.ts setGlobalPrefix); the desktop app has none. */
export const API_PREFIX = 'api';

/**
 * A browser keeps cookies per host, not per port, so two servers on one
 * host (or behind one proxy name) would share and overwrite each other's
 * cookies and log each other out. Each installation names its cookies with
 * a tag of its own: a hash of a random id made once in its storage, so it
 * stays the same across restarts and upgrades and reveals nothing.
 */
const INSTANCE_ID_FILE = 'instance-id';

let cookieNames: { access: string; refresh: string } | null = null;

function readInstanceId(file: string): string | null {
  try {
    const id = fs.readFileSync(file, 'utf8').trim();
    return id || null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

function instanceTag(): string {
  const dir = getStoragePath();
  const file = path.join(dir, INSTANCE_ID_FILE);
  let id = readInstanceId(file);
  if (!id) {
    fs.mkdirSync(dir, { recursive: true });
    const fresh = crypto.randomBytes(16).toString('hex');
    try {
      // 'wx': another process that made it first wins; its id is read back.
      fs.writeFileSync(file, fresh, { flag: 'wx', mode: 0o600 });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      // An empty file left by a crash is replaced.
      if (!readInstanceId(file)) fs.writeFileSync(file, fresh, { mode: 0o600 });
    }
    id = readInstanceId(file) ?? fresh;
  }
  return crypto.createHash('sha256').update(id).digest('hex').slice(0, 12);
}

/** access: the JWT, sent with every API request; refresh: sent only to the auth routes. */
export function authCookieNames(): { access: string; refresh: string } {
  if (!cookieNames) {
    const tag = instanceTag();
    cookieNames = { access: `cwm_access_${tag}`, refresh: `cwm_refresh_${tag}` };
  }
  return cookieNames;
}

/** Tests only: forget the names so the next call reads the storage again. */
export function resetAuthCookieNamesForTest(): void {
  cookieNames = null;
}

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
  const names = authCookieNames();
  res.cookie(names.access, tokens.token, {
    ...baseOptions,
    path: accessPath,
    maxAge: ACCESS_TOKEN_EXPIRES_SEC * 1000,
  });
  res.cookie(names.refresh, tokens.refreshToken, {
    ...baseOptions,
    path: refreshPath,
    maxAge: REFRESH_TOKEN_EXPIRES_MS,
  });
}

/** Same name, path and flags as when set; otherwise the browser keeps the cookie. */
export function clearAuthCookies(res: Response): void {
  const names = authCookieNames();
  res.clearCookie(names.access, { ...baseOptions, path: accessPath });
  res.clearCookie(names.refresh, { ...baseOptions, path: refreshPath });
}

export const readAccessCookie = (req: Request) => readCookie(req, authCookieNames().access);
export const readRefreshCookie = (req: Request) => readCookie(req, authCookieNames().refresh);

function readCookie(req: Request, name: string): string | undefined {
  const value = (req as Request & { cookies?: Record<string, unknown> }).cookies?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
