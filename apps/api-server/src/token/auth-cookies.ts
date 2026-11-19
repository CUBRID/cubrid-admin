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

const accessPath = `/${API_PREFIX}`;
const refreshPath = `/${API_PREFIX}/auth`;

/**
 * Whether the browser sees the page over https, so the cookies can be Secure.
 * The server itself always listens on https, but behind a reverse proxy that
 * serves http (as 0.1.0 allowed) the browser would drop a Secure cookie and
 * the login would not stick. The page's scheme is taken from Origin (Referer
 * when there is none): the browser sets them and a page script cannot.
 * X-Forwarded-Proto is not used: any client can send it, and whether it can
 * be believed depends on the proxy settings; Origin needs none. A client
 * that sends an http origin only gets its own
 * cookies without Secure. No header, https, 'null' or anything unreadable
 * keeps Secure. The names have no __Host-/__Secure- prefix, which a browser
 * would refuse without Secure.
 */
export function cookieSecureFor(req: Request): boolean {
  const headers = req?.headers ?? {};
  const source = [headers.origin, headers.referer].find((value) => typeof value === 'string' && value.trim());
  if (!source || source === 'null') return true;
  try {
    return new URL(source).protocol !== 'http:';
  } catch {
    return true;
  }
}

const optionsFor = (req: Request): CookieOptions => ({ httpOnly: true, secure: cookieSecureFor(req), sameSite: 'strict' });

export function setAuthCookies(req: Request, res: Response, tokens: AuthTokens): void {
  const names = authCookieNames();
  const options = optionsFor(req);
  res.cookie(names.access, tokens.token, {
    ...options,
    path: accessPath,
    maxAge: ACCESS_TOKEN_EXPIRES_SEC * 1000,
  });
  res.cookie(names.refresh, tokens.refreshToken, {
    ...options,
    path: refreshPath,
    maxAge: REFRESH_TOKEN_EXPIRES_MS,
  });
}

/** Same name, path and flags as when set (Secure by the same rule); otherwise the browser keeps the cookie. */
export function clearAuthCookies(req: Request, res: Response): void {
  const names = authCookieNames();
  const options = optionsFor(req);
  res.clearCookie(names.access, { ...options, path: accessPath });
  res.clearCookie(names.refresh, { ...options, path: refreshPath });
}

export const readAccessCookie = (req: Request) => readCookie(req, authCookieNames().access);
export const readRefreshCookie = (req: Request) => readCookie(req, authCookieNames().refresh);

function readCookie(req: Request, name: string): string | undefined {
  const value = (req as Request & { cookies?: Record<string, unknown> }).cookies?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
