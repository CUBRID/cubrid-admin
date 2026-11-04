import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NOT_ON_DESKTOP } from '@decorators/not-on-desktop.decorator';
import { AuthError } from '@error/auth/auth-error';

/** The one user whose data a desktop workspace holds; every desktop request acts as it. */
export const DESKTOP_USER_ID = 'desktop';

/**
 * The global guard in desktop mode (ConfigService.isDesktopMode), in place
 * of JwtAuthGuard: the server is reached only through the desktop app's own
 * socket, so there is no app login and each request acts as
 * DESKTOP_USER_ID. Routes marked @NotOnDesktop are refused.
 */
@Injectable()
export class DesktopUserGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const notOnDesktop = this.reflector.getAllAndOverride<boolean>(NOT_ON_DESKTOP, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (notOnDesktop) {
      throw AuthError.PermissionDenied({ reason: 'NOT_ON_DESKTOP' });
    }
    context.switchToHttp().getRequest().user = { sub: DESKTOP_USER_ID };
    return true;
  }
}
