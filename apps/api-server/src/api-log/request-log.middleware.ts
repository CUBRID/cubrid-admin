import { Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { ApiLogEntry } from '@api-interfaces';
import { resolveClientIp } from '@util';
import { ApiLogService } from './api-log.service';
import { categoryOf, REQUEST_ACTION, RequestAction } from './log-action.decorator';

/** What GlobalExceptionFilter leaves for this line on res.locals. */
export const ERROR_CODE_LOCAL = 'cwmErrorCode';
export const ERROR_TEXT_LOCAL = 'cwmErrorText';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Sign-ins and sign-ups are made before anyone is signed in: the log names the account they were for. */
const ACCOUNT_FROM_BODY = new Set(['auth.sign_in', 'auth.register']);
// The route parameters that name what an action was on, in the order shown.
// Not groupId: an internal id, no help to a reader.
const TARGET_PARAMS = ['dbname', 'bname', 'username', 'targetid', 'id', 'confname', 'jobId'];
// For an action that creates something, its name is in the body.
const TARGET_FROM_BODY: Record<string, string> = {
  'host.add': 'alias',
  'host.add_group': 'name',
  'host.change_group': 'name',
  'admin.create_account': 'id',
  'auth.register': 'id',
  'database.create': 'dbname',
};
// One route, two actions a reader tells apart: which one the body asked for.
const ACTION_FROM_BODY: Record<string, (body: Record<string, unknown>) => string | undefined> = {
  'admin.set_status': (b) => (b.status === 'disabled' ? 'admin.disable_account' : b.status === 'active' ? 'admin.enable_account' : undefined),
  'admin.set_role': (b) => (b.role === 'admin' ? 'admin.grant_admin' : b.role === 'user' ? 'admin.revoke_admin' : undefined),
};
const MAX_ERROR_TEXT = 300;

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function targetOf(action: string | undefined, params: Record<string, string>, body: unknown): string | undefined {
  const parts = TARGET_PARAMS.map((k) => params[k]).filter((v): v is string => typeof v === 'string' && v !== '');
  const field = action ? TARGET_FROM_BODY[action] : undefined;
  const fromBody = field ? (body as Record<string, unknown> | undefined)?.[field] : undefined;
  if (parts.length === 0 && typeof fromBody === 'string' && fromBody.trim()) parts.push(fromBody.trim());
  return parts.length ? parts.join(' / ') : undefined;
}

export function refineAction(action: string | undefined, body: unknown): string | undefined {
  const refine = action ? ACTION_FROM_BODY[action] : undefined;
  return (refine && body && typeof body === 'object' ? refine(body as Record<string, unknown>) : undefined) ?? action;
}

/**
 * Which level a request's console line is written at: failures stand out,
 * and successful reads (most of the traffic is screens polling) only show
 * with LOG_LEVEL=debug. An expired session on a read is expected traffic.
 */
export function lineLevel(method: string, status: number): 'error' | 'warn' | 'log' | 'debug' {
  if (status >= 500) return 'error';
  if (status === 401 && READ_METHODS.has(method)) return 'debug';
  if (status >= 400) return 'warn';
  return READ_METHODS.has(method) ? 'debug' : 'log';
}

/** Whether a request goes in the API log: named actions, other changes, server failures. */
export function shouldRecord(method: string, status: number, tag: RequestAction | undefined): boolean {
  if (tag?.skip) return false;
  if (tag?.action) return true;
  return !READ_METHODS.has(method) || status >= 500;
}

/**
 * One console line for every API request, in place of the request and
 * response bodies logged before, and an API log entry for actions. Added
 * with app.use() before Nest's routes, so it sees every request, also those
 * a guard or the router refuses.
 *
 * `apiPrefix`: only paths under it are API requests (the web app's static
 * files are not logged). Null in the desktop app, which has no prefix.
 */
export function requestLogMiddleware(apiLog: ApiLogService, apiPrefix: string | null, logger = new Logger('Http')) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
    if (apiPrefix !== null && path !== apiPrefix && !path.startsWith(`${apiPrefix}/`)) {
      next();
      return;
    }
    const startedAt = Date.now();
    const requestId = randomBytes(4).toString('hex');
    res.setHeader('X-Request-Id', requestId);

    res.once('finish', () => {
      const status = res.statusCode;
      const durationMs = Date.now() - startedAt;
      const tag = (req as unknown as Record<symbol, RequestAction | undefined>)[REQUEST_ACTION];
      const action = refineAction(tag?.action, req.body);
      const bodyId = (req.body as { id?: unknown } | undefined)?.id;
      const user =
        (req as Request & { user?: { sub?: string } }).user?.sub ??
        (action && ACCOUNT_FROM_BODY.has(action) && typeof bodyId === 'string' ? bodyId : undefined);
      const errorCode = res.locals?.[ERROR_CODE_LOCAL] as string | undefined;
      const target = targetOf(action, tag?.params ?? {}, req.body);

      const line = [
        user ?? '-',
        req.method,
        path,
        status,
        formatDuration(durationMs),
        target,
        errorCode,
        requestId,
      ].filter((v) => v !== undefined && v !== '').join('  ');
      logger[lineLevel(req.method, status)](line);

      if (!shouldRecord(req.method, status, tag)) return;
      const errorText = res.locals?.[ERROR_TEXT_LOCAL] as string | undefined;
      const entry: ApiLogEntry = {
        at: new Date(startedAt).toISOString(),
        requestId,
        ...(user ? { user } : {}),
        ip: resolveClientIp(req),
        ...(action ? { action } : {}),
        category: categoryOf(action),
        method: req.method,
        path,
        ...(tag?.params?.hostUid ? { hostUid: tag.params.hostUid } : {}),
        ...(target ? { target } : {}),
        status,
        ok: status < 400,
        durationMs,
        ...(status >= 400 && errorCode ? { errorCode } : {}),
        ...(status >= 400 && errorText ? { error: errorText.slice(0, MAX_ERROR_TEXT) } : {}),
      };
      apiLog.record(entry);
    });
    next();
  };
}
