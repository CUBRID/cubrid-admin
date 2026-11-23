import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigService } from '@config/config.service';
import { AUTH_THROTTLE_OPTIONS } from './auth-throttle';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthError } from '@error/auth/auth-error';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { authCookieNames, cookieSecureFor, resetAuthCookieNamesForTest } from '@token/auth-cookies';

// The cookie names come from an id kept in the storage; a temporary one here.
const mockStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-auth-cookies-'));
jest.mock('../util/resolve-storage-path', () => ({ getStoragePath: () => mockStorage }));
let ACCESS_COOKIE = '';
let REFRESH_COOKIE = '';
beforeAll(() => {
  resetAuthCookieNamesForTest();
  ({ access: ACCESS_COOKIE, refresh: REFRESH_COOKIE } = authCookieNames());
});
afterAll(() => fs.rmSync(mockStorage, { recursive: true, force: true }));

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
      // The login rate limit guard on its routes needs these.
      imports: [ThrottlerModule.forRoot(AUTH_THROTTLE_OPTIONS)],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: ConfigService, useValue: { isDesktopMode: () => false } },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('sets both tokens as httpOnly, Secure, SameSite=Strict cookies and keeps them out of the body', async () => {
    const res = fakeResponse();
    const body = await controller.login({ id: 'u', password: 'p' } as never, res as never, { headers: {} } as never);

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

  it('names the cookies with a tag of this installation, the same on every start', () => {
    expect(ACCESS_COOKIE).toMatch(/^cwm_access_[0-9a-f]{12}$/);
    expect(REFRESH_COOKIE).toBe(ACCESS_COOKIE.replace('cwm_access_', 'cwm_refresh_'));
    const id = fs.readFileSync(path.join(mockStorage, 'instance-id'), 'utf8');
    expect(ACCESS_COOKIE).not.toContain(id.slice(0, 12));
    resetAuthCookieNamesForTest();
    expect(authCookieNames().access).toBe(ACCESS_COOKIE);
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

  it('keeps the cookies and asks to retry when the same token is still rotating', async () => {
    authService.refresh.mockRejectedValue(AuthError.RefreshInProgress());
    const res = { ...fakeResponse(), setHeader: jest.fn() };
    await expect(controller.refresh({ cookies: { [REFRESH_COOKIE]: 'old' } } as never, res as never)).rejects.toBeInstanceOf(AuthError);
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '1');
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

  it('says how long the session of the access cookie lasts, how much is left and whose it is', () => {
    const now = 1_790_000_000;
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now * 1000);
    const req = { user: { sub: 'alice', iat: now - 3600, exp: now - 3600 + 86400 } };
    expect(controller.session(req as never)).toEqual({ expiresIn: 86400, expiresLeft: 86400 - 3600, user: 'alice' });
    clock.mockRestore();
  });

  describe('behind an http reverse proxy', () => {
    const fromPage = (headers: Record<string, string>, cookies: Record<string, string> = {}) => ({ headers, cookies });
    const secureOf = (mock: jest.Mock) => mock.mock.calls.map((call) => call[2]?.secure ?? call[1]?.secure);

    it('drops Secure only when the browser sends an http page origin', () => {
      expect(cookieSecureFor(fromPage({ origin: 'http://cwm.example' }) as never)).toBe(false);
      expect(cookieSecureFor(fromPage({ referer: 'http://cwm.example/login' }) as never)).toBe(false);
      expect(cookieSecureFor(fromPage({ origin: 'https://cwm.example' }) as never)).toBe(true);
      // Origin wins over Referer.
      expect(cookieSecureFor(fromPage({ origin: 'https://cwm.example', referer: 'http://cwm.example/' }) as never)).toBe(true);
      // No header, 'null' (sandboxed or opaque) or something unreadable keeps Secure.
      expect(cookieSecureFor(fromPage({}) as never)).toBe(true);
      expect(cookieSecureFor(fromPage({ origin: 'null' }) as never)).toBe(true);
      expect(cookieSecureFor(fromPage({ origin: 'not a url' }) as never)).toBe(true);
      // A proxy header from the client is not believed.
      expect(cookieSecureFor(fromPage({ 'x-forwarded-proto': 'http' }) as never)).toBe(true);
    });

    it('logs in, refreshes and logs out with the cookies not Secure for an http page, the rest unchanged', async () => {
      const http = { origin: 'http://cwm.example' };
      const login = fakeResponse();
      await controller.login({ id: 'u', password: 'p' } as never, login as never, fromPage(http) as never);
      expect(secureOf(login.cookie)).toEqual([false, false]);
      expect(login.cookie).toHaveBeenCalledWith(ACCESS_COOKIE, 'access-jwt', expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/api' }));

      const refresh = fakeResponse();
      await controller.refresh(fromPage(http, { [REFRESH_COOKIE]: 'old' }) as never, refresh as never);
      expect(secureOf(refresh.cookie)).toEqual([false, false]);

      // Cleared with the same flags they were set with, or the browser would keep them.
      const logout = fakeResponse();
      await controller.logout(fromPage(http, { [ACCESS_COOKIE]: 'a', [REFRESH_COOKIE]: 'r' }) as never, logout as never);
      expect(secureOf(logout.clearCookie)).toEqual([false, false]);
    });

    it('keeps Secure for an https page', async () => {
      const res = fakeResponse();
      await controller.login({ id: 'u', password: 'p' } as never, res as never, fromPage({ origin: 'https://cwm.example' }) as never);
      expect(secureOf(res.cookie)).toEqual([true, true]);
    });
  });
});
