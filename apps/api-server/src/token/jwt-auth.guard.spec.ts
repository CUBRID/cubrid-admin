import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { AuthError } from '@error/auth/auth-error';
import { ADMIN_ONLY } from '@common/decorators/admin-only.decorator';
import { ALLOW_PENDING_PASSWORD_CHANGE } from '@common/decorators/allow-pending-password-change.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let flags: Record<string, boolean>;
  let request: { user?: Record<string, unknown> };
  let guard: JwtAuthGuard;
  let passport: jest.SpyInstance;

  const context = {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;

  beforeEach(() => {
    flags = {};
    request = {};
    const reflector = { getAllAndOverride: jest.fn((key: string) => flags[key]) } as unknown as Reflector;
    guard = new JwtAuthGuard(reflector);
    // Stand in for passport: it authenticates and sets req.user.
    passport = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype) as InstanceType<ReturnType<typeof AuthGuard>>, 'canActivate')
      .mockResolvedValue(true);
  });

  afterEach(() => passport.mockRestore());

  const signIn = (user: Record<string, unknown>) => {
    request.user = { sub: 'alice', isAdmin: false, mustChangePassword: false, ...user };
  };

  it('lets a public route through without authenticating', async () => {
    flags.isPublic = true;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(passport).not.toHaveBeenCalled();
  });

  it('lets an authenticated user through an ordinary route', async () => {
    signIn({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('refuses a non-admin on an admin route', async () => {
    signIn({});
    flags[ADMIN_ONLY] = true;
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      additionalData: expect.objectContaining({ reason: 'ADMIN_REQUIRED' }),
    });
  });

  it('lets an admin through an admin route', async () => {
    signIn({ isAdmin: true });
    flags[ADMIN_ONLY] = true;
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('holds a pending password change on every route not marked for it', async () => {
    signIn({ mustChangePassword: true, isAdmin: true });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });

    flags[ADMIN_ONLY] = true;
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });

    flags[ADMIN_ONLY] = false;
    flags[ALLOW_PENDING_PASSWORD_CHANGE] = true;
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("keeps the strategy's own refusal and its reason", () => {
    const refusal = AuthError.InvalidToken({ reason: 'ACCOUNT_DISABLED' });
    expect(() => guard.handleRequest(refusal, false, undefined, context)).toThrow(refusal);
  });
});
