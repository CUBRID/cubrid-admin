import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { RefreshTokenService } from './refresh-token.service';
import { REFRESH_TOKEN_REUSE_GRACE_MS } from './token.constants';

jest.mock('@util', () => ({
  getStoragePath: jest.fn(),
}));

import { getStoragePath } from '@util';

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wm-refresh-'));
    (getStoragePath as jest.Mock).mockReturnValue(tempDir);
    service = new RefreshTokenService();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('consumes token once and detects replay', async () => {
    const { token } = await service.create('user1');

    const consumed = await service.consumeForRotation(token);
    expect(consumed.kind).toBe('ok');
    if (consumed.kind !== 'ok') return;

    await service.commitConsume(consumed.session);

    const replay = await service.consumeForRotation(token);
    expect(replay.kind).toBe('reused');
  });

  it('rolls back consumed token when rotation fails', async () => {
    const { token } = await service.create('user1');

    const consumed = await service.consumeForRotation(token);
    expect(consumed.kind).toBe('ok');
    if (consumed.kind !== 'ok') return;

    await service.rollbackConsume(consumed.session);
    const found = await service.find(token);
    expect(found).not.toBeNull();
  });

  describe('reuse grace', () => {
    // Only the clock is faked; file I/O and its callbacks run for real.
    beforeEach(() => {
      jest.useFakeTimers({
        doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask'],
        now: new Date('2026-11-16T09:00:00Z'),
      });
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    const later = (ms: number) => jest.setSystemTime(Date.now() + ms);

    /** One refresh as AuthService does it: the old token out, a new one in. */
    const rotate = async (token: string) => {
      const consumed = await service.consumeForRotation(token);
      if (consumed.kind !== 'ok') throw new Error(`rotation refused: ${consumed.kind}`);
      const { token: next } = await service.create(consumed.session.record.userId, consumed.session.record.familyId);
      await service.commitConsume(consumed.session, next);
      return { next, grace: consumed.grace === true };
    };

    it('lets the token just rotated through again within the grace, with a new pair, and keeps the family', async () => {
      const { token: t0 } = await service.create('user1');
      await rotate(t0); // its answer (t1) never reached the browser
      later(3000);

      const again = await rotate(t0);
      expect(again.grace).toBe(true);
      // The session goes on with the new token.
      later(REFRESH_TOKEN_REUSE_GRACE_MS + 1000);
      await expect(rotate(again.next)).resolves.toEqual(expect.objectContaining({ grace: false }));
    });

    it('treats the same token after the grace as reuse', async () => {
      const { token: t0 } = await service.create('user1');
      await rotate(t0);
      later(REFRESH_TOKEN_REUSE_GRACE_MS + 1);

      expect((await service.consumeForRotation(t0)).kind).toBe('reused');
    });

    it('treats a token two rotations back as reuse, even within the grace', async () => {
      const { token: t0 } = await service.create('user1');
      const { next: t1 } = await rotate(t0);
      await rotate(t1);
      later(1000);

      expect((await service.consumeForRotation(t0)).kind).toBe('reused');
    });

    it('gives no grace after logout (its successor revoked)', async () => {
      const { token: t0 } = await service.create('user1');
      const { next: t1 } = await rotate(t0);
      await service.revoke(t1);
      later(1000);

      expect((await service.consumeForRotation(t0)).kind).toBe('reused');
    });

    it('gives no grace once the family is revoked', async () => {
      const { token: t0, familyId } = await service.create('user1');
      await rotate(t0);
      await service.revokeFamily(familyId);
      later(1000);

      expect((await service.consumeForRotation(t0)).kind).toBe('reused');
    });

    it('gives no grace to a token without a recorded successor', async () => {
      const { token: t0 } = await service.create('user1');
      const consumed = await service.consumeForRotation(t0);
      if (consumed.kind !== 'ok') throw new Error('rotation refused');
      await service.commitConsume(consumed.session);
      later(1000);

      expect((await service.consumeForRotation(t0)).kind).toBe('reused');
    });
  });
});
