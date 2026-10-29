import { describe, expect, it } from 'vitest';
import { compareEngineVersions } from '@api-interfaces/param-schema/resolve-param-schema';
import { DATABASE_PARAM_SCHEMA } from '@api-interfaces/param-schema/database-param-schema';
import { BROKER_PARAM_SCHEMA } from '@api-interfaces/param-schema/broker-param-schema';
import { BROKER_KEY_GUARDS } from '@api-interfaces/param-schema/broker-key-guards';
import { ENGINE_PARAM_CATALOG } from '@api-interfaces/param-schema/engine-catalog/engine-param-catalog.generated';
import { DEPRECATED_PARAM_REPLACEMENTS } from '@api-interfaces/param-schema/deprecated-param-replacements';

// Keeps the hand-written schema honest against the engine's own prm_Def[]
// (regenerated from source): every key must exist in each engine version
// it's resolved for, its guard kind must match the engine datatype, and
// its bounds must never be looser than the engine's (looser = NCA saves a
// value the engine refuses to load). DIFFER_UNIT keys are converted to
// pages by the engine, so their byte bounds are hand-derived and skipped here.

const KIND_FOR = c => {
  if (c.sizeUnit) return ['size'];
  if (c.timeUnit) return ['time'];
  return {
    boolean: ['boolean'], keyword: ['enum'], integer: ['int'], float: ['float'],
    bigint: ['bigint'], string: ['string'], integerList: ['intList'],
  }[c.datatype] ?? [];
};

const appliesTo = (entry, engineVersion) =>
  (!entry.minVersion || compareEngineVersions(engineVersion, entry.minVersion) >= 0) &&
  (!entry.maxVersion || compareEngineVersions(engineVersion, entry.maxVersion) <= 0);

const numeric = v => (v !== null && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null);

function findViolations() {
  const violations = [];
  for (const version of ENGINE_PARAM_CATALOG.versions) {
    const byKey = new Map(version.db.map(c => [c.key.toLowerCase(), c]));
    for (const entry of DATABASE_PARAM_SCHEMA.filter(e => appliesTo(e, version.engineVersion))) {
      const where = `${entry.key} @ ${version.label}`;
      const c = byKey.get(entry.key.toLowerCase());
      if (!c) { violations.push(`${where}: key not accepted by this engine build`); continue; }
      if (!KIND_FOR(c).includes(entry.guard.kind)) {
        violations.push(`${where}: guard kind '${entry.guard.kind}' but engine datatype '${c.datatype}'${c.sizeUnit ? ' (size unit)' : ''}${c.timeUnit ? ' (time unit)' : ''}`);
      }
      if (c.differUnit || !['int', 'float', 'bigint', 'size'].includes(entry.guard.kind)) continue;
      const lower = numeric(c.lowerLimit);
      const upper = numeric(c.upperLimit);
      const min = entry.guard.min === undefined ? null : Number(entry.guard.min);
      const max = entry.guard.max === undefined ? null : Number(entry.guard.max);
      const isInt32Kind = entry.guard.kind === 'int';
      const sizeFloor = ['size', 'bigint'].includes(entry.guard.kind) && lower !== null && lower <= 0;
      if (lower !== null && !sizeFloor && (min === null || min < lower) && !(isInt32Kind && lower <= -2147483648)) {
        violations.push(`${where}: engine lower ${lower}, schema min ${min ?? 'none'}`);
      }
      if (upper !== null && (max === null || max > upper) && !(isInt32Kind && upper >= 2147483647)) {
        violations.push(`${where}: engine upper ${upper}, schema max ${max ?? 'none'}`);
      }
    }
  }
  return violations;
}

describe('DATABASE_PARAM_SCHEMA vs the engine catalog', () => {
  it('never accepts a key, type or range the engine would refuse to load', () => {
    expect(findViolations()).toEqual([]);
  });
});

