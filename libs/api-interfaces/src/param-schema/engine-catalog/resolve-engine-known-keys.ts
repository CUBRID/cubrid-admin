import { EngineKnownKeys } from '../engine-known-keys';
import { ParamGuard } from '../param-guard';
import { ENGINE_PARAM_CATALOG, EngineCatalogDbParam, EngineCatalogVersion } from './engine-param-catalog.generated';

const versionParts = (version: string) => (version.match(/\d+(?:\.\d+)*/)?.[0] ?? '').split('.').slice(0, 3);

const numberOrUndefined = (v: string | null) => (v !== null && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : undefined);

const INT_MAX = 2147483647;
const INT_MIN = -2147483648;
// The largest finite float: (float) strtod of anything larger is inf, which the engine stores
// when the key has no upper limit. Rejected here, which is stricter than the engine.
const FLT_MAX = 3.4028234663852886e38;
const UINT64_MAX = '18446744073709551615';
// Every process reads cubrid.conf before it knows the database's page size, so with the default
// 16K pages (storage_common.c db_Io_page_size / db_Log_page_size), and a value out of range there
// fails the load: cub_server does not start (ER_BO_CANT_LOAD_SYSPRM). Checked on a 4K-page 11.4.5
// database: data_buffer_size=16760832 (1023 pages at 16K) is refused, 16760833 starts; the reload
// at the real page size (log_get_io_page_size) did not refuse index_scan_oid_buffer_size=128K
// (32 pages at 4K, limit 16). So 16K is what decides.
const LOAD_PAGE_SIZE = 16384;

/**
 * PRM_DIFFER_UNIT limits are in the unit the engine stores (pages, seconds), and the conf value is
 * converted to that unit by `setDup` before the range check. Returns the limits in the conf value's
 * own unit (bytes or milliseconds), or null when the conversion isn't one of these.
 */
function differUnitBounds(c: EngineCatalogDbParam): { min?: number; max?: number } | null {
  const lower = numberOrUndefined(c.lowerLimit);
  const upper = numberOrUndefined(c.upperLimit);
  switch (c.setDup) {
    case 'prm_equal_to_ori':
      return { min: lower, max: upper };
    case 'prm_size_to_io_pages':
    case 'prm_size_to_log_pages': {
      const P = LOAD_PAGE_SIZE;
      if (c.datatype === 'float') {
        // pages = ceilf (bytes / P * 100) / 100, compared with limits also rounded up to 0.01
        // (prm_check_range).
        const l = lower !== undefined ? Math.ceil(lower * 100) : undefined;
        const u = upper !== undefined ? Math.ceil(upper * 100) : undefined;
        return {
          min: l !== undefined && l > 0 ? Math.floor(((l - 1) * P) / 100) + 1 : undefined,
          max: u !== undefined ? Math.floor((u * P) / 100) : undefined,
        };
      }
      // pages = ceil (bytes / P); more than INT_MAX pages fails too.
      const maxPages = Math.min(upper ?? INT_MAX, INT_MAX);
      return {
        min: lower !== undefined && lower >= 1 ? (lower - 1) * P + 1 : undefined,
        max: maxPages * P,
      };
    }
    case 'prm_msec_to_sec': {
      // seconds = ceil (ms / 1000) for ms >= 0; a negative value is kept as is.
      const maxSec = Math.min(upper ?? INT_MAX, INT_MAX);
      return {
        min: lower === undefined ? undefined : lower >= 1 ? (lower - 1) * 1000 + 1 : lower,
        max: maxSec * 1000,
      };
    }
    case 'prm_min_to_sec': {
      // seconds = minutes * 60 for minutes >= 0 (more than INT_MAX seconds fails); a negative
      // value is kept as is.
      const maxSec = Math.min(upper ?? INT_MAX, INT_MAX);
      return {
        min: lower === undefined ? undefined : lower >= 1 ? Math.ceil(lower / 60) : lower,
        max: Math.floor(maxSec / 60),
      };
    }
    default:
      return null;
  }
}

