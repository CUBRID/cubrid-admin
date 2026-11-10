/**
 * How many requests the server sends to one CMS host at the same time
 * (cwm.conf `CMS_MAX_CONCURRENT_REQUESTS_PER_HOST`). The rest wait in the
 * host's queue in order. Read from `process.env` on every use, so a cwm.conf
 * edit applies without a restart (the cwm.conf watcher updates the env).
 */
export const CMS_MAX_CONCURRENT_REQUESTS_PER_HOST = 'CMS_MAX_CONCURRENT_REQUESTS_PER_HOST';
export const CMS_MAX_CONCURRENT_DEFAULT = 4;
export const CMS_MAX_CONCURRENT_MIN = 1;
export const CMS_MAX_CONCURRENT_MAX = 16;

/** The value from `raw`, or the default when it is missing, not a whole number, or out of range. */
export function parseCmsMaxConcurrent(raw: string | undefined): { value: number; invalid: boolean } {
  if (raw === undefined || raw.trim() === '') return { value: CMS_MAX_CONCURRENT_DEFAULT, invalid: false };
  const text = raw.trim();
  const n = /^[0-9]+$/.test(text) ? Number(text) : NaN;
  return n >= CMS_MAX_CONCURRENT_MIN && n <= CMS_MAX_CONCURRENT_MAX
    ? { value: n, invalid: false }
    : { value: CMS_MAX_CONCURRENT_DEFAULT, invalid: true };
}

export function cmsMaxConcurrentFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  return parseCmsMaxConcurrent(env[CMS_MAX_CONCURRENT_REQUESTS_PER_HOST]).value;
}
