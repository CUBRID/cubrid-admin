/**
 * One queue per host for read-modify-write of that host's cubrid.conf.
 * CMS only reads and writes the whole file, so two writers that both read
 * before either writes lose one change. Module-level so every service
 * instance shares it (DatabaseModule and CmsJobModule each create their own
 * DatabaseConfigService/DatabaseManagementService).
 */
const hostConfigQueues = new Map<string, Promise<void>>();

export async function withHostConfigMutex<T>(hostUid: string, fn: () => Promise<T>): Promise<T> {
  const pending = hostConfigQueues.get(hostUid) ?? Promise.resolve();
  let resolve!: () => void;
  const next = new Promise<void>((r) => (resolve = r));
  hostConfigQueues.set(hostUid, next);
  try {
    await pending;
    return await fn();
  } finally {
    resolve();
    if (hostConfigQueues.get(hostUid) === next) {
      hostConfigQueues.delete(hostUid);
    }
  }
}
