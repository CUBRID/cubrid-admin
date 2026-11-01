/**
 * Start/stop/restart in progress, per database of a CMS host
 * (`address:port/dbname`), across every user and tab of this server. CMS
 * itself turns away a second startdb/stopdb on a busy database, but not
 * ha_start/ha_stop, and NCA's per-host request queue only orders single HTTP
 * requests, not whole jobs — so a stop sent while an HA start is still
 * running would also run, and both would report success.
 */
const running = new Map<string, string>();

/** The first of `dbnames` already in progress on `hostKey`, or null. */
export function busyDatabase(hostKey: string, dbnames: string[]): { dbname: string; action: string } | null {
  for (const dbname of dbnames) {
    const action = running.get(`${hostKey}/${dbname}`);
    if (action !== undefined) return { dbname, action };
  }
  return null;
}

/**
 * Runs `fn` holding `dbnames` on `hostKey`; returns null without running it
 * when one of them is already held (see busyDatabase).
 */
export async function withDatabaseActionLock<T>(
  hostKey: string,
  dbnames: string[],
  action: string,
  fn: () => Promise<T>
): Promise<{ busy: { dbname: string; action: string } } | { result: T }> {
  const names = [...new Set(dbnames)];
  const busy = busyDatabase(hostKey, names);
  if (busy) return { busy };
  const keys = names.map((dbname) => `${hostKey}/${dbname}`);
  keys.forEach((key) => running.set(key, action));
  try {
    return { result: await fn() };
  } finally {
    keys.forEach((key) => running.delete(key));
  }
}
