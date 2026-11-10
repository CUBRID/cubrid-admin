/**
 * Whether the service dashboard's background refresh reads a host's volume
 * usage this time: on the first read, then once `intervalSeconds` have passed
 * since the last one. 0 reads it only on a refresh the user asks for.
 */
export function volumesDue(lastReadAt, intervalSeconds, now) {
  if (!lastReadAt) return true;
  if (!(intervalSeconds > 0)) return false;
  return now - lastReadAt >= intervalSeconds * 1000;
}
