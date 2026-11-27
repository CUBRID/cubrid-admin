import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ApiLogBucket, ApiLogEntry, ApiLogPage, ApiLogQuery, ApiLogSummary } from '@api-interfaces';
import { ConfigService } from '@config/config.service';
import { getHost } from '@host/host-group.util';
import { UserRepositoryService } from '@repository';
import { getStoragePath } from '@util';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 90;
/** Longest range one query reads. */
export const MAX_RANGE_DAYS = 92;
export const MAX_PAGE = 5000;
const HOST_NAME_TTL_MS = 60_000;
const FILE_NAME = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

/** API_LOG_RETENTION_DAYS (1–3650), else 90. */
export function retentionDays(): number {
  const days = Number(process.env.API_LOG_RETENTION_DAYS);
  return Number.isInteger(days) && days >= 1 && days <= 3650 ? days : DEFAULT_RETENTION_DAYS;
}

const dayOf = (time: number) => new Date(time).toISOString().slice(0, 10);

/**
 * The API log store: one JSON line per action, a file per UTC day in
 * storage/admin/api-log/, files older than API_LOG_RETENTION_DAYS deleted.
 * Writes never fail or slow the request that made them: they are queued
 * and a failure is only logged. Plain JSON, not encrypted: it holds no
 * passwords or request bodies, only who did what to which host.
 */
@Injectable()
export class ApiLogService implements OnModuleInit {
  private readonly logger = new Logger(ApiLogService.name);
  private queue: Promise<void> = Promise.resolve();
  private lastDay?: string;
  private readonly hostNames = new Map<string, { at: number; name?: string }>();

  constructor(
    private readonly config: ConfigService,
    private readonly repository: UserRepositoryService
  ) {}

  static dir(): string {
    return path.join(getStoragePath(), 'admin', 'api-log');
  }

  /** The desktop app has one user and no User Administration to read this. */
  get enabled(): boolean {
    return !this.config.isDesktopMode();
  }

  async onModuleInit(): Promise<void> {
    if (this.enabled) await this.prune();
  }

  record(entry: ApiLogEntry): void {
    if (!this.enabled) return;
    this.queue = this.queue
      .then(() => this.write(entry))
      .catch((err) => this.logger.warn(`Could not write the API log: ${String(err)}`));
  }

  /** For tests and shutdown: resolves once every queued entry is written. */
  flush(): Promise<void> {
    return this.queue;
  }

  private async write(entry: ApiLogEntry): Promise<void> {
    if (entry.hostUid && entry.user && !entry.host) {
      entry.host = await this.hostName(entry.user, entry.hostUid);
    }
    const day = dayOf(Date.parse(entry.at));
    const dir = ApiLogService.dir();
    if (day !== this.lastDay) {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      if (this.lastDay) await this.prune();
      this.lastDay = day;
    }
    await fs.appendFile(path.join(dir, `${day}.jsonl`), JSON.stringify(entry) + '\n', { mode: 0o600 });
  }

  private async hostName(userId: string, hostUid: string): Promise<string | undefined> {
    const key = `${userId}\n${hostUid}`;
    const cached = this.hostNames.get(key);
    if (cached && Date.now() - cached.at < HOST_NAME_TTL_MS) return cached.name;
    let name: string | undefined;
    try {
      name = getHost(await this.repository.loadUserById(userId), hostUid)?.alias;
    } catch {
      name = undefined;
    }
    this.hostNames.set(key, { at: Date.now(), name });
    return name;
  }

  /** Deletes day files older than the retention period. */
  async prune(now = Date.now()): Promise<void> {
    const oldest = dayOf(now - retentionDays() * DAY_MS);
    let names: string[];
    try {
      names = await fs.readdir(ApiLogService.dir());
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return;
      throw err;
    }
    for (const name of names) {
      const day = FILE_NAME.exec(name)?.[1];
      if (day && day < oldest) {
        await fs.rm(path.join(ApiLogService.dir(), name), { force: true });
      }
    }
  }

