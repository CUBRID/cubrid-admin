import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { JwtService } from '@nestjs/jwt';
import { AuthError } from '@error/auth/auth-error';
import { RefreshTokenService } from '@token/refresh-token.service';
import { TokenBlacklistService } from '@token/token-blacklist.service';
import { JwtAuthGuard } from '@token/jwt-auth.guard';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';

// Real token stores in a temporary folder.
const mockStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-logout-family-'));
jest.mock('@util', () => ({ ...jest.requireActual('@util'), getStoragePath: () => mockStorage }));
afterAll(() => fs.rmSync(mockStorage, { recursive: true, force: true }));

describe('logout ends every token of the session (refresh family)', () => {
  const jwt = new JwtService({ secret: 'logout-family-spec' });
  const refreshTokens = new RefreshTokenService();
  const blacklist = new TokenBlacklistService();
  const config = { isAuthRegistrationEnabled: () => true, getSecretKey: () => 'logout-family-spec' };
  const service = new AuthService(
    { loadUserById: async () => ({ id: 'user1', password: 'hash' }) } as never,
    jwt,
    { comparePlainAndHash: async () => true } as never,
    config as never,
    refreshTokens,
    blacklist
  );
  // The guard's check of an access token (the cookie it reads, already taken out).
  const guard = new JwtAuthGuard(new Reflector(), jwt, blacklist) as unknown as { verify: (token: string) => Promise<unknown> };
  const accessOk = (token: string) => guard.verify(token);

  it('after a logout with a rotated token: the newest access 401, its refresh 401, the rotated one 401', async () => {
    const t1 = await service.login({ id: 'user1', password: 'pw' });
    const t2 = await service.refresh(t1.refreshToken);
    // The answer to t1's rotation was lost; t1 again within the grace gets t3.
    const t3 = await service.refresh(t1.refreshToken);
    await expect(accessOk(t3.token)).resolves.toEqual(expect.objectContaining({ sub: 'user1' }));

    // Logged out with the cookies of t2, already rotated by the grace.
    await service.logout(t2.token, t2.refreshToken);

    await expect(accessOk(t3.token)).rejects.toBeInstanceOf(AuthError);
    await expect(accessOk(t1.token)).rejects.toBeInstanceOf(AuthError);
    await expect(service.refresh(t3.refreshToken)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    await expect(service.refresh(t2.refreshToken)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    await expect(service.refresh(t1.refreshToken)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('a refresh token written during logout stays refused after the access lifetime', async () => {
    const t1 = await service.login({ id: 'user1', password: 'pw' });
    const t2 = await service.refresh(t1.refreshToken);
    // A rotation that passed its family check before logout writes its new
    // refresh file after logout deleted the family's files: put t2's back.
    const store = path.join(mockStorage, 'refresh-tokens');
    const before = path.join(mockStorage, 'refresh-tokens-before-logout');
    fs.cpSync(store, before, { recursive: true });
    await service.logout(t2.token, t2.refreshToken);
    fs.cpSync(before, store, { recursive: true });
    fs.rmSync(before, { recursive: true, force: true });
    const twoDaysLater = Date.now() + 2 * 86400 * 1000;
    const now = jest.spyOn(Date, 'now').mockReturnValue(twoDaysLater);
    try {
      await expect(service.refresh(t2.refreshToken)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    } finally {
      now.mockRestore();
    }
  });

  it('leaves another session of the same user signed in', async () => {
    const mine = await service.login({ id: 'user1', password: 'pw' });
    const other = await service.login({ id: 'user1', password: 'pw' });
    await service.logout(mine.token, mine.refreshToken);
    await expect(accessOk(other.token)).resolves.toEqual(expect.objectContaining({ sub: 'user1' }));
    await expect(service.refresh(other.refreshToken)).resolves.toEqual(expect.objectContaining({ expiresIn: 86400 }));
  });
});