/** The engine's own type rules for a key, as far as the catalog can tell. */
export function guardFromCatalog(c: EngineCatalogDbParam): ParamGuard | undefined {
  if (c.obsoleted || c.datatype === 'none') return undefined;
  const converted = c.differUnit ? differUnitBounds(c) : null;
  // Without a known conversion, DIFFER_UNIT limits are in another unit and can't be used.
  const min = c.differUnit ? converted?.min : numberOrUndefined(c.lowerLimit);
  const max = c.differUnit ? converted?.max : numberOrUndefined(c.upperLimit);
  const bounds = { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
  if (c.sizeUnit) {
    if (c.differUnit) return { kind: 'size', ...bounds };
    // Keep the catalog's decimal strings: INT64-sized limits lose precision as numbers. The
    // engine casts the parsed bytes to UINT64, so that is the ceiling when no limit is set.
    return {
      kind: 'size',
      ...(min !== undefined ? { min: String(c.lowerLimit) } : {}),
      max: max !== undefined ? String(c.upperLimit) : UINT64_MAX,
    };
  }
  if (c.timeUnit) return { kind: 'time', ...bounds };
  switch (c.datatype) {
    case 'boolean': return { kind: 'boolean' };
    case 'integer': return { kind: 'int', ...bounds };
    case 'float': return { kind: 'float', ...bounds, ...(max === undefined ? { max: FLT_MAX } : {}) };
    case 'bigint': return { kind: 'bigint', ...(min !== undefined ? { min: String(c.lowerLimit) } : {}), ...(max !== undefined ? { max: String(c.upperLimit) } : {}) };
    case 'integerList': return { kind: 'intList', ...(c.key === 'call_stack_dump_activation_list' ? { allowDefaultElement: true } : {}) };
    case 'keyword': return keywordGuard(c);
    case 'string': return { kind: 'string' };
    default: return undefined;
  }
}

/**
 * PRM_KEYWORD (sysprm_generate_new_value): a word from the key's table, case-insensitive, or
 * else any integer; either way the resulting number must be within the key's limits.
 */
function keywordGuard(c: EngineCatalogDbParam): ParamGuard {
  const min = numberOrUndefined(c.lowerLimit) ?? INT_MIN;
  const max = numberOrUndefined(c.upperLimit) ?? INT_MAX;
  if (!c.keywords) return { kind: 'opaque' };
  const words = c.keywords
    .filter(({ value }) => {
      const n = numberOrUndefined(value);
      return n === undefined || (n >= min && n <= max);
    })
    .map(({ word }) => word);
  return { kind: 'enum', options: [...new Set(words)], numericRange: { min, max } };
}

function keysOf(versions: EngineCatalogVersion[]): Omit<EngineKnownKeys, 'strict' | 'catalogVersion'> {
  const database = new Set<string>();
  const broker = new Set<string>();
  const databaseGuards: Record<string, ParamGuard> = {};
  const deprecated = new Set<string>();
  for (const v of versions) {
    for (const p of v.db) {
      const key = p.key.toLowerCase();
      database.add(key);
      // Later versions win — `versions` is oldest first.
      const guard = guardFromCatalog(p);
      if (guard) databaseGuards[key] = guard;
      else delete databaseGuards[key];
      if (p.deprecated && !p.obsoleted) deprecated.add(key);
      else deprecated.delete(key);
    }
    // buildCondition keys (CGW_*) only exist in the ODBC-gateway build,
    // which reads cubrid_gateway.conf, not cubrid_broker.conf.
    for (const k of v.broker) if (!k.buildCondition) broker.add(k.key.toLowerCase());
  }
  return { database: [...database].sort(), broker: [...broker].sort(), databaseGuards, databaseDeprecated: [...deprecated].sort() };
}

/** Backend-only: pulls in the full generated catalog. */
export function resolveEngineKnownKeys(engineVersion: string): EngineKnownKeys {
  const [major, minor, patch] = versionParts(engineVersion);
  const exact = ENGINE_PARAM_CATALOG.versions.find((v) => versionParts(v.engineVersion).join('.') === [major, minor, patch].join('.'));
  if (exact) return { strict: true, catalogVersion: exact.engineVersion, ...keysOf([exact]) };
  const sameLine = ENGINE_PARAM_CATALOG.versions.filter((v) => {
    const [vMajor, vMinor] = versionParts(v.engineVersion);
    return vMajor === major && vMinor === minor;
  });
  return { strict: false, catalogVersion: null, ...keysOf(sameLine.length > 0 ? sameLine : ENGINE_PARAM_CATALOG.versions) };
}
