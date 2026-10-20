/**
 * Composite key for any per-database client cache (login state, users,
 * backup schedules, query plans, space/dashboard info, param/plan dump,
 * auto-volume config, ...). A bare dbname is NOT unique across hosts —
 * two different hosts can each have a database named e.g. "demodb" — so
 * every one of these caches must be keyed by (host, database), never by
 * dbname alone, or state from one host's db leaks into another host's
 * same-named db (wrong "logged in" status, shared user lists, etc).
 */
export function dbKey(hostUid, dbname) {
  return `${hostUid}:${dbname}`;
}
