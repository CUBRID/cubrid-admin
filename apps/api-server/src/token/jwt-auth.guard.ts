import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { JsonWebTokenError, TokenExpiredError } from '@nestjs/jwt';
import { AuthError } from '@error/auth/auth-error';
import { ADMIN_ONLY } from '@common/decorators/admin-only.decorator';
import { ALLOW_PENDING_PASSWORD_CHANGE } from '@common/decorators/allow-pending-password-change.decorator';
import { tagRequestAction } from '@api-log/log-action.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    tagRequestAction(this.reflector, context);
    if (this.flag(context, 'isPublic')) return true;

    const authenticated = await (super.canActivate(context) as Promise<boolean>);
    if (!authenticated) return false;

    const user = context.switchToHttp().getRequest()?.user;
    // Before the admin check: an admin with a pending password change
    // still has to set it first.
    if (user?.mustChangePassword && !this.flag(context, ALLOW_PENDING_PASSWORD_CHANGE)) {
      throw AuthError.PasswordChangeRequired({ userId: user.sub });
    }
    if (this.flag(context, ADMIN_ONLY) && !user?.isAdmin) {
      throw AuthError.PermissionDenied({ userId: user?.sub ?? 'unknown', reason: 'ADMIN_REQUIRED' });
    }
    return true;
  }

  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any
  ): TUser {
    // The strategy's own refusal (disabled account, ended session, ...)
    // keeps its reason instead of turning into a generic invalid token.
    if (err instanceof AuthError) {
      throw err;
    }

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

  private flag(context: ExecutionContext, key: string): boolean {
    return this.reflector.getAllAndOverride<boolean>(key, [context.getHandler(), context.getClass()]) === true;
  }
}
