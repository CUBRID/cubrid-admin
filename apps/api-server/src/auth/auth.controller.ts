import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { UserDTO } from '@type/index';
import { LoginResponse, SessionResponse } from '@api-interfaces';
import { NotOnDesktop, Public } from '@common';
import { AuthError, AuthErrorCode } from '@error/auth/auth-error';
import {
  clearAuthCookies,
  readAccessCookie,
  readRefreshCookie,
  setAuthCookies,
} from '@token/auth-cookies';
import { ACCESS_TOKEN_EXPIRES_SEC, REFRESH_RETRY_AFTER_SEC } from '@token/token.constants';
import { AuthThrottlerGuard } from './auth-throttle';

// The desktop app has no app login (DesktopUserGuard).
// The tokens travel only in httpOnly cookies (auth-cookies.ts); the body
// carries the access token's lifetime so the page can refresh before it ends.
@NotOnDesktop()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('login')
  async login(
    @Body() userDTO: UserDTO,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request
  ): Promise<LoginResponse> {
    const tokens = await this.authService.login(userDTO);
    setAuthCookies(req, res, tokens);
    return { expiresIn: tokens.expiresIn };
  }

  @Public()
  // Not rate limited: it needs the signed refresh cookie (auth-throttle.ts).
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<LoginResponse> {
    const refreshToken = readRefreshCookie(req);
    try {
      if (!refreshToken) {
        throw AuthError.InvalidToken({ reason: 'REFRESH_TOKEN_MISSING' });
      }
      const tokens = await this.authService.refresh(refreshToken);
      setAuthCookies(req, res, tokens);
      return { expiresIn: tokens.expiresIn };
    } catch (err) {
      // A refresh token that is missing, spent or revoked ends the session;
      // a server fault leaves the cookies for the next try.
      if (err instanceof AuthError && err.code === AuthErrorCode.INVALID_TOKEN) clearAuthCookies(req, res);
      if (err instanceof AuthError && err.code === AuthErrorCode.REFRESH_IN_PROGRESS) {
        res.setHeader('Retry-After', String(REFRESH_RETRY_AFTER_SEC));
      }
      throw err;
    }
  }

  // The session the access cookie holds (the guard checked it): the page
  // asks when it opens, since it keeps the session's expiry in localStorage,
  // which another port of the same host name does not share.
  @Get('session')
  session(@Req() req: Request): SessionResponse {
    const payload = (req as Request & { user?: { sub?: string; iat?: number; exp?: number } }).user ?? {};
    const now = Math.floor(Date.now() / 1000);
    const exp = payload.exp ?? now;
    return {
      expiresIn: payload.iat && exp > payload.iat ? exp - payload.iat : ACCESS_TOKEN_EXPIRES_SEC,
      expiresLeft: Math.max(0, exp - now),
      user: payload.sub ?? '',
    };
  }

  // Public: an expired access token must still end the session.
  @Public()
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ success: true }> {
    try {
      await this.authService.logout(readAccessCookie(req), readRefreshCookie(req));
    } finally {
      clearAuthCookies(req, res);
    }
    return { success: true };
  }

  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('register')
  async register(@Body() userDTO: UserDTO): Promise<void> {
    await this.authService.register(userDTO);
  }
}
