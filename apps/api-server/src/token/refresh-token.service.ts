import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getStoragePath } from '@util';
import {
  REFRESH_IN_FLIGHT_POLL_MS,
  REFRESH_LOCK_STALE_MS,
  REFRESH_IN_FLIGHT_WAIT_MS,
  REFRESH_TOKEN_EXPIRES_MS,
  REFRESH_TOKEN_REUSE_GRACE_MS,
  TOKEN_CLEANUP_INTERVAL_MS,
} from './token.constants';

export type RefreshTokenRecord = {
  userId: string;
  familyId: string;
  expiresAt: string;
  createdAt: string;
};

type ConsumedRefreshTokenRecord = RefreshTokenRecord & {
  consumedAt: string;
  /** Hash of the token issued in its place, for the reuse grace. */
  replacedBy?: string;
};

export type RefreshConsumeSession = {
  /** Unset when the session rotates a successor under the reuse grace. */
  token?: string;
  tokenHash: string;
  lockPath: string;
  record: RefreshTokenRecord;
};

export type RefreshConsumeResult =
  /** grace: the token was the one just rotated; its successor is rotated in its place. */
  | { kind: 'ok'; session: RefreshConsumeSession; grace?: boolean }
  | { kind: 'reused'; familyId: string }
  /** The same token is still being rotated by another request. */
  | { kind: 'busy' }
  | { kind: 'invalid' };

