import { AccountAccess } from '@account/account-access.service';
import { AuthError } from '@error/auth/auth-error';
import { JwtStrategy } from './jwt-strategy';

const ACTIVE: AccountAccess = {
  exists: true,
  isAdmin: false,
  disabled: false,
  mustChangePassword: false,
  sessionVersion: 0,
};

describe('JwtStrategy', () => {
  let access: { get: jest.Mock };
  let blacklist: { isBlacklisted: jest.Mock };
  let strategy: JwtStrategy;

  beforeEach(() => {
    access = { get: jest.fn().mockResolvedValue(ACTIVE) };
    blacklist = { isBlacklisted: jest.fn().mockResolvedValue(false) };
    strategy = new JwtStrategy({ getSecretKey: () => 'secret' } as any, blacklist as any, access as any);
  });

  const token = (extra: Record<string, unknown> = {}) => ({ sub: 'alice', jti: 'j1', type: 'access', ...extra });

  it('passes an active account and adds its rights to req.user', async () => {
    access.get.mockResolvedValue({ ...ACTIVE, isAdmin: true, mustChangePassword: true });
    await expect(strategy.validate(token())).resolves.toMatchObject({
      sub: 'alice',
      isAdmin: true,
      mustChangePassword: true,
    });
  });

  it('accepts a token from before session versions as version 0', async () => {
    await expect(strategy.validate(token())).resolves.toMatchObject({ sub: 'alice' });
  });

  it.each([
    ['a deleted account', { ...ACTIVE, exists: false }, {}, 'ACCOUNT_NOT_FOUND'],
    ['a disabled account', { ...ACTIVE, disabled: true }, {}, 'ACCOUNT_DISABLED'],
    ['an ended session', { ...ACTIVE, sessionVersion: 2 }, { sv: 1 }, 'SESSION_REVOKED'],
    ['an ended session issued before versions', { ...ACTIVE, sessionVersion: 1 }, {}, 'SESSION_REVOKED'],
  ])('refuses %s with INVALID_TOKEN', async (_label, current, extra, reason) => {
    access.get.mockResolvedValue(current);
    const result = strategy.validate(token(extra));
    await expect(result).rejects.toBeInstanceOf(AuthError);
    await expect(result).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
      additionalData: expect.objectContaining({ reason }),
    });
  });

  it("refuses a deleted account's token on a new account with the same name", async () => {
    access.get.mockResolvedValue({ ...ACTIVE, uuid: 'new-account' });
    await expect(strategy.validate(token({ uid: 'old-account' }))).rejects.toMatchObject({
      additionalData: expect.objectContaining({ reason: 'ACCOUNT_NOT_FOUND' }),
    });
    await expect(strategy.validate(token({ uid: 'new-account' }))).resolves.toMatchObject({ sub: 'alice' });
  });

  it('accepts a token from before account ids were in tokens', async () => {
    access.get.mockResolvedValue({ ...ACTIVE, uuid: 'any' });
    await expect(strategy.validate(token())).resolves.toMatchObject({ sub: 'alice' });
  });

  it('refuses a refresh-type or blacklisted token before reading the account', async () => {
    await expect(strategy.validate(token({ type: 'refresh' }))).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    blacklist.isBlacklisted.mockResolvedValue(true);
    await expect(strategy.validate(token())).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    expect(access.get).not.toHaveBeenCalled();
  });
});
