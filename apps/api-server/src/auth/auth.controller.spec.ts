import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthError } from '@error/auth/auth-error';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@token/auth-cookies';

const tokens = { token: 'access-jwt', refreshToken: 'refresh-opaque', expiresIn: 86400 };

const fakeResponse = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: jest.Mock; refresh: jest.Mock; logout: jest.Mock };

  beforeEach(async () => {
    authService = {
      login: jest.fn().mockResolvedValue(tokens),
      refresh: jest.fn().mockResolvedValue(tokens),
      logout: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('sets both tokens as httpOnly, Secure, SameSite=Strict cookies and keeps them out of the body', async () => {
    const res = fakeResponse();
    const body = await controller.login({ id: 'u', password: 'p' } as never, res as never);

    expect(body).toEqual({ expiresIn: 86400 });
    expect(res.cookie).toHaveBeenCalledWith(
      ACCESS_COOKIE,
      'access-jwt',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict', path: '/api', maxAge: 86400 * 1000 })
    );
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      'refresh-opaque',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict', path: '/api/auth' })
    );
  });

  it('refreshes from the refresh cookie', async () => {
    const res = fakeResponse();
    const body = await controller.refresh({ cookies: { [REFRESH_COOKIE]: 'old' } } as never, res as never);

    expect(authService.refresh).toHaveBeenCalledWith('old');
    expect(body).toEqual({ expiresIn: 86400 });
    expect(res.cookie).toHaveBeenCalledTimes(2);
  });

  it('refuses a refresh without the cookie and clears the cookies', async () => {
    const res = fakeResponse();
    await expect(controller.refresh({ cookies: {} } as never, res as never)).rejects.toBeInstanceOf(AuthError);
    expect(authService.refresh).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledWith(ACCESS_COOKIE, expect.objectContaining({ path: '/api' }));
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, expect.objectContaining({ path: '/api/auth' }));
  });

  it('clears the cookies when the refresh token is spent', async () => {
    authService.refresh.mockRejectedValue(AuthError.InvalidToken({ reason: 'REFRESH_TOKEN_REUSED' }));
    const res = fakeResponse();
    await expect(controller.refresh({ cookies: { [REFRESH_COOKIE]: 'old' } } as never, res as never)).rejects.toBeInstanceOf(AuthError);
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
  });

  it('keeps the cookies when the refresh fails on the server side', async () => {
    authService.refresh.mockRejectedValue(AuthError.InternalError({}));
    const res = fakeResponse();
    await expect(controller.refresh({ cookies: { [REFRESH_COOKIE]: 'old' } } as never, res as never)).rejects.toBeInstanceOf(AuthError);
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('logs out with the cookies and clears them', async () => {
    const res = fakeResponse();
    const req = { cookies: { [ACCESS_COOKIE]: 'a', [REFRESH_COOKIE]: 'r' } };
    await expect(controller.logout(req as never, res as never)).resolves.toEqual({ success: true });
    expect(authService.logout).toHaveBeenCalledWith('a', 'r');
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
  });

  it('clears the cookies even when the logout itself fails', async () => {
    authService.logout.mockRejectedValue(new Error('disk'));
    const res = fakeResponse();
    await expect(controller.logout({ cookies: {} } as never, res as never)).rejects.toThrow('disk');
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
  });
});
