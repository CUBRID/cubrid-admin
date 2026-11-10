/**
 * How much of a log Top SQL analyzes in one CMS viewlog read (cwm.conf
 * `TOPSQL_MAX_LOG_LINES`, `TOPSQL_MAX_LOG_MB`). A larger log is refused with
 * the limits in the error. Read from `process.env` on every capture, so a
 * cwm.conf edit applies without a restart (the cwm.conf watcher updates the
 * env). The read's time limit grows with the size limit.
 */
export const TOPSQL_MAX_LOG_LINES = 'TOPSQL_MAX_LOG_LINES';
export const TOPSQL_MAX_LOG_MB = 'TOPSQL_MAX_LOG_MB';
// Measured on a CMS container (one viewlog read of a broker SQL log, CMS
// started fresh): 13.5 MB -> CMS peak 425 MiB, 27 MB -> 835 MiB, 63 MB ->
// 1.9 GiB, and CMS keeps that memory after the read; a 90 MB log made
// cub_manager exit. CMS runs on the database machine, so the default stays
// near the old 16 MiB and the maximum stays below what CMS survived.
export const TOPSQL_LINES = { default: 200_000, min: 1_000, max: 700_000 } as const;
export const TOPSQL_MB = { default: 16, min: 1, max: 64 } as const;
/** 30 s for every 16 MiB of the size limit, at least 30 s. */
const TIMEOUT_MS_PER_16_MIB = 30_000;

/** A whole number from `raw` within `range`, or the default (`invalid` when `raw` was given but unusable). */
export function parseIntSetting(
  raw: string | undefined,
  range: { default: number; min: number; max: number }
): { value: number; invalid: boolean } {
  if (raw === undefined || raw.trim() === '') return { value: range.default, invalid: false };
  const text = raw.trim();
  const n = /^[0-9]+$/.test(text) ? Number(text) : NaN;
  return n >= range.min && n <= range.max ? { value: n, invalid: false } : { value: range.default, invalid: true };
}

export function topSqlLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): {
  maxLines: number; maxMiB: number; maxBytes: number; timeoutMs: number;
} {
  const maxLines = parseIntSetting(env[TOPSQL_MAX_LOG_LINES], TOPSQL_LINES).value;
  const maxMiB = parseIntSetting(env[TOPSQL_MAX_LOG_MB], TOPSQL_MB).value;
  return {
    maxLines,
    maxMiB,
    maxBytes: maxMiB * 1024 * 1024,
    timeoutMs: Math.max(1, Math.ceil(maxMiB / 16)) * TIMEOUT_MS_PER_16_MIB,
  };
}
