import { ResolvedParamSchemaEntry } from '../param-schema-entry';
import { ENGINE_PARAM_CATALOG, EngineCatalogDbParam, EngineCatalogVersion } from './engine-param-catalog.generated';

// createdb's default --db-page-size is 16K and the log page size defaults
// to it, so page-unit defaults are shown in bytes at 16K pages.
const DEFAULT_PAGE_BYTES = 16 * 1024;

const versionParts = (version: string) => (version.match(/\d+(?:\.\d+)*/)?.[0] ?? '').split('.').slice(0, 3);

/** The catalog version whose defaults describe a host: exact match, else the newest of the same major.minor, else the newest overall. */
export function catalogVersionFor(engineVersion: string): EngineCatalogVersion {
  const [major, minor, patch] = versionParts(engineVersion);
  const versions = ENGINE_PARAM_CATALOG.versions;
  const exact = versions.find((v) => versionParts(v.engineVersion).join('.') === [major, minor, patch].join('.'));
  if (exact) return exact;
  const sameLine = versions.filter((v) => {
    const [vMajor, vMinor] = versionParts(v.engineVersion);
    return vMajor === major && vMinor === minor;
  });
  const byVersion = (a: EngineCatalogVersion, b: EngineCatalogVersion) =>
    versionParts(a.engineVersion).map(Number).reduce((d, n, i) => d || n - Number(versionParts(b.engineVersion)[i] ?? 0), 0);
  return [...(sameLine.length > 0 ? sameLine : versions)].sort(byVersion).at(-1) as EngineCatalogVersion;
}

// Bytes in conf syntax: the largest K/M/G/T unit that divides evenly, else plain bytes.
function bytesToConf(bytes: number): string {
  if (bytes === 0) return '0';
  for (const [unit, factor] of [['T', 1024 ** 4], ['G', 1024 ** 3], ['M', 1024 ** 2], ['K', 1024]] as const) {
    if (bytes % factor === 0) return `${bytes / factor}${unit}`;
  }
  return String(bytes);
}

// Milliseconds in conf syntax (util_time_string_to_msec units).
function msecToConf(ms: number): string {
  if (ms <= 0) return String(ms);
  for (const [unit, factor] of [['h', 3600000], ['min', 60000], ['s', 1000]] as const) {
    if (ms % factor === 0) return `${ms / factor}${unit}`;
  }
  return `${ms}ms`;
}

const isNumber = (v: string | null): v is string => v !== null && /^-?\d+(\.\d+)?$/.test(v);

/**
 * The engine's own default for a key, written the way cubrid.conf would
 * spell it — or undefined when the catalog value can't be shown as-is
 * (keyword constants, string expressions, other DIFFER_UNIT conversions).
 */
export function catalogDefaultToConf(c: EngineCatalogDbParam): string | undefined {
  const d = c.defaultValue;
  if (c.datatype === 'boolean') return d === 'true' ? 'yes' : d === 'false' ? 'no' : undefined;
  if (!isNumber(d)) return undefined;
  const n = Number(d);
  if (c.sizeUnit && !c.differUnit && c.datatype === 'bigint') return bytesToConf(n);
  // DIFFER_UNIT sizes are stored in pages (prm_size_to_io_pages /
  // prm_size_to_log_pages); show them in bytes at the default page size.
  if (c.sizeUnit && c.differUnit) return bytesToConf(Math.round(n * DEFAULT_PAGE_BYTES));
  // DIFFER_UNIT times are stored in seconds (prm_msec_to_sec); -1 etc. stay as-is.
  if (c.timeUnit && c.differUnit) return msecToConf(n < 0 ? n : n * 1000);
  if (c.timeUnit) return msecToConf(n);
  if (c.differUnit) return undefined;
  if (c.datatype === 'integer' || c.datatype === 'float' || c.datatype === 'bigint') return d;
  return undefined;
}

function scopeFromFlags(flags: string[]): ResolvedParamSchemaEntry['scope'] | undefined {
  const server = flags.includes('PRM_FOR_SERVER');
  const client = flags.includes('PRM_FOR_CLIENT');
  if (server && client) return 'BOTH';
  if (server) return 'SERVER';
  if (client) return 'CLIENT';
  return undefined;
}

/**
 * Replaces the hand-written `default` (and the informational `scope`) of
 * resolved cubrid.conf entries with the engine catalog's own values for
 * this host's version wherever the catalog value can be shown directly.
 * Keyword defaults and string expressions keep the hand-written value.
 */
export function applyCatalogDefaults(entries: ResolvedParamSchemaEntry[], engineVersion: string): ResolvedParamSchemaEntry[] {
  const byKey = new Map(catalogVersionFor(engineVersion).db.map((c) => [c.key.toLowerCase(), c]));
  return entries.map((entry) => {
    const c = byKey.get(entry.key.toLowerCase());
    if (!c) return entry;
    const next = { ...entry };
    const def = catalogDefaultToConf(c);
    if (def !== undefined) next.default = def;
    const scope = scopeFromFlags(c.flags);
    if (entry.scope && scope) next.scope = scope;
    return next;
  });
}