  /**
   * The entries the filters match, newest first, a page of them, and a
   * summary of all of them. `tzOffsetMinutes` (Date#getTimezoneOffset in
   * the browser) puts day buckets on the viewer's own midnight.
   */
  async query(q: ApiLogQuery & { tzOffsetMinutes?: number }, now = Date.now()): Promise<ApiLogPage> {
    const to = Math.min(validTime(q.to) ?? now, now);
    let from = validTime(q.from) ?? to - DAY_MS;
    from = Math.max(from, to - MAX_RANGE_DAYS * DAY_MS);
    const limit = Math.min(Math.max(Math.trunc(Number(q.limit) || 50), 1), MAX_PAGE);
    const offset = Math.max(Math.trunc(Number(q.offset) || 0), 0);

    const user = q.user?.trim().toLowerCase();
    const target = q.target?.trim().toLowerCase();
    const matches: ApiLogEntry[] = [];
    for (const entry of await this.read(from, to)) {
      const at = Date.parse(entry.at);
      if (!(at >= from && at <= to)) continue;
      if (user && !(entry.user ?? '').toLowerCase().includes(user)) continue;
      if (q.category && entry.category !== q.category) continue;
      if (q.result === 'ok' && !entry.ok) continue;
      if (q.result === 'failed' && entry.ok) continue;
      if (target && ![entry.host, entry.target, entry.path].some((v) => v?.toLowerCase().includes(target))) continue;
      matches.push(entry);
    }
    matches.sort((a, b) => b.at.localeCompare(a.at));
    return {
      entries: matches.slice(offset, offset + limit),
      total: matches.length,
      summary: summarize(matches, from, to, Number(q.tzOffsetMinutes) || 0),
    };
  }

  private async read(from: number, to: number): Promise<ApiLogEntry[]> {
    const entries: ApiLogEntry[] = [];
    for (let day = Date.parse(dayOf(from)); day <= to; day += DAY_MS) {
      let text: string;
      try {
        text = await fs.readFile(path.join(ApiLogService.dir(), `${dayOf(day)}.jsonl`), 'utf8');
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') continue;
        throw err;
      }
      for (const line of text.split('\n')) {
        if (!line) continue;
        try {
          const entry = JSON.parse(line) as ApiLogEntry;
          if (typeof entry?.at === 'string') entries.push(entry);
        } catch {
          // A line cut short by a crash mid-write; the rest of the file is fine.
        }
      }
    }
    return entries;
  }
}

function validTime(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}

/** Hour buckets up to two days, day buckets beyond. */
export function summarize(entries: ApiLogEntry[], from: number, to: number, tzOffsetMinutes = 0): ApiLogSummary {
  const bucket: ApiLogSummary['bucket'] = to - from <= 2 * DAY_MS ? 'hour' : 'day';
  const shift = -tzOffsetMinutes * 60_000;
  const size = bucket === 'hour' ? HOUR_MS : DAY_MS;
  // Day buckets start at the viewer's midnight: floor in local time, then back to UTC.
  const floor = (t: number) => Math.floor((t + shift) / size) * size - shift;

  const buckets = new Map<number, ApiLogBucket>();
  for (let start = floor(from); start <= to; start += size) {
    buckets.set(start, { start: new Date(start).toISOString(), ok: 0, failed: 0 });
  }
  let failed = 0;
  let failedSignIns = 0;
  const users = new Set<string>();
  for (const e of entries) {
    if (!e.ok) failed++;
    if (!e.ok && e.action === 'auth.sign_in') failedSignIns++;
    if (e.user && e.ok) users.add(e.user);
    const b = buckets.get(floor(Date.parse(e.at)));
    if (b && e.ok) b.ok++;
    else if (b) b.failed++;
  }
  return { actions: entries.length, failed, failedSignIns, activeUsers: users.size, bucket, buckets: [...buckets.values()] };
}
