import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { UserDTO } from '@type/index';
import { LoginResponse } from '@api-interfaces';
import { NotOnDesktop, Public } from '@common';
import { AuthError, AuthErrorCode } from '@error/auth/auth-error';
import {
  clearAuthCookies,
  readAccessCookie,
  readRefreshCookie,
  setAuthCookies,
} from '@token/auth-cookies';
import { REFRESH_RETRY_AFTER_SEC } from '@token/token.constants';
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
    @Res({ passthrough: true }) res: Response
  ): Promise<LoginResponse> {
    const tokens = await this.authService.login(userDTO);
    setAuthCookies(res, tokens);
    return { expiresIn: tokens.expiresIn };
  }

  @Public()
  @UseGuards(AuthThrottlerGuard)
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
      setAuthCookies(res, tokens);
      return { expiresIn: tokens.expiresIn };
    } catch (err) {
      // A refresh token that is missing, spent or revoked ends the session;
      // a server fault leaves the cookies for the next try.
      if (err instanceof AuthError && err.code === AuthErrorCode.INVALID_TOKEN) clearAuthCookies(res);
      if (err instanceof AuthError && err.code === AuthErrorCode.REFRESH_IN_PROGRESS) {
        res.setHeader('Retry-After', String(REFRESH_RETRY_AFTER_SEC));
      }
      throw err;
    }
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
      clearAuthCookies(res);
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
