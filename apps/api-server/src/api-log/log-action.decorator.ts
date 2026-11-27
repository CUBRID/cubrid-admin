import { ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiLogCategory } from '@api-interfaces';

export const LOG_ACTION = 'cwmLogAction';
export const SKIP_ACTION_LOG = 'cwmSkipActionLog';

/**
 * Names what a route does for the API log, e.g. `database.start`. The part
 * before the dot is the category. Every route that changes something has a
 * name or @SkipActionLog (api-log-coverage.spec.ts checks this).
 */
export const LogAction = (action: string) => SetMetadata(LOG_ACTION, action);

/** A POST that only reads (a log view, a status check) or that would flood the log (token refresh). */
export const SkipActionLog = () => SetMetadata(SKIP_ACTION_LOG, true);

const CATEGORIES = new Set<ApiLogCategory>([
  'auth', 'account', 'admin', 'host', 'database', 'broker', 'config', 'ha', 'cms', 'file',
]);

export function categoryOf(action: string | undefined): ApiLogCategory {
  const prefix = action?.split('.')[0] as ApiLogCategory | undefined;
  return prefix && CATEGORIES.has(prefix) ? prefix : 'other';
}

/** What the global guard learns about a request for the API log, kept on the request. */
export type RequestAction = {
  action?: string;
  skip: boolean;
  params: Record<string, string>;
};

export const REQUEST_ACTION = Symbol('cwmRequestAction');

/**
 * Called first thing by the global guard, the earliest point that knows the
 * route: the record then has the action's name even when the guard refuses
 * it (an ended session, a user calling an admin route).
 */
export function tagRequestAction(reflector: Reflector, context: ExecutionContext): void {
  if (typeof context.getType === 'function' && context.getType() !== 'http') return;
  const targets = [context.getHandler(), context.getClass()];
  const req = context.switchToHttp().getRequest();
  if (!req) return;
  req[REQUEST_ACTION] = {
    action: reflector.getAllAndOverride<string>(LOG_ACTION, targets),
    skip: reflector.getAllAndOverride<boolean>(SKIP_ACTION_LOG, targets) === true,
    params: { ...(req.params ?? {}) },
  } satisfies RequestAction;
}
