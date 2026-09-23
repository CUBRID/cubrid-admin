/**
 * Like `Promise.allSettled(items.map(fn))`, but runs at most `limit` calls to
 * `fn` at once instead of firing every item simultaneously. Needed wherever
 * an item count controlled by the caller (e.g. every non-HA database on a
 * host) fans out into individual CMS async-job requests — CMS enforces a
 * small global cap on concurrently in-flight async jobs per host, shared
 * across every task and user, so firing more than that at once gets the
 * excess rejected outright instead of just queued.
 */
export async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  limit: number,
  fn: (item: TInput, index: number) => Promise<TOutput>
): Promise<PromiseSettledResult<TOutput>[]> {
  const results: PromiseSettledResult<TOutput>[] = new Array(items.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      try {
        const value = await fn(items[current], current);
        results[current] = { status: 'fulfilled', value };
      } catch (reason) {
        results[current] = { status: 'rejected', reason };
      }
    }
  };

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, runWorker));

  return results;
}