@Injectable()
export class RefreshTokenService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RefreshTokenService.name);
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private root(): string {
    return path.join(getStoragePath(), 'refresh-tokens');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private tokenPath(token: string): string {
    return path.join(this.root(), `${this.hashToken(token)}.json`);
  }

  private tokenPathByHash(tokenHash: string): string {
    return path.join(this.root(), `${tokenHash}.json`);
  }

  // The lock's name carries when the rotation began (ms): a lock older than
  // REFRESH_LOCK_STALE_MS was left by a crash. The name, not the file's
  // mtime: a rename keeps the token file's old mtime.
  private consumingPath(tokenHash: string, nonce: string): string {
    return path.join(this.root(), `${tokenHash}.consuming.${Date.now()}.${nonce}.json`);
  }

  private consumedRoot(): string {
    return path.join(getStoragePath(), 'refresh-tokens-consumed');
  }

  private consumedPathByHash(tokenHash: string): string {
    return path.join(this.consumedRoot(), `${tokenHash}.json`);
  }

  onModuleInit(): void {
    void this.purgeExpired();
    this.cleanupTimer = setInterval(() => void this.purgeExpired(), TOKEN_CLEANUP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  async create(userId: string, familyId?: string): Promise<{ token: string; familyId: string }> {
    const token = crypto.randomBytes(32).toString('base64url');
    const family = familyId ?? crypto.randomUUID();
    const now = new Date();
    const record: RefreshTokenRecord = {
      userId,
      familyId: family,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_EXPIRES_MS).toISOString(),
    };

    await fs.mkdir(this.root(), { recursive: true });
    await fs.writeFile(this.tokenPath(token), JSON.stringify(record), 'utf8');
    return { token, familyId: family };
  }

  async find(token: string): Promise<RefreshTokenRecord | null> {
    try {
      const raw = await fs.readFile(this.tokenPath(token), 'utf8');
      const record = JSON.parse(raw) as RefreshTokenRecord;
      if (Date.now() >= Date.parse(record.expiresAt)) {
        await this.revoke(token);
        return null;
      }
      return record;
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
  }

  async consumeForRotation(token: string): Promise<RefreshConsumeResult> {
    const tokenHash = this.hashToken(token);
    const activePath = this.tokenPathByHash(tokenHash);
    const consumedPath = this.consumedPathByHash(tokenHash);
    const lockPath = this.consumingPath(tokenHash, crypto.randomUUID());

    await fs.mkdir(this.root(), { recursive: true });
    await fs.mkdir(this.consumedRoot(), { recursive: true });

    // The same token may be mid-rotation in another request (renamed, not
    // yet recorded as consumed): wait for that one to finish, then answer
    // as for a token just rotated, instead of calling it invalid.
    const waitUntil = Date.now() + REFRESH_IN_FLIGHT_WAIT_MS;
    for (;;) {
      try {
        await fs.rename(activePath, lockPath);
        return this.claimLocked(token, tokenHash, lockPath);
      } catch (err: any) {
        if (err?.code !== 'ENOENT') {
          throw err;
        }
      }
      if ((await this.readConsumed(consumedPath)) || !(await this.isBeingConsumed(tokenHash))) break;
      if (Date.now() >= waitUntil) return { kind: 'busy' };
      await new Promise((resolve) => setTimeout(resolve, REFRESH_IN_FLIGHT_POLL_MS));
    }

    const consumed = await this.readConsumed(consumedPath);
    if (consumed && Date.now() < Date.parse(consumed.expiresAt)) {
      const grace = await this.consumeSuccessorInGrace(consumed);
      if (grace) {
        this.logger.warn(
          `Refresh token used again ${Date.now() - Date.parse(consumed.consumedAt)} ms after its rotation; ` +
            `issuing a new pair (family ${consumed.familyId}) instead of revoking it.`
        );
        return grace;
      }
      return { kind: 'reused', familyId: consumed.familyId };
    }
    return { kind: 'invalid' };
  }

  private async isBeingConsumed(tokenHash: string): Promise<boolean> {
    let files: string[];
    try {
      files = await fs.readdir(this.root());
    } catch (err: any) {
      if (err?.code === 'ENOENT') return false;
      throw err;
    }
    const prefix = `${tokenHash}.consuming.`;
    return files.some((name) => {
      if (!name.startsWith(prefix)) return false;
      const startedAt = Number(name.slice(prefix.length).split('.')[0]);
      return Number.isFinite(startedAt) && Date.now() - startedAt < REFRESH_LOCK_STALE_MS;
    });
  }

  /**
   * The reuse grace (REFRESH_TOKEN_REUSE_GRACE_MS): a token rotated moments
   * ago whose successor is still unused stands for that successor, so the
   * successor is rotated instead. Only the token just before the active one
   * qualifies: once the successor is used, revoked (logout, a revoked
   * family) or expired, there is nothing to take over and the reuse stands.
   */
  private async consumeSuccessorInGrace(
    consumed: ConsumedRefreshTokenRecord
  ): Promise<RefreshConsumeResult | null> {
    const consumedAt = Date.parse(consumed.consumedAt);
    if (
      !consumed.replacedBy ||
      !/^[0-9a-f]{64}$/.test(consumed.replacedBy) ||
      !(Date.now() - consumedAt < REFRESH_TOKEN_REUSE_GRACE_MS)
    ) {
      return null;
    }
    const successorLock = this.consumingPath(consumed.replacedBy, crypto.randomUUID());
    try {
      await fs.rename(this.tokenPathByHash(consumed.replacedBy), successorLock);
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
    const result = await this.claimLocked(undefined, consumed.replacedBy, successorLock);
    if (result.kind !== 'ok') return null;
    if (result.session.record.familyId !== consumed.familyId) {
      await this.rollbackConsume(result.session);
      return null;
    }
    return { ...result, grace: true };
  }

  private async claimLocked(
    token: string | undefined,
    tokenHash: string,
    lockPath: string
  ): Promise<RefreshConsumeResult> {
    try {
      const raw = await fs.readFile(lockPath, 'utf8');
      const record = JSON.parse(raw) as RefreshTokenRecord;

      if (Date.now() >= Date.parse(record.expiresAt)) {
        await fs.unlink(lockPath).catch(() => undefined);
        return { kind: 'invalid' };
      }

      return {
        kind: 'ok',
        session: {
          token,
          tokenHash,
          lockPath,
          record,
        },
      };
    } catch {
      await fs.unlink(lockPath).catch(() => undefined);
      return { kind: 'invalid' };
    }
  }

  /** replacedBy: the token issued in its place, which the reuse grace looks for. */
  async commitConsume(session: RefreshConsumeSession, replacedBy?: string): Promise<void> {
    const consumedPath = this.consumedPathByHash(session.tokenHash);
    const consumedRecord: ConsumedRefreshTokenRecord = {
      ...session.record,
      consumedAt: new Date().toISOString(),
      ...(replacedBy ? { replacedBy: this.hashToken(replacedBy) } : {}),
    };

    await fs.writeFile(consumedPath, JSON.stringify(consumedRecord), 'utf8');
    await fs.unlink(session.lockPath).catch(() => undefined);
  }

  async rollbackConsume(session: RefreshConsumeSession): Promise<void> {
    const targetPath = this.tokenPathByHash(session.tokenHash);
    await fs.rename(session.lockPath, targetPath).catch(() => undefined);
  }

  async revoke(token: string): Promise<void> {
    await fs.unlink(this.tokenPath(token)).catch(() => undefined);
  }

  async revokeFamily(familyId: string): Promise<void> {
    let files: string[];
    try {
      files = await fs.readdir(this.root());
    } catch (err: any) {
      if (err?.code === 'ENOENT') return;
      throw err;
    }

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(this.root(), file);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const record = JSON.parse(raw) as RefreshTokenRecord;
        if (record.familyId === familyId) {
          await fs.unlink(filePath);
        }
      } catch {
        await fs.unlink(filePath).catch(() => undefined);
      }
    }
  }

  async purgeExpired(): Promise<number> {
    let removed = 0;
    const now = Date.now();
    let files: string[];
    try {
      files = await fs.readdir(this.root());
    } catch (err: any) {
      if (err?.code === 'ENOENT') return 0;
      throw err;
    }

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(this.root(), file);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const record = JSON.parse(raw) as RefreshTokenRecord;
        if (now >= Date.parse(record.expiresAt)) {
          await fs.unlink(filePath);
          removed += 1;
        }
      } catch {
        await fs.unlink(filePath).catch(() => undefined);
        removed += 1;
      }
    }

    let consumedFiles: string[];
    try {
      consumedFiles = await fs.readdir(this.consumedRoot());
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        consumedFiles = [];
      } else {
        throw err;
      }
    }

    for (const file of consumedFiles) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(this.consumedRoot(), file);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const record = JSON.parse(raw) as ConsumedRefreshTokenRecord;
        if (now >= Date.parse(record.expiresAt)) {
          await fs.unlink(filePath);
          removed += 1;
        }
      } catch {
        await fs.unlink(filePath).catch(() => undefined);
        removed += 1;
      }
    }

    if (removed > 0) {
      this.logger.debug(`Purged ${removed} expired refresh tokens`);
    }
    return removed;
  }

  private async readConsumed(consumedPath: string): Promise<ConsumedRefreshTokenRecord | null> {
    try {
      const raw = await fs.readFile(consumedPath, 'utf8');
      return JSON.parse(raw) as ConsumedRefreshTokenRecord;
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
  }
}
