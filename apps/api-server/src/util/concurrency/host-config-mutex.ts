/**
 * One queue per physical CMS host for read-modify-write of that host's conf
 * files (cubrid.conf, and the raw editors' cm.conf and broker.conf saves).
 * CMS only reads and writes a whole file, so two writers that both read
 * before either writes lose one change. Keyed by the host's address and
 * port, not hostUid: each user registers the same host under their own uid.
 * Module-level so every service instance shares it (DatabaseModule and
 * CmsJobModule each create their own services). Use it through
 * BaseService.withHostConfigMutex, which builds the key.
 */
const hostConfigQueues = new Map<string, Promise<void>>();

/** The queue key of a CMS host. */
export const hostConfigKey = (host: { address: string; port: number | string }): string =>
  JSON.stringify([host.address, Number(host.port)]);

export async function withHostConfigQueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const pending = hostConfigQueues.get(key) ?? Promise.resolve();
  let resolve!: () => void;
  const next = new Promise<void>((r) => (resolve = r));
  hostConfigQueues.set(key, next);
  try {
    await pending;
    return await fn();
  } finally {
    resolve();
    if (hostConfigQueues.get(key) === next) {
      hostConfigQueues.delete(key);
    }
  }
}
