import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@config/config.service';
import { PasswordService } from '@security';
import { UserRepositoryService } from '@repository';
import { AuthError } from '@error/auth/auth-error';
import { RefreshTokenService } from '@token/refresh-token.service';
import { TokenBlacklistService } from '@token/token-blacklist.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let jwt: jest.Mocked<JwtService>;
  let refreshTokenService: jest.Mocked<RefreshTokenService>;
  let tokenBlacklistService: jest.Mocked<TokenBlacklistService>;
  let usersRepo: jest.Mocked<UserRepositoryService>;
  let password: jest.Mocked<PasswordService>;

  beforeEach(async () => {
    jwt = { signAsync: jest.fn().mockResolvedValue('access-token') } as any;
    refreshTokenService = {
      create: jest.fn().mockResolvedValue({ token: 'refresh-token', familyId: 'family-1' }),
      consumeForRotation: jest.fn(),
      commitConsume: jest.fn().mockResolvedValue(undefined),
      rollbackConsume: jest.fn().mockResolvedValue(undefined),
      revoke: jest.fn().mockResolvedValue(undefined),
      revokeFamily: jest.fn().mockResolvedValue(undefined),
    } as any;
    tokenBlacklistService = {
      add: jest.fn().mockResolvedValue(undefined),
    } as any;
    usersRepo = {
      loadUserById: jest.fn().mockResolvedValue({ id: 'user1', password: 'hash' }),
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
          useValue: { isAuthRegistrationEnabled: jest.fn().mockReturnValue(true) },
        },
        { provide: RefreshTokenService, useValue: refreshTokenService },
        { provide: TokenBlacklistService, useValue: tokenBlacklistService },
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

    expect(refreshTokenService.create).toHaveBeenCalledWith('user1', 'family-1');
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
