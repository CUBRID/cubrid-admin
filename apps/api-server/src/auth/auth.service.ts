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
import { AuthTokens, CreateLoginResponse, RegisterResponse } from '@api-interfaces';
import {
  ACCESS_TOKEN_EXPIRES,
  ACCESS_TOKEN_EXPIRES_SEC,
} from '@token/token.constants';
import { RefreshTokenService } from '@token/refresh-token.service';
import { TokenBlacklistService } from '@token/token-blacklist.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // Serializes registrations so two sign-ups on a fresh install can't both
  // see "no accounts yet" and both become admin.
  private static registration: Promise<void> = Promise.resolve();

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
      await this.refreshTokenService.revokeFamily(consumeResult.familyId);
      throw AuthError.InvalidToken({ reason: 'REFRESH_TOKEN_REUSED' });
    }
    if (consumeResult.kind === 'invalid') {
      throw AuthError.InvalidToken({ reason: 'REFRESH_TOKEN_INVALID' });
    }

    const { session } = consumeResult;

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
      await this.refreshTokenService.revokeFamily(session.record.familyId);
      throw AuthError.InvalidToken({ userId: session.record.userId, reason: revokedReason });
    }

    try {
      const tokens = await this.issueTokenPair(
        session.record.userId,
        session.record.familyId,
        access.sessionVersion,
        access.uuid
      );
      await this.refreshTokenService.commitConsume(session);
      return tokens;
    } catch (err) {
      await this.refreshTokenService.rollbackConsume(session);
      throw err;
    }
  }

  @HandleAuthErrors()
  async logout(
    accessJti: string | undefined,
    accessExp: number | undefined,
    refreshToken?: string
  ): Promise<void> {
    if (accessJti && accessExp) {
      await this.tokenBlacklistService.add(accessJti, new Date(accessExp * 1000));
    }
    if (refreshToken) {
      await this.refreshTokenService.revoke(refreshToken);
    }
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

    const run = AuthService.registration.then(async (): Promise<RegisterResponse> => {
      // A fresh install's first account is its admin. An install that
      // already has accounts never promotes a newcomer this way.
      const firstAccount = (await this.usersRepo.listUsers()).length === 0;
      // The first account has no admin to approve it, so needsApproval says no.
      const status = !firstAccount && (await this.accountSettings.needsApproval()) ? 'pending' : 'active';
      await this.usersRepo.createUser(dto, { role: firstAccount ? 'admin' : 'user', status });
      AccountSettingsService.adminsChanged();
      if (firstAccount) {
        this.logger.log(`First account "${dto.id}" registered as administrator.`);
      } else if (status === 'pending') {
        this.logger.log(`Account "${dto.id}" signed up and waits for an administrator to approve it.`);
      }
      return { status };
    });
    AuthService.registration = run.then(() => undefined, () => undefined);
    return run;
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
    const token = await this.jwt.signAsync(
      { sub: userId, jti, type: 'access', sv: sessionVersion, ...(accountUuid ? { uid: accountUuid } : {}) },
      { expiresIn: ACCESS_TOKEN_EXPIRES }
    );
    const { token: refreshToken } = await this.refreshTokenService.create(
      userId,
      familyId,
      sessionVersion,
      accountUuid
    );
    return CreateLoginResponse(token, refreshToken, ACCESS_TOKEN_EXPIRES_SEC);
  }
}
