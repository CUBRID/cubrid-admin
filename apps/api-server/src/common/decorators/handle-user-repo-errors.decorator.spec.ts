import { HandleUserRepoErrors } from './handle-user-repo-errors.decorator';
import { LockError, LockErrorCode } from '@error/lock/lock-error';
import { UserError, UserErrorCode } from '@error/user/user-error';
import { getPublicClientErrorMessage } from '@error/client-error-messages';

class Repo {
  constructor(private readonly error: Error) {}

  @HandleUserRepoErrors()
  async update(_id: string): Promise<void> {
    throw this.error;
  }
}

describe('HandleUserRepoErrors with lock errors', () => {
  it('lets a stale (compromised) lock keep its own answer: 410, "try again"', async () => {
    const stale = LockError.StaleLock({ filePath: '/s/u', reason: 'Lock compromised' });
    const caught = await new Repo(stale).update('user-1').catch((e) => e);
    expect(caught).toBe(stale);
    expect(caught.code).toBe(LockErrorCode.STALE_LOCK);
    const response = caught.toProblemDetails();
    expect(response.status).toBe(410);
    expect(getPublicClientErrorMessage({ kind: 'LOCK', code: caught.code })).toBe('The lock has expired. Please try again.');
  });

  it('still turns the other lock errors into user errors', async () => {
    const held = LockError.LockAlreadyHeld({ filePath: '/s/u' });
    const caught = await new Repo(held).update('user-1').catch((e) => e);
    expect(caught).toBeInstanceOf(UserError);
    expect(caught.code).toBe(UserErrorCode.RESOURCE_LOCKED);
    const unknown = LockError.Unknown({ filePath: '/s/u' });
    const caught2 = await new Repo(unknown).update('user-1').catch((e) => e);
    expect(caught2).toBeInstanceOf(UserError);
    expect(caught2.code).toBe(UserErrorCode.LOCK_OPERATION_FAILED);
  });
});
