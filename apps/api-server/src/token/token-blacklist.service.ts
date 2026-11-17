import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getStoragePath } from '@util';
import { TOKEN_CLEANUP_INTERVAL_MS } from './token.constants';

type BlacklistEntry = {
  jti: string;
  expiresAt: string;
};

// Family entries share the store with access jtis, under their own prefix.
const familyKey = (familyId: string) => `family:${familyId}`;

@Injectable()
export class TokenBlacklistService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private root(): string {
    return path.join(getStoragePath(), 'token-blacklist');
  }

  private entryPath(jti: string): string {
    const safe = crypto.createHash('sha256').update(jti).digest('hex');
    return path.join(this.root(), `${safe}.json`);
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

  async add(jti: string, expiresAt: Date): Promise<void> {
    if (!jti) return;
    await fs.mkdir(this.root(), { recursive: true });
    const entry: BlacklistEntry = { jti, expiresAt: expiresAt.toISOString() };
    await fs.writeFile(this.entryPath(jti), JSON.stringify(entry), 'utf8');
  }

  /**
   * Revokes every token of a refresh family (an access JWT carries it as
   * `fam`) for `lifetimeMs`: as long as any of them could still be used,
   * including a refresh token written by a rotation that ran during logout.
   */
  async revokeFamily(familyId: string, lifetimeMs: number): Promise<void> {
    await this.add(familyKey(familyId), new Date(Date.now() + lifetimeMs));
  }

  async isFamilyRevoked(familyId: string | undefined): Promise<boolean> {
    return familyId ? this.isBlacklisted(familyKey(familyId)) : false;
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    if (!jti) return false;
    try {
      const raw = await fs.readFile(this.entryPath(jti), 'utf8');
      const entry = JSON.parse(raw) as BlacklistEntry;
      if (Date.now() >= Date.parse(entry.expiresAt)) {
        await fs.unlink(this.entryPath(jti)).catch(() => undefined);
        return false;
      }
      return true;
    } catch (err: any) {
      if (err?.code === 'ENOENT') return false;
      throw err;
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
        const entry = JSON.parse(raw) as BlacklistEntry;
        if (now >= Date.parse(entry.expiresAt)) {
          await fs.unlink(filePath);
          removed += 1;
        }
      } catch {
        await fs.unlink(filePath).catch(() => undefined);
        removed += 1;
      }
    }

    if (removed > 0) {
      this.logger.debug(`Purged ${removed} expired token blacklist entries`);
    }
    return removed;
  }
}
