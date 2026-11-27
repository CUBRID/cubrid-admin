import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { ConfigService } from '@config/config.service';
import { AccountAccessService, sameAccount } from '@account/account-access.service';
import { isValidAccountId } from '@account/account-id';
import { AccountSettingsService } from '@account/account-settings.service';
import { PasswordService } from '@security';
import { User, UserDTO } from '@type/index';
import { UserRepositoryService } from '@repository';
import { AuthError } from '@error/auth/auth-error';
import { UserError } from '@error/user/user-error';
import { HandleAuthErrors } from '@common';
import { passwordValidityChecker } from '@util';
import { RegisterResponse } from '@api-interfaces';
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
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersRepo: UserRepositoryService,
    private readonly jwt: JwtService,
    private readonly password: PasswordService,
    private readonly configService: ConfigService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly accountAccess: AccountAccessService,
    private readonly accountSettings: AccountSettingsService
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

    // Only after the password matched, so it doesn't reveal which ids exist.
    if (user.status === 'disabled') {
      throw AuthError.AccountDisabled({ userId: dto.id });
    }
    if (user.status === 'pending') {
      throw AuthError.AccountPendingApproval({ userId: dto.id });
    }

    await this.recordLogin(user.id);
    return this.issueTokenPair(user.id, undefined, user.sessionVersion ?? 0, user.uuid);
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

    // A refresh token lasts two weeks: the account it belongs to may have
    // been deleted, disabled, or had its sessions ended since.
    const access = await this.accountAccess.get(session.record.userId);
    const revokedReason = !access.exists || !sameAccount(session.record.accountUuid, access)
      ? 'ACCOUNT_NOT_FOUND'
      : access.disabled
        ? 'ACCOUNT_DISABLED'
        : (session.record.sessionVersion ?? 0) !== access.sessionVersion
          ? 'SESSION_REVOKED'
          : null;
    if (revokedReason) {
      await this.refreshTokenService.commitConsume(session);
      await this.revokeFamily(session.record.familyId);
      throw AuthError.InvalidToken({ userId: session.record.userId, reason: revokedReason });
    }

    try {
      const tokens = await this.issueTokenPair(
        session.record.userId,
        session.record.familyId,
        access.sessionVersion,
        access.uuid
      );
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
   * Returns the user a valid access token named, for the API log.
   */
  @HandleAuthErrors()
  async logout(accessToken?: string, refreshToken?: string): Promise<string | undefined> {
    const families = new Set<string>();
    let userId: string | undefined;
    if (accessToken) {
      const payload = await this.jwt
        .verifyAsync<{ sub?: string; jti?: string; exp?: number; type?: string; fam?: string }>(accessToken)
        .catch(() => null);
      // An expired or forged token needs no blacklist entry.
      if (payload?.type === 'access' && payload.jti && payload.exp) {
        userId = payload.sub;
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
    return userId;
  }

  /** Every refresh token of the family, and every access token issued with them. */
  private async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokenService.revokeFamily(familyId);
    // As long as a refresh token: one written by a rotation that ran during
    // logout must not bring the session back later.
    await this.tokenBlacklistService.revokeFamily(familyId, REFRESH_TOKEN_EXPIRES_MS);
  }

  async isRegistrationEnabled(): Promise<boolean> {
    return this.accountSettings.isRegistrationEnabled();
  }

  @HandleAuthErrors()
  async register(dto: UserDTO): Promise<RegisterResponse> {
    if (!(await this.accountSettings.isRegistrationEnabled())) {
      throw AuthError.PermissionDenied({ reason: 'AUTH_REGISTRATION_DISABLED' });
    }

    if (!isValidAccountId(dto.id)) {
      throw UserError.InvalidAccountId({ userId: dto.id });
    }

    // An ADMIN_USERS id is admin the moment it exists, so signing up with
    // one that has no account yet would hand admin rights to whoever got
    // there first. An admin can still create it in User Accounts.
    if (this.configService.getConfiguredAdmins().has(dto.id)) {
      throw AuthError.PermissionDenied({ userId: dto.id, reason: 'RESERVED_ADMIN_ID' });
    }

    if (!passwordValidityChecker(dto.password)) {
      throw UserError.BadNewPassword({ userId: dto.id });
    }

    // A sign-up is never an administrator: every install starts with the
    // built-in `admin` account (InitialAdminService), so nobody can become
    // one by signing up first.
    const status = (await this.accountSettings.needsApproval()) ? 'pending' : 'active';
    await this.usersRepo.createUser(dto, { role: 'user', status });
    if (status === 'pending') {
      this.logger.log(`Account "${dto.id}" signed up and waits for an administrator to approve it.`);
    }
    return { status };
  }

  /** Best-effort: a failure to note the time must not fail the login. */
  private async recordLogin(userId: string): Promise<void> {
    try {
      await this.usersRepo.atomicUpdateUser(userId, async (user) => {
        user.lastLoginAt = new Date().toISOString();
        return user;
      });
    } catch (err: unknown) {
      this.logger.warn(`Could not record login time for ${userId}: ${String(err)}`);
    }
  }

  private async issueTokenPair(
    userId: string,
    familyId: string | undefined,
    sessionVersion: number,
    accountUuid: string | undefined
  ): Promise<AuthTokens> {
    const jti = randomUUID();
    // The refresh token first: its family goes into the access token (fam),
    // so a logout or a reuse can revoke both.
    const { token: refreshToken, familyId: fam } = await this.refreshTokenService.create(
      userId,
      familyId,
      sessionVersion,
      accountUuid
    );
    const token = await this.jwt.signAsync(
      {
        sub: userId,
        jti,
        type: 'access',
        fam,
        sv: sessionVersion,
        ...(accountUuid ? { uid: accountUuid } : {}),
      },
      { expiresIn: ACCESS_TOKEN_EXPIRES }
    );
    return { token, refreshToken, expiresIn: ACCESS_TOKEN_EXPIRES_SEC };
  }
}
