import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getStoragePath } from '@util';
import { REFRESH_TOKEN_EXPIRES_MS, TOKEN_CLEANUP_INTERVAL_MS } from './token.constants';

export type RefreshTokenRecord = {
  userId: string;
  familyId: string;
  expiresAt: string;
  createdAt: string;
  /** The account's session version when issued; absent (older tokens) = 0. */
  sessionVersion?: number;
  /** The account record's uuid when issued; absent in older tokens. */
  accountUuid?: string;
};

type ConsumedRefreshTokenRecord = RefreshTokenRecord & {
  consumedAt: string;
};

export type RefreshConsumeSession = {
  token: string;
  tokenHash: string;
  lockPath: string;
  record: RefreshTokenRecord;
};

export type RefreshConsumeResult =
  | { kind: 'ok'; session: RefreshConsumeSession }
  | { kind: 'reused'; familyId: string }
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

  private consumingPath(tokenHash: string, nonce: string): string {
    return path.join(this.root(), `${tokenHash}.consuming.${nonce}.json`);
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

  async create(
    userId: string,
    familyId?: string,
    sessionVersion = 0,
    accountUuid?: string
  ): Promise<{ token: string; familyId: string }> {
    const token = crypto.randomBytes(32).toString('base64url');
    const family = familyId ?? crypto.randomUUID();
    const now = new Date();
    const record: RefreshTokenRecord = {
      userId,
      familyId: family,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_EXPIRES_MS).toISOString(),
      sessionVersion,
      ...(accountUuid ? { accountUuid } : {}),
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

    try {
      await fs.rename(activePath, lockPath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        throw err;
      }

      const consumed = await this.readConsumed(consumedPath);
      if (consumed && Date.now() < Date.parse(consumed.expiresAt)) {
        return { kind: 'reused', familyId: consumed.familyId };
      }
      return { kind: 'invalid' };
    }

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

  async commitConsume(session: RefreshConsumeSession): Promise<void> {
    const consumedPath = this.consumedPathByHash(session.tokenHash);
    const consumedRecord: ConsumedRefreshTokenRecord = {
      ...session.record,
      consumedAt: new Date().toISOString(),
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
