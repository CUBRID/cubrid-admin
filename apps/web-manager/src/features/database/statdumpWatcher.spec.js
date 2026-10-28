import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./databaseApi', () => ({ databaseApi: {} }));

import {
  acquireStatdumpWatcher,
  restartFrozenStatdumpWatcher,
  WATCHER_REFRESH_MS,
  STOP_GRACE_MS,
  FROZEN_RESTART_MS,
  RESTART_COOLDOWN_MS,
} from './statdumpWatcher';

const makeApi = () => ({
  startStatDumpWatcher: vi.fn().mockResolvedValue({ running: true }),
  stopStatDumpWatcher: vi.fn().mockResolvedValue({ running: false }),
});

let api;
const releases = [];
const acquire = (host = 'h1', db = 'demodb') => {
  const release = acquireStatdumpWatcher(host, db, api);
  releases.push(release);
  return release;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  api = makeApi();
});

afterEach(async () => {
  releases.splice(0).forEach((release) => release());
  await vi.advanceTimersByTimeAsync(STOP_GRACE_MS);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('acquireStatdumpWatcher', () => {
  it('starts once per host+db and re-issues start periodically', async () => {
    acquire();
    acquire();
    expect(api.startStatDumpWatcher).toHaveBeenCalledTimes(1);
    expect(api.startStatDumpWatcher).toHaveBeenCalledWith('h1', 'demodb');

    await vi.advanceTimersByTimeAsync(WATCHER_REFRESH_MS);
    expect(api.startStatDumpWatcher).toHaveBeenCalledTimes(2);
  });

  it('stops only after the last holder releases, after the grace period', async () => {
    const first = acquire();
    const second = acquire();

    first();
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS);
    expect(api.stopStatDumpWatcher).not.toHaveBeenCalled();

    second();
    second(); // releasing twice is a no-op
    expect(api.stopStatDumpWatcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS);
    expect(api.stopStatDumpWatcher).toHaveBeenCalledTimes(1);
    expect(api.stopStatDumpWatcher).toHaveBeenCalledWith('h1', 'demodb');

    // Stopped: no more periodic starts.
    await vi.advanceTimersByTimeAsync(WATCHER_REFRESH_MS * 2);
    expect(api.startStatDumpWatcher).toHaveBeenCalledTimes(1);
  });

  it('does not stop when re-acquired within the grace period (tab reopen, StrictMode)', async () => {
    acquire()();
    acquire();
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS * 2);
    expect(api.stopStatDumpWatcher).not.toHaveBeenCalled();
    expect(api.startStatDumpWatcher).toHaveBeenCalledTimes(1);
  });

  it('keeps separate watchers per database and survives a failed start', async () => {
    api.startStatDumpWatcher.mockRejectedValueOnce(new Error('timeout'));
    acquire('h1', 'a');
    acquire('h1', 'b');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.startStatDumpWatcher.mock.calls).toEqual([['h1', 'a'], ['h1', 'b']]);
  });
});

describe('restartFrozenStatdumpWatcher', () => {
  it('stops then starts a held watcher whose counters stopped moving, with a cooldown', async () => {
    acquire();
    const t0 = 1_000_000;

    expect(restartFrozenStatdumpWatcher('h1', 'demodb', t0, t0 + FROZEN_RESTART_MS - 1, api)).toBe(false);
    expect(restartFrozenStatdumpWatcher('h1', 'demodb', t0, t0 + FROZEN_RESTART_MS, api)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.stopStatDumpWatcher).toHaveBeenCalledTimes(1);
    expect(api.startStatDumpWatcher).toHaveBeenCalledTimes(2);

    expect(restartFrozenStatdumpWatcher('h1', 'demodb', t0, t0 + FROZEN_RESTART_MS + 1000, api)).toBe(false);
    expect(restartFrozenStatdumpWatcher('h1', 'demodb', t0, t0 + FROZEN_RESTART_MS + RESTART_COOLDOWN_MS, api)).toBe(true);
  });

  it('does not start again when the last holder left while the stop was in flight', async () => {
    const release = acquire();
    let resolveStop;
    api.stopStatDumpWatcher.mockReturnValueOnce(new Promise((resolve) => { resolveStop = resolve; }));
    expect(restartFrozenStatdumpWatcher('h1', 'demodb', 1_000_000, 1_000_000 + FROZEN_RESTART_MS, api)).toBe(true);

    release();
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS);
    expect(api.stopStatDumpWatcher).toHaveBeenCalledTimes(2);

    resolveStop({ running: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.startStatDumpWatcher).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a database nobody holds', () => {
    expect(restartFrozenStatdumpWatcher('h1', 'other', 1, 1 + FROZEN_RESTART_MS, api)).toBe(false);
    expect(api.stopStatDumpWatcher).not.toHaveBeenCalled();
  });
});

describe('page exit', () => {
  it('stops every held watcher with a keepalive request on pagehide', async () => {
    acquire('h1', 'a');
    acquire('h2', 'b');
    window.dispatchEvent(new Event('pagehide'));
    expect(api.stopStatDumpWatcher.mock.calls).toEqual([
      ['h1', 'a', { keepalive: true }],
      ['h2', 'b', { keepalive: true }],
    ]);
  });

  it('starts held watchers again when the page is restored from the bfcache', () => {
    acquire();
    const pageshow = (persisted) => {
      const event = new Event('pageshow');
      Object.defineProperty(event, 'persisted', { value: persisted });
      window.dispatchEvent(event);
    };
    pageshow(false);
    expect(api.startStatDumpWatcher).toHaveBeenCalledTimes(1);
    pageshow(true);
    expect(api.startStatDumpWatcher).toHaveBeenCalledTimes(2);
  });
});
