import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { JsonWebTokenError, TokenExpiredError } from '@nestjs/jwt';
import { AuthError } from '@error/auth/auth-error';
import { CSRF_HEADER } from './auth-cookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The cookies go with every request the browser makes to this site, so a
 * state-changing request must also carry CSRF_HEADER, which another origin
 * cannot add. Checked before @Public: login and logout need it too.
 */
export function hasCsrfHeader(request: { method?: string; headers?: Record<string, unknown> }): boolean {
  if (SAFE_METHODS.has(String(request.method ?? '').toUpperCase())) return true;
  return request.headers?.[CSRF_HEADER] === '1';
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }
  canActivate(context: ExecutionContext) {
    if (!hasCsrfHeader(context.switchToHttp().getRequest())) {
      throw AuthError.PermissionDenied({ reason: 'CSRF_HEADER_MISSING' });
    }
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    return isPublic ? true : super.canActivate(context);
  }
  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any
  ): TUser {
    if (!user) {
      throw AuthError.InvalidToken(
        { userId: 'unknown' },
        new Error('User not found or invalid token')
      );
    }

    if (info instanceof TokenExpiredError || info instanceof JsonWebTokenError) {
      throw AuthError.InvalidToken({ userId: user?.sub || 'unknown' }, info);
    } else if (err instanceof Error) {
      throw AuthError.InternalError({ userId: user?.sub || 'unknown' }, err);
    }
    return super.handleRequest(err, user, info, context, status);
  }
}
