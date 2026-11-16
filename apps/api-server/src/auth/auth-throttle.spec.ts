import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { Public } from '@common';
import { ConfigService } from '@config/config.service';
import { GlobalExceptionFilter } from '@error/global-filter';
import { selectAppGuard } from '../desktop/select-app-guard';
import { TokenBlacklistService } from '@token/token-blacklist.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AUTH_THROTTLE_LIMIT, AUTH_THROTTLE_OPTIONS, AuthThrottlerGuard } from './auth-throttle';

const mockStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-throttle-'));
jest.mock('../util/resolve-storage-path', () => ({ getStoragePath: () => mockStorage }));
afterAll(() => fs.rmSync(mockStorage, { recursive: true, force: true }));

// A screen's polling read: public here so the test needs no session.
@Controller('poll')
class PollController {
  @Public()
  @Get()
  read() {
    return { ok: true };
  }
}

const tokens = { token: 'a', refreshToken: 'r', expiresIn: 86400 };

describe('login rate limit (AuthThrottlerGuard)', () => {
  let app: INestApplication;
  const authService = { login: jest.fn().mockResolvedValue(tokens) };
  const config = { isDesktopMode: () => false };

  beforeEach(async () => {
    authService.login.mockClear();
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(AUTH_THROTTLE_OPTIONS)],
      controllers: [AuthController, PollController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: ConfigService, useValue: config },
        { provide: JwtService, useValue: new JwtService({ secret: 's' }) },
        { provide: TokenBlacklistService, useValue: { isBlacklisted: async () => false } },
        { provide: APP_GUARD, useFactory: selectAppGuard, inject: [ConfigService, Reflector, JwtService, TokenBlacklistService] },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterEach(() => app.close());

  const login = (withHeader = true) => {
    const req = request(app.getHttpServer()).post('/auth/login').send({ id: 'u', password: 'p' });
    return withHeader ? req.set('X-CWM-Request', '1') : req;
  };

  it('answers 429 with Retry-After after the limit, and lets polling through', async () => {
    for (let i = 0; i < AUTH_THROTTLE_LIMIT; i += 1) {
      expect((await login()).status).toBe(201);
    }
    const over = await login();
    expect(over.status).toBe(429);
    expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
    expect(authService.login).toHaveBeenCalledTimes(AUTH_THROTTLE_LIMIT);

    // Screens keep polling: only the login routes are limited.
    for (let i = 0; i < 20; i += 1) {
      expect((await request(app.getHttpServer()).get('/poll')).status).toBe(200);
    }
  });

  it('refuses a request without the CSRF header first (403), without counting it', async () => {
    for (let i = 0; i < AUTH_THROTTLE_LIMIT + 5; i += 1) {
      expect((await login(false)).status).toBe(403);
    }
    expect(authService.login).not.toHaveBeenCalled();
    expect((await login()).status).toBe(201);
  });

  it('is skipped in desktop mode', async () => {
    const guardIn = (desktop: boolean) => {
      const guard = Object.create(AuthThrottlerGuard.prototype) as AuthThrottlerGuard;
      Object.defineProperty(guard, 'config', { value: { isDesktopMode: () => desktop } });
      return guard as unknown as { shouldSkip: () => Promise<boolean> };
    };
    await expect(guardIn(true).shouldSkip()).resolves.toBe(true);
    await expect(guardIn(false).shouldSkip()).resolves.toBe(false);
  });
});
