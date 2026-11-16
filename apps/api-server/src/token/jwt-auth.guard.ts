import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthError } from '@error/auth/auth-error';
import { CSRF_HEADER, readAccessCookie } from './auth-cookies';
import { TokenBlacklistService } from './token-blacklist.service';

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

type AccessTokenPayload = { sub?: string; jti?: string; type?: string; exp?: number };

/**
 * The global guard in server mode (selectAppGuard). Every route needs the
 * access JWT from the httpOnly cookie, unless it is marked @Public: a valid
 * signature, not expired, an access token, not revoked at logout. The
 * payload becomes request.user.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly tokenBlacklist: TokenBlacklistService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>();
    if (!hasCsrfHeader(request)) {
      throw AuthError.PermissionDenied({ reason: 'CSRF_HEADER_MISSING' });
    }
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    request.user = await this.verify(readAccessCookie(request));
    return true;
  }

  // Every way in which the token fails gives the same answer to the client
  // (as with the passport strategy this replaces); the cause stays on the error.
  private async verify(token: string | undefined): Promise<AccessTokenPayload> {
    if (!token) {
      throw AuthError.InvalidToken({ userId: 'unknown' }, new Error('No access token'));
    }
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch (err) {
      throw AuthError.InvalidToken({ userId: 'unknown' }, err as Error);
    }
    if (payload.type !== 'access') {
      throw AuthError.InvalidToken({ userId: 'unknown' }, new Error('Not an access token'));
    }
    let revoked = false;
    try {
      revoked = Boolean(payload.jti) && (await this.tokenBlacklist.isBlacklisted(payload.jti as string));
    } catch (err) {
      throw AuthError.InvalidToken({ userId: 'unknown' }, err as Error);
    }
    if (revoked) {
      throw AuthError.InvalidToken({ userId: 'unknown' }, new Error('Access token revoked'));
    }
    return payload;
  }
}
