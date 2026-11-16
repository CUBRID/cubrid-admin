import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@config/config.service';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { AuthError } from '@error/auth/auth-error';
import { TokenBlacklistService } from './token-blacklist.service';
import { ACCESS_COOKIE, readCookie } from './auth-cookies';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly tokenBlacklistService: TokenBlacklistService
  ) {
    super({
      // Only the httpOnly cookie: page scripts never hold the token.
      jwtFromRequest: (req: Request) => readCookie(req, ACCESS_COOKIE) ?? null,
      ignoreExpiration: false,
      secretOrKey: config.getSecretKey(),
    });
  }

  async validate(payload: { sub?: string; jti?: string; type?: string; exp?: number }) {
    if (payload.type !== 'access') {
      throw AuthError.InvalidToken({ reason: 'INVALID_TOKEN_TYPE' });
    }

    if (payload.jti && (await this.tokenBlacklistService.isBlacklisted(payload.jti))) {
      throw AuthError.InvalidToken({ reason: 'TOKEN_REVOKED' });
    }

    return payload;
  }
}
