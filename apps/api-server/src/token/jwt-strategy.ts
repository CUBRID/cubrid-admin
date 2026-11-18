import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@config/config.service';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthError } from '@error/auth/auth-error';
import { AccountAccessService, sameAccount } from '@account/account-access.service';
import { TokenBlacklistService } from './token-blacklist.service';

export type AccessTokenPayload = {
  sub?: string;
  jti?: string;
  type?: string;
  exp?: number;
  /** The account's session version when the token was issued; absent = 0. */
  sv?: number;
  /** The account record's uuid when issued; absent in tokens from before it. */
  uid?: string;
};

/** req.user on an authenticated request. */
export type AuthenticatedUser = AccessTokenPayload & {
  sub: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly accountAccess: AccountAccessService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getSecretKey(),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    if (payload.type !== 'access') {
      throw AuthError.InvalidToken({ reason: 'INVALID_TOKEN_TYPE' });
    }

    if (payload.jti && (await this.tokenBlacklistService.isBlacklisted(payload.jti))) {
      throw AuthError.InvalidToken({ reason: 'TOKEN_REVOKED' });
    }

    if (!payload.sub) {
      throw AuthError.InvalidToken({ reason: 'INVALID_TOKEN_SUBJECT' });
    }

    // A token outlives changes to its account (it lasts a day), so the
    // account is checked on every request: deleted, disabled, or its
    // sessions ended by an admin (password reset raises sessionVersion).
    const access = await this.accountAccess.get(payload.sub);
    // A deleted account whose name was taken again is gone all the same.
    if (!access.exists || !sameAccount(payload.uid, access)) {
      throw AuthError.InvalidToken({ userId: payload.sub, reason: 'ACCOUNT_NOT_FOUND' });
    }
    if (access.disabled) {
      throw AuthError.InvalidToken({ userId: payload.sub, reason: 'ACCOUNT_DISABLED' });
    }
    if ((payload.sv ?? 0) !== access.sessionVersion) {
      throw AuthError.InvalidToken({ userId: payload.sub, reason: 'SESSION_REVOKED' });
    }

    return {
      ...payload,
      sub: payload.sub,
      isAdmin: access.isAdmin,
      mustChangePassword: access.mustChangePassword,
    };
  }
}
