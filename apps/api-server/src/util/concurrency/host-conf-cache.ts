import { shareInFlight } from './single-flight';

/**
 * Short-lived, per-host results of conf reads that the start-info poll would
 * otherwise repeat every few seconds on an HA node (cubrid.conf `ha_mode`,
 * databases.txt): an entry lives HOST_CONF_CACHE_TTL_MS. A conf save through
 * this server, a host deletion and a new CMS login clear the host's entries
 * (clearHostConfCache); a read that started before such a clear is not kept,
 * since it may carry the old file. A failed read is not kept either: the
 * next caller reads again. Concurrent callers share one read. Module-level
 * so every service instance shares it.
 */
export const HOST_CONF_CACHE_TTL_MS = 60_000;

type Entry = { value: unknown; expiresAt: number };
const cache = new Map<string, Map<string, Entry>>(); // hostUid -> key -> entry
const clearedAt = new Map<string, number>(); // hostUid -> last clear time

export function getCachedHostConf<T>(hostUid: string, key: string, now = Date.now()): T | undefined {
  const entry = cache.get(hostUid)?.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    cache.get(hostUid)?.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setCachedHostConf<T>(hostUid: string, key: string, value: T, now = Date.now()): void {
  let byKey = cache.get(hostUid);
  if (!byKey) {
    byKey = new Map();
    cache.set(hostUid, byKey);
  }
  byKey.set(key, { value, expiresAt: now + HOST_CONF_CACHE_TTL_MS });
}

/** Drops the host's entries; a read already running does not refill them. */
export function clearHostConfCache(hostUid: string, now = Date.now()): void {
  cache.delete(hostUid);
  clearedAt.set(hostUid, now);
}

/** Every host's entries (tests). */
export function clearAllHostConfCache(): void {
  cache.clear();
  clearedAt.clear();
}

/**
 * The host's live entry for `key`, or the result of `read`, kept for the
 * next callers unless the host was cleared while it ran.
 */
export async function readHostConfCached<T>(
  hostUid: string,
  key: string,
  read: () => Promise<T>,
  now: () => number = Date.now
): Promise<T> {
  const cached = getCachedHostConf<T>(hostUid, key, now());
  if (cached !== undefined) return cached;
  // When the read was asked for (callers joining a read in flight take the
  // first caller's time): a clear after this makes the result stale.
  const startedAt = now();
  return shareInFlight(JSON.stringify(['host-conf', hostUid, key]), async () => {
    const value = await read();
    if ((clearedAt.get(hostUid) ?? 0) <= startedAt) setCachedHostConf(hostUid, key, value, now());
    return value;
  });
}