describe('deprecated keys', () => {
  it('a schema entry is flagged deprecated exactly when the engine marks it PRM_DEPRECATED, on every version it resolves for', () => {
    const mismatches = [];
    for (const version of ENGINE_PARAM_CATALOG.versions) {
      const byKey = new Map(version.db.map(c => [c.key.toLowerCase(), c]));
      for (const entry of DATABASE_PARAM_SCHEMA.filter(e => appliesTo(e, version.engineVersion))) {
        const c = byKey.get(entry.key.toLowerCase());
        if (c && Boolean(entry.deprecated) !== c.deprecated) mismatches.push(`${entry.key} @ ${version.label}: schema ${Boolean(entry.deprecated)}, engine ${c.deprecated}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('every replacement key exists wherever the deprecated key is deprecated', () => {
    const missing = [];
    for (const version of ENGINE_PARAM_CATALOG.versions) {
      const keys = new Set(version.db.map(c => c.key.toLowerCase()));
      for (const c of version.db.filter(p => p.deprecated)) {
        const replacedBy = DEPRECATED_PARAM_REPLACEMENTS[c.key.toLowerCase()];
        if (replacedBy && !keys.has(replacedBy)) missing.push(`${c.key} -> ${replacedBy} @ ${version.label}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('schema replacedBy agrees with the shared replacement map', () => {
    for (const entry of DATABASE_PARAM_SCHEMA.filter(e => e.deprecated?.replacedBy)) {
      expect(DEPRECATED_PARAM_REPLACEMENTS[entry.key]).toBe(entry.deprecated.replacedBy);
    }
  });
});

describe('DIFFER_UNIT keys with hand-derived bounds', () => {
  // The engine converts these to seconds / log pages before range-checking
  // (prm_check_range), so the generic check above skips them.
  const entry = key => DATABASE_PARAM_SCHEMA.find(e => e.key === key);
  it('checkpoint_interval: ceil(ms / 1000) must be >= 60 seconds', () => {
    expect(entry('checkpoint_interval').guard).toMatchObject({ kind: 'time', min: 59001 });
  });
  it('lock_timeout: -1 (forever) is the lowest accepted value', () => {
    expect(entry('lock_timeout').guard).toMatchObject({ kind: 'time', min: -1 });
  });
  it('checkpoint_every_size: >= 10 log pages at the 16K pages cubrid.conf is first read with', () => {
    expect(entry('checkpoint_every_size').guard).toMatchObject({ kind: 'size', min: 9 * 16384 + 1 });
  });
});

describe('BROKER_PARAM_SCHEMA vs the engine catalog', () => {
  it('every key exists in broker_keywords[] of each version it is resolved for (normal broker build)', () => {
    const missing = [];
    for (const version of ENGINE_PARAM_CATALOG.versions) {
      const keys = new Set(version.broker.filter(k => !k.buildCondition).map(k => k.key.toUpperCase()));
      for (const entry of BROKER_PARAM_SCHEMA.filter(e => appliesTo(e, version.engineVersion))) {
        if (!keys.has(entry.key.toUpperCase())) missing.push(`${entry.key} @ ${version.label}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('broker defaults the catalog cannot check', () => {
  // broker_keywords[] carries names only, so defaults read from broker_config.c are pinned here.
  it('ACCESS_LOG defaults to OFF (INI_GETSTR_CHK ... "ACCESS_LOG", "OFF")', () => {
    expect(BROKER_PARAM_SCHEMA.find(e => e.key === 'ACCESS_LOG').default).toBe('OFF');
  });
});

describe('BROKER_KEY_GUARDS vs the engine catalog', () => {
  it('names only real broker keywords that the schema does not already cover', () => {
    const catalogued = new Set(ENGINE_PARAM_CATALOG.versions.flatMap((v) => v.broker.map((b) => b.key.toUpperCase())));
    const inSchema = new Set(BROKER_PARAM_SCHEMA.map((e) => e.key.toUpperCase()));
    for (const key of Object.keys(BROKER_KEY_GUARDS)) {
      expect(catalogued.has(key), key).toBe(true);
      expect(inSchema.has(key), key).toBe(false);
    }
  });
});
