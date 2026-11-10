/**
 * The service dashboard reads volume usage (CMS spacedb, a heavy request per
 * database) on its own interval in seconds, not on every dashboard refresh;
 * 0 reads it only on a refresh the user asks for.
 */
export const SERVICE_VOLUME_INTERVAL_OPTIONS = [30, 60, 120, 0] as const;
export const DEFAULT_SERVICE_VOLUME_INTERVAL = 30;
