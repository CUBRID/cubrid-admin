import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getStoragePath } from '@util';
import { AdminAuditAction, AdminAuditEntry, AdminAuditPage, AdminAuditQuery } from '@api-interfaces';

/**
 * Who did what to which account, one JSON line per admin action in
 * storage/admin/audit.jsonl (outside the storage root, which the master-key
 * migration script decrypts file by file). Also written to the server log.
 * Never holds passwords.
 */
@Injectable()
export class AdminAuditService {
  static readonly DEFAULT_PAGE = 50;
  /** Largest page, also what a CSV export reads at most. */
  static readonly MAX_PAGE = 5000;

  private readonly logger = new Logger(AdminAuditService.name);
  // Static: appends from any instance go one after another.
  private static writing: Promise<void> = Promise.resolve();

  static auditPath(): string {
    return path.join(getStoragePath(), 'admin', 'audit.jsonl');
  }

  async record(
    actor: string,
    action: AdminAuditAction,
    target?: string,
    detail?: Record<string, unknown>
  ): Promise<void> {
    const entry: AdminAuditEntry = {
      at: new Date().toISOString(),
      actor,
      action,
      ...(target !== undefined ? { target } : {}),
      ...(detail ? { detail } : {}),
    };
    this.logger.log(`Admin "${actor}" ${action}${target !== undefined ? ` "${target}"` : ''}`);

    // Best-effort: the change itself already happened; a failed audit
    // write is logged rather than reported as a failed change.
    const write = AdminAuditService.writing.then(async () => {
      const file = AdminAuditService.auditPath();
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8');
    });
    AdminAuditService.writing = write.catch(() => undefined);
    try {
      await write;
    } catch (err: unknown) {
      this.logger.error(`Could not write the admin audit log: ${String(err)}`);
    }
  }

  /**
   * Entries matching every given filter, newest first. `actor` and `target`
   * match exactly; `from`/`to` bound the time (inclusive); a bad date is
   * ignored rather than matching nothing.
   */
  async query(filter: AdminAuditQuery = {}): Promise<AdminAuditPage> {
    const limit = clamp(filter.limit, AdminAuditService.DEFAULT_PAGE, 1, AdminAuditService.MAX_PAGE);
    const offset = clamp(filter.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const from = toTime(filter.from);
    const to = toTime(filter.to);

    const matches: AdminAuditEntry[] = [];
    for (const entry of await this.readAll()) {
      if (filter.actor && entry.actor !== filter.actor) continue;
      if (filter.target && entry.target !== filter.target) continue;
      if (filter.action && entry.action !== filter.action) continue;
      const at = Date.parse(entry.at);
      if (from !== undefined && !(at >= from)) continue;
      if (to !== undefined && !(at <= to)) continue;
      matches.push(entry);
    }
    return { entries: matches.slice(offset, offset + limit), total: matches.length };
  }

  /** Every entry, newest first. A torn line from a crash mid-write is skipped. */
  private async readAll(): Promise<AdminAuditEntry[]> {
    let raw: string;
    try {
      raw = await fs.readFile(AdminAuditService.auditPath(), 'utf8');
    } catch (err: any) {
      if (err?.code === 'ENOENT') return [];
      throw err;
    }
    const entries: AdminAuditEntry[] = [];
    const lines = raw.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        // skip
      }
    }
    return entries;
  }
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.floor(Number(value));
  if (value === undefined || value === null || value === '' || !Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(n, max));
}

function toTime(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : t;
}
