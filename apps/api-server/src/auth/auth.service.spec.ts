import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@config/config.service';
import { PasswordService } from '@security';
import { UserRepositoryService } from '@repository';
import { AuthError } from '@error/auth/auth-error';
import { RefreshTokenService } from '@token/refresh-token.service';
import { TokenBlacklistService } from '@token/token-blacklist.service';
import { AccountAccessService, AccountAccess } from '@account/account-access.service';
import { AccountSettingsService } from '@account/account-settings.service';
import { AuthService } from './auth.service';

const ACTIVE: AccountAccess = {
  exists: true,
  isAdmin: false,
  disabled: false,
  mustChangePassword: false,
  sessionVersion: 0,
};

describe('AuthService', () => {
  let service: AuthService;
  let jwt: jest.Mocked<JwtService>;
  let refreshTokenService: jest.Mocked<RefreshTokenService>;
  let tokenBlacklistService: jest.Mocked<TokenBlacklistService>;
  let usersRepo: jest.Mocked<UserRepositoryService>;
  let password: jest.Mocked<PasswordService>;
  let accountAccess: { get: jest.Mock };
  let accountSettings: { isRegistrationEnabled: jest.Mock; needsApproval: jest.Mock };
  let configuredAdmins: Set<string>;

  beforeEach(async () => {
    accountAccess = { get: jest.fn().mockResolvedValue(ACTIVE) };
    accountSettings = {
      isRegistrationEnabled: jest.fn().mockResolvedValue(true),
      needsApproval: jest.fn().mockResolvedValue(false),
    };
    configuredAdmins = new Set();
    jwt = { signAsync: jest.fn().mockResolvedValue('access-token') } as any;
    refreshTokenService = {
      create: jest.fn().mockResolvedValue({ token: 'refresh-token', familyId: 'family-1' }),
      consumeForRotation: jest.fn(),
      commitConsume: jest.fn().mockResolvedValue(undefined),
      rollbackConsume: jest.fn().mockResolvedValue(undefined),
      revoke: jest.fn().mockResolvedValue(undefined),
      revokeFamily: jest.fn().mockResolvedValue(undefined),
      familyOf: jest.fn().mockResolvedValue(null),
    } as any;
    tokenBlacklistService = {
      add: jest.fn().mockResolvedValue(undefined),
      revokeFamily: jest.fn().mockResolvedValue(undefined),
      isFamilyRevoked: jest.fn().mockResolvedValue(false),
    } as any;
    usersRepo = {
      loadUserById: jest.fn().mockResolvedValue({ id: 'user1', password: 'hash' }),
      atomicUpdateUser: jest.fn().mockResolvedValue({}),
      listUsers: jest.fn().mockResolvedValue([]),
      createUser: jest.fn().mockResolvedValue(undefined),
    } as any;
    password = {
      comparePlainAndHash: jest.fn().mockResolvedValue(true),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepositoryService, useValue: usersRepo },
        { provide: JwtService, useValue: jwt },
        { provide: PasswordService, useValue: password },
        {
          provide: ConfigService,
          useValue: {
            isAuthRegistrationEnabled: jest.fn().mockReturnValue(true),
            getConfiguredAdmins: jest.fn(() => configuredAdmins),
          },
        },
        { provide: RefreshTokenService, useValue: refreshTokenService },
        { provide: TokenBlacklistService, useValue: tokenBlacklistService },
        { provide: AccountAccessService, useValue: accountAccess },
        { provide: AccountSettingsService, useValue: accountSettings },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('issues access and refresh tokens on login', async () => {
    const result = await service.login({ id: 'user1', password: 'pw' });

    expect(result.token).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(result.expiresIn).toBe(86400);
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user1', type: 'access' }),
      expect.objectContaining({ expiresIn: '1d' })
    );
  });

  it('rotates refresh token on refresh', async () => {
    refreshTokenService.consumeForRotation.mockResolvedValue({
      kind: 'ok',
      session: {
        token: 'old-refresh',
        tokenHash: 'hash',
        lockPath: '/tmp/lock',
        record: {
          userId: 'user1',
          familyId: 'family-1',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          createdAt: new Date().toISOString(),
        },
      },
    });
    refreshTokenService.create.mockResolvedValue({ token: 'new-refresh', familyId: 'family-1' });

    const result = await service.refresh('old-refresh');

    expect(refreshTokenService.create).toHaveBeenCalledWith('user1', 'family-1', 0, undefined);
    // The new token is recorded as its successor, for the reuse grace.
    expect(refreshTokenService.commitConsume).toHaveBeenCalledWith(expect.objectContaining({ tokenHash: 'hash' }), 'new-refresh');
    expect(result.refreshToken).toBe('new-refresh');
  });

  it('rejects invalid refresh token', async () => {
    refreshTokenService.consumeForRotation.mockResolvedValue({ kind: 'invalid' });
    await expect(service.refresh('bad')).rejects.toBeInstanceOf(AuthError);
  });

  it('keeps the family and refuses with 503 (retry) while the same token is still rotating', async () => {
    refreshTokenService.consumeForRotation.mockResolvedValue({ kind: 'busy' });
    await expect(service.refresh('in-flight')).rejects.toMatchObject({ kind: 'AUTH', code: 'REFRESH_IN_PROGRESS' });
    expect(refreshTokenService.revokeFamily).not.toHaveBeenCalled();
  });

  it('revokes family when refresh token is reused', async () => {
    refreshTokenService.consumeForRotation.mockResolvedValue({
      kind: 'reused',
      familyId: 'family-1',
    });
    await expect(service.refresh('reused-token')).rejects.toBeInstanceOf(AuthError);
    expect(refreshTokenService.revokeFamily).toHaveBeenCalledWith('family-1');
    // Its access tokens too.
    expect(tokenBlacklistService.revokeFamily).toHaveBeenCalledWith('family-1', 14 * 86400 * 1000);
  });

  it('puts the refresh family into the access token (fam)', async () => {
    await service.login({ id: 'user1', password: 'pw' });
    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ fam: 'family-1' }), expect.anything());
  });

  it('logs out the whole family, from a refresh token already rotated', async () => {
    jwt.verifyAsync = jest.fn().mockResolvedValue({ jti: 'jti-2', exp: 1_700_000_000, type: 'access', fam: 'family-1' });
    refreshTokenService.familyOf.mockResolvedValue('family-1');

    await service.logout('access-2', 'rotated-refresh-2');

    expect(refreshTokenService.familyOf).toHaveBeenCalledWith('rotated-refresh-2');
    expect(refreshTokenService.revokeFamily).toHaveBeenCalledWith('family-1');
    expect(tokenBlacklistService.revokeFamily).toHaveBeenCalledWith('family-1', 14 * 86400 * 1000);
    expect(tokenBlacklistService.add).toHaveBeenCalledWith('jti-2', new Date(1_700_000_000 * 1000));
  });

  it('gives no new pair for a token rotating while its family was revoked', async () => {
    refreshTokenService.consumeForRotation.mockResolvedValue({
      kind: 'ok',
      session: { token: 't', tokenHash: 'h', lockPath: '/tmp/l', record: { userId: 'user1', familyId: 'family-1', expiresAt: '', createdAt: '' } },
    });
    tokenBlacklistService.isFamilyRevoked.mockResolvedValue(true);
    await expect(service.refresh('t')).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    expect(refreshTokenService.create).not.toHaveBeenCalled();
  });

  it('blacklists access token and revokes refresh on logout', async () => {
    jwt.verifyAsync = jest
      .fn()
      .mockResolvedValue({ jti: 'jti-1', exp: 1_700_000_000, type: 'access' });

    await service.logout('access-cookie', 'refresh-1');

    expect(jwt.verifyAsync).toHaveBeenCalledWith('access-cookie');
    expect(tokenBlacklistService.add).toHaveBeenCalledWith(
      'jti-1',
      new Date(1_700_000_000 * 1000)
    );
    expect(refreshTokenService.revoke).toHaveBeenCalledWith('refresh-1');
  });

  describe('account control', () => {
    const okSession = (sessionVersion?: number) => ({
      kind: 'ok' as const,
      session: {
        token: 'old-refresh',
        tokenHash: 'hash',
        lockPath: '/tmp/lock',
        record: {
          userId: 'user1',
          familyId: 'family-1',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          createdAt: new Date().toISOString(),
          ...(sessionVersion !== undefined ? { sessionVersion } : {}),
        },
      },
    });

    it('puts the session version in the access and refresh tokens', async () => {
      usersRepo.loadUserById.mockResolvedValue({ id: 'user1', password: 'hash', sessionVersion: 3 } as any);
      await service.login({ id: 'user1', password: 'pw' });

      expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ sv: 3 }), expect.anything());
      expect(refreshTokenService.create).toHaveBeenCalledWith('user1', undefined, 3, undefined);
    });

    it('records the login time', async () => {
      await service.login({ id: 'user1', password: 'pw' });
      const modifier = usersRepo.atomicUpdateUser.mock.calls[0][1];
      const user = await modifier({ id: 'user1' } as any);
      expect(typeof user.lastLoginAt).toBe('string');
    });

    it('still logs in when the login time cannot be recorded', async () => {
      usersRepo.atomicUpdateUser.mockRejectedValue(new Error('disk full'));
      await expect(service.login({ id: 'user1', password: 'pw' })).resolves.toMatchObject({ token: 'access-token' });
    });

    it('refuses a disabled account only after the password matched', async () => {
      usersRepo.loadUserById.mockResolvedValue({ id: 'user1', password: 'hash', status: 'disabled' } as any);
      await expect(service.login({ id: 'user1', password: 'pw' })).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
      expect(jwt.signAsync).not.toHaveBeenCalled();

      password.comparePlainAndHash.mockResolvedValue(false);
      await expect(service.login({ id: 'user1', password: 'wrong' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it.each([
      ['an older session version', { ...ACTIVE, sessionVersion: 1 }, undefined, 'SESSION_REVOKED'],
      ['a disabled account', { ...ACTIVE, disabled: true }, 0, 'ACCOUNT_DISABLED'],
      ['a deleted account', { ...ACTIVE, exists: false }, 0, 'ACCOUNT_NOT_FOUND'],
    ])('refuses a refresh for %s and revokes the family', async (_label, access, recordVersion, reason) => {
      accountAccess.get.mockResolvedValue(access);
      refreshTokenService.consumeForRotation.mockResolvedValue(okSession(recordVersion));

      await expect(service.refresh('old-refresh')).rejects.toMatchObject({
        code: 'INVALID_TOKEN',
        additionalData: expect.objectContaining({ reason }),
      });
      expect(refreshTokenService.revokeFamily).toHaveBeenCalledWith('family-1');
      expect(refreshTokenService.create).not.toHaveBeenCalled();
    });

    it('refreshes a token issued at the current session version', async () => {
      accountAccess.get.mockResolvedValue({ ...ACTIVE, sessionVersion: 2 });
      refreshTokenService.consumeForRotation.mockResolvedValue(okSession(2));

      await service.refresh('old-refresh');
      expect(refreshTokenService.create).toHaveBeenCalledWith('user1', 'family-1', 2, undefined);
    });

    it('never makes a sign-up an admin, even on an install with no accounts', async () => {
      await expect(service.register({ id: 'first', password: 'Passw0rd!' })).resolves.toEqual({ status: 'active' });
      expect(usersRepo.createUser).toHaveBeenCalledWith(expect.anything(), { role: 'user', status: 'active' });
    });

    it('does not promote a newcomer when accounts already exist', async () => {
      usersRepo.listUsers.mockResolvedValue([{ id: 'old', password: 'h' } as any]);
      await expect(service.register({ id: 'second', password: 'Passw0rd!' })).resolves.toEqual({ status: 'active' });
      expect(usersRepo.createUser).toHaveBeenCalledWith(expect.anything(), { role: 'user', status: 'active' });
    });

    it('makes a sign-up wait for approval when an admin must approve it', async () => {
      usersRepo.listUsers.mockResolvedValue([{ id: 'root', password: 'h', role: 'admin' } as any]);
      accountSettings.needsApproval.mockResolvedValue(true);
      await expect(service.register({ id: 'newbie', password: 'Passw0rd!' })).resolves.toEqual({ status: 'pending' });
      expect(usersRepo.createUser).toHaveBeenCalledWith(expect.anything(), { role: 'user', status: 'pending' });
    });

    it('refuses a waiting sign-up only after the password matched', async () => {
      usersRepo.loadUserById.mockResolvedValue({ id: 'user1', password: 'hash', status: 'pending' } as any);
      await expect(service.login({ id: 'user1', password: 'pw' })).rejects.toMatchObject({
        code: 'ACCOUNT_PENDING_APPROVAL',
      });
      expect(jwt.signAsync).not.toHaveBeenCalled();
      expect(usersRepo.atomicUpdateUser).not.toHaveBeenCalled();

      password.comparePlainAndHash.mockResolvedValue(false);
      await expect(service.login({ id: 'user1', password: 'wrong' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('refuses to sign up an ADMIN_USERS id, so no one can claim it first', async () => {
      configuredAdmins.add('boss');
      await expect(service.register({ id: 'boss', password: 'Passw0rd!' })).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        additionalData: expect.objectContaining({ reason: 'RESERVED_ADMIN_ID' }),
      });
      expect(usersRepo.createUser).not.toHaveBeenCalled();
    });

    it.each(['ab', ' alice', 'alice ', '   '])('refuses the account id %j', async (id) => {
      await expect(service.register({ id, password: 'Passw0rd!' })).rejects.toMatchObject({
        code: 'INVALID_ACCOUNT_ID',
      });
      expect(usersRepo.createUser).not.toHaveBeenCalled();
    });

    it("puts the account's own id in both tokens", async () => {
      usersRepo.loadUserById.mockResolvedValue({ id: 'user1', password: 'hash', uuid: 'u-1' } as any);
      await service.login({ id: 'user1', password: 'pw' });
      expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u-1' }), expect.anything());
      expect(refreshTokenService.create).toHaveBeenCalledWith('user1', undefined, 0, 'u-1');
    });

    it('refuses a refresh token from a deleted account whose name was reused', async () => {
      accountAccess.get.mockResolvedValue({ ...ACTIVE, uuid: 'new-account' });
      const session = okSession(0);
      (session.session.record as any).accountUuid = 'old-account';
      refreshTokenService.consumeForRotation.mockResolvedValue(session);

      await expect(service.refresh('old-refresh')).rejects.toMatchObject({
        additionalData: expect.objectContaining({ reason: 'ACCOUNT_NOT_FOUND' }),
      });
      expect(refreshTokenService.revokeFamily).toHaveBeenCalledWith('family-1');
    });

    it('makes concurrent sign-ups on an empty install plain users', async () => {
      const created: string[] = [];
      usersRepo.listUsers.mockImplementation(async () => created.map((id) => ({ id, password: 'h' }) as any));
      usersRepo.createUser.mockImplementation(async (dto) => {
        await new Promise((r) => setTimeout(r, 5));
        created.push(dto.id);
      });

      await Promise.all([
        service.register({ id: 'aaa', password: 'Passw0rd!' }),
        service.register({ id: 'bbb', password: 'Passw0rd!' }),
      ]);
      const roles = usersRepo.createUser.mock.calls.map(([, options]) => options?.role);
      expect(roles).toEqual(['user', 'user']);
    });

    it('follows the admin-set registration switch', async () => {
      accountSettings.isRegistrationEnabled.mockResolvedValue(false);
      await expect(service.register({ id: 'x', password: 'Passw0rd!' })).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
      });
      expect(usersRepo.createUser).not.toHaveBeenCalled();
    });
  });

  it('still revokes the refresh token when the access token has expired', async () => {
    jwt.verifyAsync = jest.fn().mockRejectedValue(new Error('jwt expired'));

    await service.logout('expired-access', 'refresh-1');

    expect(tokenBlacklistService.add).not.toHaveBeenCalled();
    expect(refreshTokenService.revoke).toHaveBeenCalledWith('refresh-1');
  });

  it('logs out with no cookies at all', async () => {
    await expect(service.logout(undefined, undefined)).resolves.toBeUndefined();
    expect(refreshTokenService.revoke).not.toHaveBeenCalled();
  });
});
