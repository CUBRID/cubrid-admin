import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Controller, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from '../auth/auth.controller';
import { AuthError, AuthErrorCode } from '@error/auth/auth-error';
import { DesktopUserGuard } from '../desktop/desktop-user.guard';
import { selectAppGuard } from '../desktop/select-app-guard';
import { ConfigService } from '@config/config.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CSRF_HEADER, authCookieNames, resetAuthCookieNamesForTest } from './auth-cookies';
import { TokenBlacklistService } from './token-blacklist.service';

// The cookie names come from an id kept in the storage; a temporary one here.
const mockStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-guard-'));
jest.mock('../util/resolve-storage-path', () => ({ getStoragePath: () => mockStorage }));
afterAll(() => fs.rmSync(mockStorage, { recursive: true, force: true }));

const SECRET = 'guard-spec-secret';
const jwt = new JwtService({ secret: SECRET });
const blacklist = {
  isBlacklisted: jest.fn().mockResolvedValue(false),
  isFamilyRevoked: jest.fn().mockResolvedValue(false),
};
const newGuard = () => new JwtAuthGuard(new Reflector(), jwt, blacklist as unknown as TokenBlacklistService);

@Controller('host')
class HostController {
  @Get()
  list() {
    return [];
  }
}

const contextFor = (controller: object, handler: (...args: never[]) => unknown, request: Record<string, unknown>) =>
  new ExecutionContextHost([request, {}], controller as never, handler);
const authRoute = (handler: (...args: never[]) => unknown, request: Record<string, unknown>) =>
  contextFor(AuthController, handler, request);
const hostRoute = (request: Record<string, unknown>) => contextFor(HostController, HostController.prototype.list, request);

const rejection = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (err) {
    return err as AuthError;
  }
  return null;
};

let ACCESS = '';
beforeAll(() => {
  resetAuthCookieNamesForTest();
  ACCESS = authCookieNames().access;
});
beforeEach(() => {
  blacklist.isBlacklisted.mockReset().mockResolvedValue(false);
  blacklist.isFamilyRevoked.mockReset().mockResolvedValue(false);
});

describe('JwtAuthGuard CSRF header', () => {
  it.each([
    ['login', AuthController.prototype.login],
    ['logout', AuthController.prototype.logout],
    ['refresh', AuthController.prototype.refresh],
  ])('refuses POST %s without the header, though the route is public', async (_name, handler) => {
    const err = await rejection(() => newGuard().canActivate(authRoute(handler, { method: 'POST', headers: {} })));
    expect(err).toBeInstanceOf(AuthError);
    expect(err?.code).toBe(AuthErrorCode.PERMISSION_DENIED);
    expect(err?.additionalData).toEqual({ reason: 'CSRF_HEADER_MISSING' });
  });

  it('refuses a header with another value', async () => {
    const request = { method: 'POST', headers: { [CSRF_HEADER]: 'yes' } };
    expect(await rejection(() => newGuard().canActivate(authRoute(AuthController.prototype.login, request)))).toBeInstanceOf(AuthError);
  });

  it('lets POST login through with the header', async () => {
    const request = { method: 'POST', headers: { [CSRF_HEADER]: '1' } };
    await expect(newGuard().canActivate(authRoute(AuthController.prototype.login, request))).resolves.toBe(true);
  });

  it('does not ask GET for the header', async () => {
    const request = { method: 'GET', headers: {} };
    await expect(newGuard().canActivate(authRoute(AuthController.prototype.login, request))).resolves.toBe(true);
  });

  it('checks the header before the token: a POST without it is 403 even with a valid cookie', async () => {
    const token = await jwt.signAsync({ sub: 'u1', jti: 'j1', type: 'access' });
    const err = await rejection(() => newGuard().canActivate(hostRoute({ method: 'POST', headers: {}, cookies: { [ACCESS]: token } })));
    expect(err?.code).toBe(AuthErrorCode.PERMISSION_DENIED);
  });
});

describe('JwtAuthGuard access token', () => {
  const invalid = async (request: Record<string, unknown>) => {
    const err = await rejection(() => newGuard().canActivate(hostRoute({ method: 'GET', headers: {}, ...request })));
    expect(err).toBeInstanceOf(AuthError);
    expect(err?.code).toBe(AuthErrorCode.INVALID_TOKEN);
    // The same answer for every failure, as before.
    expect(err?.additionalData).toEqual({ userId: 'unknown' });
  };

  it('lets a valid access token in and puts its payload on the request', async () => {
    const token = await jwt.signAsync({ sub: 'u1', jti: 'j1', type: 'access' });
    const request: Record<string, unknown> = { method: 'GET', headers: {}, cookies: { [ACCESS]: token } };
    await expect(newGuard().canActivate(hostRoute(request))).resolves.toBe(true);
    expect(request.user).toEqual(expect.objectContaining({ sub: 'u1', jti: 'j1', type: 'access' }));
    expect(blacklist.isBlacklisted).toHaveBeenCalledWith('j1');
  });

  it('refuses a request without the cookie', async () => {
    await invalid({ cookies: {} });
  });

  it('does not read a Bearer header', async () => {
    const token = await jwt.signAsync({ sub: 'u1', jti: 'j1', type: 'access' });
    await invalid({ headers: { authorization: `Bearer ${token}` }, cookies: {} });
  });

  it('refuses an expired token', async () => {
    const token = await jwt.signAsync({ sub: 'u1', jti: 'j1', type: 'access' }, { expiresIn: -10 });
    await invalid({ cookies: { [ACCESS]: token } });
  });

  it('refuses a token signed with another secret', async () => {
    const token = await new JwtService({ secret: 'other' }).signAsync({ sub: 'u1', jti: 'j1', type: 'access' });
    await invalid({ cookies: { [ACCESS]: token } });
  });

  it('refuses a token that is not an access token', async () => {
    const token = await jwt.signAsync({ sub: 'u1', jti: 'j1', type: 'refresh' });
    await invalid({ cookies: { [ACCESS]: token } });
  });

  it('refuses a token revoked at logout', async () => {
    blacklist.isBlacklisted.mockResolvedValue(true);
    const token = await jwt.signAsync({ sub: 'u1', jti: 'j1', type: 'access' });
    await invalid({ cookies: { [ACCESS]: token } });
  });

  it('refuses a token whose session family was revoked', async () => {
    blacklist.isFamilyRevoked.mockImplementation(async (family?: string) => family === 'f1');
    const token = await jwt.signAsync({ sub: 'u1', jti: 'j1', type: 'access', fam: 'f1' });
    await invalid({ cookies: { [ACCESS]: token } });
    expect(blacklist.isFamilyRevoked).toHaveBeenCalledWith('f1');
  });

  it('refuses the token when the revocation list cannot be read', async () => {
    blacklist.isBlacklisted.mockRejectedValue(new Error('disk'));
    const token = await jwt.signAsync({ sub: 'u1', jti: 'j1', type: 'access' });
    await invalid({ cookies: { [ACCESS]: token } });
  });
});

describe('desktop mode CSRF header', () => {
  it('is not checked: the desktop guard lets a POST without it in', () => {
    const guard = selectAppGuard({ isDesktopMode: () => true } as ConfigService, new Reflector(), jwt, blacklist as never);
    expect(guard).toBeInstanceOf(DesktopUserGuard);
    const request: Record<string, unknown> = { method: 'POST', headers: {} };
    expect(guard.canActivate(contextFor(HostController, HostController.prototype.list, request))).toBe(true);
  });
});
