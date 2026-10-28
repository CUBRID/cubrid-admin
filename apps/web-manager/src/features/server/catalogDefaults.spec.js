import { describe, expect, it } from 'vitest';
import { parseEngineSizeToBytes } from '@api-interfaces';
import { resolveParamSchema } from '@api-interfaces/param-schema/resolve-param-schema';
import { DATABASE_PARAM_SCHEMA } from '@api-interfaces/param-schema/database-param-schema';
import { ENGINE_PARAM_CATALOG } from '@api-interfaces/param-schema/engine-catalog/engine-param-catalog.generated';
import { applyCatalogDefaults, catalogDefaultToConf, catalogVersionFor } from '@api-interfaces/param-schema/engine-catalog/catalog-defaults';

const TIME_MS = { '': 1, ms: 1, s: 1000, min: 60000, h: 3600000 };
function canonical(kind, value) {
  const v = String(value).trim();
  if (kind === 'size') return parseEngineSizeToBytes(v);
  if (kind === 'time') { const m = /^(-?\d+)(ms|s|min|h)?$/.exec(v); return m ? Number(m[1]) * (Number(m[1]) < 0 ? 1 : TIME_MS[m[2] ?? '']) : v; }
  if (kind === 'boolean') return ['yes', 'y', '1', 'true', 'on'].includes(v.toLowerCase());
  if (['int', 'float', 'bigint'].includes(kind)) return Number(v);
  return v;
}

describe('engine-catalog defaults', () => {
  it('every hand-written default the catalog can express agrees with it, on every catalogued version', () => {
    const mismatches = [];
    for (const version of ENGINE_PARAM_CATALOG.versions) {
      const byKey = new Map(version.db.map(c => [c.key, c]));
      for (const entry of resolveParamSchema(DATABASE_PARAM_SCHEMA, version.engineVersion)) {
        const fromCatalog = catalogDefaultToConf(byKey.get(entry.key));
        if (fromCatalog === undefined) continue;
        if (canonical(entry.guard.kind, entry.default) !== canonical(entry.guard.kind, fromCatalog)) {
          mismatches.push(`${entry.key} @ ${version.label}: schema ${entry.default}, engine ${fromCatalog}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('the server sends catalog defaults in conf syntax (pages shown as bytes at 16K, seconds as time units)', () => {
    const resolved = applyCatalogDefaults(resolveParamSchema(DATABASE_PARAM_SCHEMA, '11.4.5.1907'), '11.4.5.1907');
    const def = key => resolved.find(e => e.key === key).default;
    expect(def('data_buffer_size')).toBe('512M');
    expect(def('log_buffer_size')).toBe('256M');
    expect(def('checkpoint_interval')).toBe('6min');
    expect(def('lock_timeout')).toBe('-1');
    expect(def('async_commit')).toBe('no');
    expect(def('db_volume_size')).toBe('512M');
    // Keyword defaults keep their hand-written display value.
    expect(def('ha_mode')).toBe('off');
  });

  it('picks the exact catalog version, else the newest of the same line', () => {
    expect(catalogVersionFor('CUBRID 11.4.5 (11.4.5.1907-7077e91)').label).toBe('v11.4.5');
    expect(catalogVersionFor('11.4.3').label).toBe('release/11.4');
    expect(catalogVersionFor('11.2.1').label).toBe('release/11.2');
  });
});
