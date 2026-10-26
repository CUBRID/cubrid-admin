import { EngineKnownKeys } from '../engine-known-keys';
import { ParamGuard } from '../param-guard';
import { ENGINE_PARAM_CATALOG, EngineCatalogDbParam, EngineCatalogVersion } from './engine-param-catalog.generated';

const versionParts = (version: string) => (version.match(/\d+(?:\.\d+)*/)?.[0] ?? '').split('.').slice(0, 3);

const numberOrUndefined = (v: string | null) => (v !== null && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : undefined);

/**
 * The engine's own type rules for a key, as far as the catalog can tell.
 * Limits are only used when they're in the same unit the conf value is
 * written in (no DIFFER_UNIT conversion), and only when they evaluated to
 * a plain number.
 */
export function guardFromCatalog(c: EngineCatalogDbParam): ParamGuard | undefined {
  if (c.obsoleted || c.datatype === 'none') return undefined;
  const sameUnit = !c.differUnit;
  const min = sameUnit ? numberOrUndefined(c.lowerLimit) : undefined;
  const max = sameUnit ? numberOrUndefined(c.upperLimit) : undefined;
  const bounds = { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
  if (c.sizeUnit) {
    if (c.datatype !== 'bigint') return { kind: 'size' };
    // Keep the catalog's decimal strings: INT64-sized limits lose precision as numbers.
    return { kind: 'size', ...(min !== undefined ? { min: String(c.lowerLimit) } : {}), ...(max !== undefined ? { max: String(c.upperLimit) } : {}) };
  }
  if (c.timeUnit) return { kind: 'time', ...bounds };
  switch (c.datatype) {
    case 'boolean': return { kind: 'boolean' };
    case 'integer': return { kind: 'int', ...bounds };
    case 'float': return { kind: 'float', ...bounds };
    case 'bigint': return { kind: 'bigint', ...(min !== undefined ? { min: String(c.lowerLimit) } : {}), ...(max !== undefined ? { max: String(c.upperLimit) } : {}) };
    case 'integerList': return { kind: 'intList', ...(c.key === 'call_stack_dump_activation_list' ? { allowDefaultElement: true } : {}) };
    case 'keyword': return { kind: 'opaque' };
    case 'string': return { kind: 'string' };
    default: return undefined;
  }
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
