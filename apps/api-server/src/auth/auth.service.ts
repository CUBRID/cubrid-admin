import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { ConfigService } from '@config/config.service';
import { PasswordService } from '@security';
import { User, UserDTO } from '@type/index';
import { UserRepositoryService } from '@repository';
import { AuthError } from '@error/auth/auth-error';
import { UserError } from '@error/user/user-error';
import { HandleAuthErrors } from '@common';
import { passwordValidityChecker } from '@util';
import {
  ACCESS_TOKEN_EXPIRES,
  ACCESS_TOKEN_EXPIRES_SEC,
  REFRESH_TOKEN_EXPIRES_MS,
} from '@token/token.constants';
import { AuthTokens } from '@token/auth-cookies';
import { RefreshTokenService } from '@token/refresh-token.service';
import { TokenBlacklistService } from '@token/token-blacklist.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepo: UserRepositoryService,
    private readonly jwt: JwtService,
    private readonly password: PasswordService,
    private readonly configService: ConfigService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly tokenBlacklistService: TokenBlacklistService
  ) {}

  @HandleAuthErrors()
  async login(dto: UserDTO): Promise<AuthTokens> {
    // Both branches throw the same AuthError.InvalidCredentials (not
    // UserError.UserNotFound) so the client message doesn't leak whether the
    // username or the password was wrong ("User not found" reads as if the
    // username itself doesn't exist, which is misleading for a wrong-password case).
    const user: User | null = await this.usersRepo.loadUserById(dto.id);
    if (!user) {
      throw AuthError.InvalidCredentials({ userId: dto.id });
    }

    const ok = await this.password.comparePlainAndHash(dto.password, user.password);
    if (!ok) {
      throw AuthError.InvalidCredentials({ userId: dto.id });
    }

    return this.issueTokenPair(user.id);
  }

  @HandleAuthErrors()
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const consumeResult = await this.refreshTokenService.consumeForRotation(refreshToken);
    if (consumeResult.kind === 'reused') {
      await this.revokeFamily(consumeResult.familyId);
      throw AuthError.InvalidToken({ reason: 'REFRESH_TOKEN_REUSED' });
    }
    if (consumeResult.kind === 'busy') {
      // Not the token's fault: the cookies stay for the next try (503).
      throw AuthError.RefreshInProgress();
    }
    if (consumeResult.kind === 'invalid') {
      throw AuthError.InvalidToken({ reason: 'REFRESH_TOKEN_INVALID' });
    }

    const { session } = consumeResult;
    // A logout (or a reuse) revoked the family while this token was being
    // rotated: it gets no new pair.
    if (await this.tokenBlacklistService.isFamilyRevoked(session.record.familyId)) {
      await this.refreshTokenService.commitConsume(session);
      throw AuthError.InvalidToken({ reason: 'REFRESH_FAMILY_REVOKED' });
    }
    try {
      const tokens = await this.issueTokenPair(session.record.userId, session.record.familyId);
      await this.refreshTokenService.commitConsume(session, tokens.refreshToken);
      return tokens;
    } catch (err) {
      await this.refreshTokenService.rollbackConsume(session);
      throw err;
    }
  }

  /**
   * Ends the session the browser's cookies hold: the whole refresh family,
   * found from the refresh token even when it was already rotated, so no
   * token of the session (refresh or access, nor one let in by the reuse
   * grace) works afterwards. Works with an expired or missing access token.
   */
  @HandleAuthErrors()
  async logout(accessToken?: string, refreshToken?: string): Promise<void> {
    const families = new Set<string>();
    if (accessToken) {
      const payload = await this.jwt
        .verifyAsync<{ jti?: string; exp?: number; type?: string; fam?: string }>(accessToken)
        .catch(() => null);
      // An expired or forged token needs no blacklist entry.
      if (payload?.type === 'access' && payload.jti && payload.exp) {
        await this.tokenBlacklistService.add(payload.jti, new Date(payload.exp * 1000));
        if (payload.fam) families.add(payload.fam);
      }
    }
    if (refreshToken) {
      const family = await this.refreshTokenService.familyOf(refreshToken);
      if (family) families.add(family);
      else await this.refreshTokenService.revoke(refreshToken);
    }
    for (const family of families) {
      await this.revokeFamily(family);
    }
  }

  /** Every refresh token of the family, and every access token issued with them. */
  private async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokenService.revokeFamily(familyId);
    // As long as a refresh token: one written by a rotation that ran during
    // logout must not bring the session back later.
    await this.tokenBlacklistService.revokeFamily(familyId, REFRESH_TOKEN_EXPIRES_MS);
  }

  @HandleAuthErrors()
  async register(dto: UserDTO): Promise<void> {
    if (!this.configService.isAuthRegistrationEnabled()) {
      throw AuthError.PermissionDenied({ reason: 'AUTH_REGISTRATION_DISABLED' });
    }

    if (!passwordValidityChecker(dto.password)) {
      throw UserError.BadNewPassword({ userId: dto.id });
    }

    await this.usersRepo.createUser(dto);
  }

  private async issueTokenPair(userId: string, familyId?: string): Promise<AuthTokens> {
    const jti = randomUUID();
    // The refresh token first: its family goes into the access token (fam),
    // so a logout or a reuse can revoke both.
    const { token: refreshToken, familyId: fam } = await this.refreshTokenService.create(userId, familyId);
    const token = await this.jwt.signAsync(
      { sub: userId, jti, type: 'access', fam },
      { expiresIn: ACCESS_TOKEN_EXPIRES }
    );
    return { token, refreshToken, expiresIn: ACCESS_TOKEN_EXPIRES_SEC };
  }
}
