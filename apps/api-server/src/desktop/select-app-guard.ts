import { CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@config/config.service';
import { JwtAuthGuard } from '@token';
import { TokenBlacklistService } from '@token/token-blacklist.service';
import { DesktopUserGuard } from './desktop-user.guard';

/**
 * The app's global guard, from the same ConfigService value main.ts picks
 * the listen mode by: no app login only in desktop mode, which listens on
 * the desktop app's socket alone.
 */
export const selectAppGuard = (
  configService: ConfigService,
  reflector: Reflector,
  jwt: JwtService,
  tokenBlacklist: TokenBlacklistService
): CanActivate =>
  configService.isDesktopMode()
    ? new DesktopUserGuard(reflector)
    : new JwtAuthGuard(reflector, jwt, tokenBlacklist);
