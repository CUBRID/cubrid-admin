import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ApiLogEntry } from '@api-interfaces';
import { ApiLogService, retentionDays, summarize } from './api-log.service';

const NOW = Date.parse('2026-11-26T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const entry = (over: Partial<ApiLogEntry> = {}): ApiLogEntry => ({
  at: new Date(NOW - HOUR).toISOString(),
  requestId: 'abcd1234',
  user: 'alice',
  action: 'database.start',
  category: 'database',
  method: 'POST',
  path: '/api/h1/database/start/demodb',
  hostUid: 'h1',
  target: 'demodb',
  status: 200,
  ok: true,
  durationMs: 12,
  ...over,
});

describe('ApiLogService', () => {
  let dir: string;
  const previous = { storage: process.env.STORAGE_PATH, retention: process.env.API_LOG_RETENTION_DAYS };
  let repository: { loadUserById: jest.Mock };
  let desktop: boolean;
  const make = () => new ApiLogService({ isDesktopMode: () => desktop } as any, repository as any);

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cwm-api-log-'));
    process.env.STORAGE_PATH = dir;
    delete process.env.API_LOG_RETENTION_DAYS;
    desktop = false;
    repository = {
      loadUserById: jest.fn(async () => ({
        host_groups: { g: { hosts: { h1: { uid: 'h1', alias: 'prod-01' } } } },
      })),
    };
  });

  afterEach(async () => {
    for (const [key, value] of [['STORAGE_PATH', previous.storage], ['API_LOG_RETENTION_DAYS', previous.retention]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('writes one line per entry in a file per day, with the host name', async () => {
    const log = make();
    log.record(entry());
    log.record(entry({ at: new Date(NOW - 2 * DAY).toISOString() }));
    await log.flush();

    const files = (await fs.readdir(ApiLogService.dir())).sort();
    expect(files).toEqual(['2026-11-24.jsonl', '2026-11-26.jsonl']);
    const [line] = (await fs.readFile(path.join(ApiLogService.dir(), '2026-11-26.jsonl'), 'utf8')).trim().split('\n');
    expect(JSON.parse(line)).toMatchObject({ user: 'alice', host: 'prod-01', action: 'database.start' });
  });

  it('keeps writing when the host name cannot be read', async () => {
    repository.loadUserById.mockRejectedValue(new Error('gone'));
    const log = make();
    log.record(entry());
    await log.flush();
    const page = await log.query({}, NOW);
    expect(page.total).toBe(1);
    expect(page.entries[0].host).toBeUndefined();
  });

  it('records nothing in the desktop app', async () => {
    desktop = true;
    const log = make();
    log.record(entry());
    await log.flush();
    await expect(fs.readdir(ApiLogService.dir())).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reads the last 24 hours by default, newest first, a page at a time', async () => {
    const log = make();
    log.record(entry({ at: new Date(NOW - 30 * HOUR).toISOString(), requestId: 'old' }));
    for (let i = 1; i <= 3; i++) log.record(entry({ at: new Date(NOW - i * HOUR).toISOString(), requestId: `r${i}` }));
    await log.flush();

    const page = await log.query({ limit: 2 }, NOW);
    expect(page.total).toBe(3);
    expect(page.entries.map((e) => e.requestId)).toEqual(['r1', 'r2']);
    const next = await log.query({ limit: 2, offset: 2 }, NOW);
    expect(next.entries.map((e) => e.requestId)).toEqual(['r3']);
  });

  it('filters by user, category, result and target', async () => {
    const log = make();
    log.record(entry());
    log.record(entry({ user: 'bob', action: 'auth.sign_in', category: 'auth', ok: false, status: 401, target: undefined, path: '/api/auth/login' }));
    log.record(entry({ user: 'carol', action: 'broker.stop', category: 'broker', target: 'query_editor' }));
    await log.flush();

    const ids = async (q: object) => (await log.query(q, NOW)).entries.map((e) => e.user);
    expect(await ids({ user: 'ALI' })).toEqual(['alice']);
    expect(await ids({ category: 'broker' })).toEqual(['carol']);
    expect(await ids({ result: 'failed' })).toEqual(['bob']);
    expect((await ids({ result: 'ok' })).sort()).toEqual(['alice', 'carol']);
    expect(await ids({ target: 'query' })).toEqual(['carol']);
    expect((await ids({ target: 'prod-01' })).sort()).toEqual(['alice', 'bob', 'carol']);
  });

  it('skips a line cut short by a crash', async () => {
    const log = make();
    log.record(entry());
    await log.flush();
    await fs.appendFile(path.join(ApiLogService.dir(), '2026-11-26.jsonl'), '{"at":"2026-11-26T1');
    expect((await log.query({}, NOW)).total).toBe(1);
  });

  it('deletes day files past the retention period', async () => {
    process.env.API_LOG_RETENTION_DAYS = '7';
    await fs.mkdir(ApiLogService.dir(), { recursive: true });
    for (const day of ['2026-11-10', '2026-11-19', '2026-11-25']) {
      await fs.writeFile(path.join(ApiLogService.dir(), `${day}.jsonl`), '');
    }
    await fs.writeFile(path.join(ApiLogService.dir(), 'notes.txt'), '');
    await make().prune(NOW);
    expect((await fs.readdir(ApiLogService.dir())).sort()).toEqual(['2026-11-19.jsonl', '2026-11-25.jsonl', 'notes.txt']);
  });

  it.each([['0', 90], ['abc', 90], ['30', 30], ['4000', 90]])('reads API_LOG_RETENTION_DAYS=%s as %d', (value, days) => {
    process.env.API_LOG_RETENTION_DAYS = value;
    expect(retentionDays()).toBe(days);
  });
});

describe('summarize', () => {
  it('counts actions, failures, failed sign-ins and active users, by hour', () => {
    const from = NOW - DAY;
    const s = summarize(
      [
        entry({ at: new Date(NOW - 90 * 60_000).toISOString() }),
        entry({ at: new Date(NOW - 80 * 60_000).toISOString(), user: 'bob', ok: false, action: 'auth.sign_in' }),
        entry({ at: new Date(NOW - 10 * 60_000).toISOString(), user: 'carol', ok: false }),
      ],
      from,
      NOW
    );
    expect(s).toMatchObject({ actions: 3, failed: 2, failedSignIns: 1, activeUsers: 1, bucket: 'hour' });
    expect(s.buckets).toHaveLength(25);
    const nonEmpty = s.buckets.filter((b) => b.ok || b.failed);
    expect(nonEmpty).toEqual([
      { start: '2026-11-26T10:00:00.000Z', ok: 1, failed: 1 },
      { start: '2026-11-26T11:00:00.000Z', ok: 0, failed: 1 },
    ]);
  });

  it("uses day buckets past two days, starting at the viewer's midnight", () => {
    // UTC+9: getTimezoneOffset() is -540.
    const s = summarize([entry({ at: '2026-11-25T16:00:00.000Z' })], NOW - 7 * DAY, NOW, -540);
    expect(s.bucket).toBe('day');
    // 16:00 UTC on the 25th is 01:00 on the 26th in UTC+9: that day starts at 15:00 UTC on the 25th.
    expect(s.buckets.find((b) => b.ok)?.start).toBe('2026-11-25T15:00:00.000Z');
  });
});
