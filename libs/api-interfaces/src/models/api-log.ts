/**
 * The API log: what people did through Web Manager (start a database, edit
 * a config file, sign in), one entry per action, for User Administration >
 * API log. Reads and background polling are not in it.
 */

export type ApiLogCategory =
  | 'auth'
  | 'account'
  | 'admin'
  | 'host'
  | 'database'
  | 'broker'
  | 'config'
  | 'ha'
  | 'cms'
  | 'file'
  | 'other';

export interface ApiLogEntry {
  /** ISO time the request arrived. */
  at: string;
  /** Also sent to the browser as X-Request-Id, and on the server's console line. */
  requestId: string;
  /** The signed-in account; for a sign-in, the account it was for. */
  user?: string;
  ip?: string;
  /** e.g. `database.start`; missing for a route without a name yet. */
  action?: string;
  category: ApiLogCategory;
  method: string;
  /** The request path, without the query string. */
  path: string;
  hostUid?: string;
  /** The host's name in the user's host list. */
  host?: string;
  /** What the action was on: a database, broker, account, file. */
  target?: string;
  status: number;
  ok: boolean;
  durationMs: number;
  /** Error code, for a failed action. */
  errorCode?: string;
  /** Error text the user saw, for a failed action. */
  error?: string;
}

/** GET /admin/api-log query. */
export interface ApiLogQuery {
  /** ISO time; default 24 hours before `to`. */
  from?: string;
  /** ISO time; default now. */
  to?: string;
  user?: string;
  category?: ApiLogCategory;
  result?: 'ok' | 'failed';
  /** Matches the host, the target or the path. */
  target?: string;
  limit?: number;
  offset?: number;
}

export interface ApiLogBucket {
  /** ISO start of the hour or day. */
  start: string;
  ok: number;
  failed: number;
}

/** Totals over every entry the filters match, not just the page. */
export interface ApiLogSummary {
  actions: number;
  failed: number;
  failedSignIns: number;
  activeUsers: number;
  bucket: 'hour' | 'day';
  buckets: ApiLogBucket[];
}

export interface ApiLogPage {
  entries: ApiLogEntry[];
  total: number;
  summary: ApiLogSummary;
}
