/**
 * One queue per host for read-modify-write of that host's conf files
 * (cubrid.conf, and the raw editors' cm.conf and broker.conf saves). CMS
 * only reads and writes a whole file, so two writers that both read before
 * either writes lose one change. Module-level so every service
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
