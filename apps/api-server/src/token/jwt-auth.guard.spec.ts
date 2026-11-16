import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { AuthController } from '../auth/auth.controller';
import { AuthError, AuthErrorCode } from '@error/auth/auth-error';
import { DesktopUserGuard } from '../desktop/desktop-user.guard';
import { selectAppGuard } from '../desktop/select-app-guard';
import { ConfigService } from '@config/config.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CSRF_HEADER } from './auth-cookies';

const contextFor = (handler: (...args: never[]) => unknown, request: Record<string, unknown>) =>
  new ExecutionContextHost([request, {}], AuthController, handler);

const csrfRejection = (run: () => unknown) => {
  try {
    run();
  } catch (err) {
    return err;
  }
  return null;
};

describe('JwtAuthGuard CSRF header', () => {
  const guard = new JwtAuthGuard(new Reflector());

  it.each([
    ['login', AuthController.prototype.login],
    ['logout', AuthController.prototype.logout],
    ['refresh', AuthController.prototype.refresh],
  ])('refuses POST %s without the header, though the route is public', (_name, handler) => {
    const err = csrfRejection(() => guard.canActivate(contextFor(handler, { method: 'POST', headers: {} })));
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).code).toBe(AuthErrorCode.PERMISSION_DENIED);
    expect((err as AuthError).additionalData).toEqual({ reason: 'CSRF_HEADER_MISSING' });
  });

  it('refuses a header with another value', () => {
    const request = { method: 'POST', headers: { [CSRF_HEADER]: 'yes' } };
    expect(csrfRejection(() => guard.canActivate(contextFor(AuthController.prototype.login, request)))).toBeInstanceOf(AuthError);
  });

  it('lets POST login through with the header', () => {
    const request = { method: 'POST', headers: { [CSRF_HEADER]: '1' } };
    expect(guard.canActivate(contextFor(AuthController.prototype.login, request))).toBe(true);
  });

  it('does not ask GET for the header', () => {
    const request = { method: 'GET', headers: {} };
    expect(guard.canActivate(contextFor(AuthController.prototype.login, request))).toBe(true);
  });
});

describe('desktop mode CSRF header', () => {
  it('is not checked: the desktop guard lets a POST without it in', () => {
    const guard = selectAppGuard({ isDesktopMode: () => true } as ConfigService, new Reflector());
    expect(guard).toBeInstanceOf(DesktopUserGuard);

    class HostController {
      add() {
        return 'ok';
      }
    }
    const request: Record<string, unknown> = { method: 'POST', headers: {} };
    const context = new ExecutionContextHost([request, {}], HostController, HostController.prototype.add);
    expect(guard.canActivate(context)).toBe(true);
  });
});
