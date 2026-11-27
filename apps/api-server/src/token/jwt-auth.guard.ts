import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthError } from '@error/auth/auth-error';
import { AccountAccessService, sameAccount } from '@account/account-access.service';
import { ADMIN_ONLY } from '@common/decorators/admin-only.decorator';
import { ALLOW_PENDING_PASSWORD_CHANGE } from '@common/decorators/allow-pending-password-change.decorator';
import { tagRequestAction } from '@api-log/log-action.decorator';
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

export type AccessTokenPayload = {
  sub?: string;
  jti?: string;
  type?: string;
  exp?: number;
  iat?: number;
  /** The refresh family the token was issued with, revoked at logout. */
  fam?: string;
  /** The account's session version when the token was issued; absent = 0. */
  sv?: number;
  /** The account record's uuid when issued; absent in tokens from before it. */
  uid?: string;
};

/** request.user on an authenticated request. */
export type AuthenticatedUser = AccessTokenPayload & {
  sub: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
};

/**
 * The global guard in server mode (selectAppGuard). Every route needs the
 * access JWT from the httpOnly cookie, unless it is marked @Public: a valid
 * signature, not expired, an access token, not revoked at logout (itself or
 * its whole refresh family), and an account that still exists, is enabled and
 * has not had its sessions ended. The payload, with the account's role,
 * becomes request.user. Then @AdminOnly and a pending password change.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly tokenBlacklist: TokenBlacklistService,
    private readonly accountAccess: AccountAccessService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First: the API log names the action even when the request is refused.
    tagRequestAction(this.reflector, context);
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!hasCsrfHeader(request)) {
      throw AuthError.PermissionDenied({ reason: 'CSRF_HEADER_MISSING' });
    }
    if (this.flag(context, 'isPublic')) return true;

    const user = await this.authenticate(await this.verify(readAccessCookie(request)));
    request.user = user;
    // Before the admin check: an admin with a pending password change
    // still has to set it first.
    if (user.mustChangePassword && !this.flag(context, ALLOW_PENDING_PASSWORD_CHANGE)) {
      throw AuthError.PasswordChangeRequired({ userId: user.sub });
    }
    if (this.flag(context, ADMIN_ONLY) && !user.isAdmin) {
      throw AuthError.PermissionDenied({ userId: user.sub, reason: 'ADMIN_REQUIRED' });
    }
    return true;
  }

  /**
   * A token outlives changes to its account (it lasts a day), so the account
   * is checked on every request: deleted, disabled, or its sessions ended by
   * an admin (a password reset raises sessionVersion).
   */
  private async authenticate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    if (!payload.sub) {
      throw AuthError.InvalidToken({ reason: 'INVALID_TOKEN_SUBJECT' });
    }
    const access = await this.accountAccess.get(payload.sub);
    // A deleted account whose name was taken again is gone all the same.
    if (!access.exists || !sameAccount(payload.uid, access)) {
      throw AuthError.InvalidToken({ userId: payload.sub, reason: 'ACCOUNT_NOT_FOUND' });
    }
    if (access.disabled) {
      throw AuthError.InvalidToken({ userId: payload.sub, reason: 'ACCOUNT_DISABLED' });
    }
    if ((payload.sv ?? 0) !== access.sessionVersion) {
      throw AuthError.InvalidToken({ userId: payload.sub, reason: 'SESSION_REVOKED' });
    }
    return {
      ...payload,
      sub: payload.sub,
      isAdmin: access.isAdmin,
      mustChangePassword: access.mustChangePassword,
    };
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
      revoked =
        (Boolean(payload.jti) && (await this.tokenBlacklist.isBlacklisted(payload.jti as string))) ||
        // Its session was logged out, or its refresh token was reused.
        (await this.tokenBlacklist.isFamilyRevoked(payload.fam));
    } catch (err) {
      throw AuthError.InvalidToken({ userId: 'unknown' }, err as Error);
    }
    if (revoked) {
      throw AuthError.InvalidToken({ userId: 'unknown' }, new Error('Access token revoked'));
    }
    return payload;
  }

  private flag(context: ExecutionContext, key: string): boolean {
    return this.reflector.getAllAndOverride<boolean>(key, [context.getHandler(), context.getClass()]) === true;
  }
}
