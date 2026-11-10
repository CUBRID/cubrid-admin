/**
 * Composite key for a client cache of something that lives on one host and
 * is named there: a broker, a log file path, ... (databases use dbKey, which
 * is the same shape). A name or path is NOT unique across hosts — two hosts
 * can each have a broker "query_editor" or a file
 * "/home/cubrid/CUBRID/log/broker/query_editor.err" — so these caches are
 * keyed by (host, name), never by the name alone, or one host's value shows
 * on the other host's screen.
 */
export function hostKey(hostUid, name) {
  return `${hostUid}:${name}`;
}

/** Drops every entry of `map` that belongs to `hostUid`. */
export function deleteHostKeys(map, hostUid) {
  const prefix = `${hostUid}:`;
  Object.keys(map).forEach((key) => {
    if (key.startsWith(prefix)) delete map[key];
  });
}
