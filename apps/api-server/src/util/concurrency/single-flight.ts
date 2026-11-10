/**
 * Shares a read that is already in flight for the same key: a caller that
 * arrives while one is pending gets that promise instead of sending its own
 * request. Only reads in flight are shared; a settled result is never kept,
 * and writes must not go through here. A shared failure reaches every
 * caller that joined it.
 *
 * CMS requests to one host run one at a time (CmsHttpsClientService's host
 * queue), so a read that is still pending has not run yet or is running
 * now; a caller that joins it gets a result at least as new as its own
 * request would have been. Module-level so every service instance shares
 * one table (DatabaseModule and CmsJobModule each create their own
 * services).
 */
const inFlight = new Map<string, Promise<unknown>>();

export function shareInFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const promise = Promise.resolve()
    .then(run)
    .finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}
