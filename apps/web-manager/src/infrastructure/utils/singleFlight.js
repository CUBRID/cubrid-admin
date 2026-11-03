// Share only in-flight reads. Never cache settled responses or coalesce writes.
export function createSingleFlight() {
  const pending = new Map();
  return (key, run) => {
    if (!pending.has(key)) {
      const promise = Promise.resolve().then(run).finally(() => pending.delete(key));
      pending.set(key, promise);
    }
    return pending.get(key);
  };
}

let lastSeq = 0;

// Increases every time something reads or changes server state, so a result
// can be compared with what was already applied: a larger seq is newer.
export const nextSeq = () => ++lastSeq;

/**
 * Shares reads per key: at most one request in flight and one queued.
 *
 * A plain read joins the request in flight. Most of its wait is the
 * api-server's per-host queue, and CMS reads the state when it finally runs
 * the request, so the shared result is as new as a separate request's.
 *
 * A `fresh` read (a user refresh, or a read right after an action) needs a
 * request sent after it was asked for, so it waits for the one in flight and
 * shares the next one.
 *
 * `run(seq)` is called once per request actually sent. The promise never
 * rejects: it resolves to `{ ok: true, value, seq }` or `{ ok: false, error,
 * seq }`, so a failure can be compared with what was applied too. Never cache
 * settled responses or coalesce writes.
 */
export function createSharedReads() {
  const entries = new Map(); // key -> { current, next }

  const launch = (run) => {
    const seq = nextSeq();
    return Promise.resolve()
      .then(() => run(seq))
      .then((value) => ({ ok: true, value, seq }), (error) => ({ ok: false, error, seq }));
  };

  // When a request settles, the queued one (if any) becomes the one in flight.
  const settle = (key, promise) => {
    const entry = entries.get(key);
    if (!entry || entry.current !== promise) return;
    if (entry.next) {
      entry.current = entry.next;
      entry.next = null;
    } else {
      entries.delete(key);
    }
  };

  const track = (key, promise) => {
    promise.then(() => settle(key, promise));
    return promise;
  };

  return (key, run, { fresh = false } = {}) => {
    const entry = entries.get(key);
    if (!entry) {
      const current = launch(run);
      entries.set(key, { current, next: null });
      return track(key, current);
    }
    if (!fresh) return entry.current;
    if (!entry.next) {
      entry.next = track(key, entry.current.then(() => launch(run)));
    }
    return entry.next;
  };
}
