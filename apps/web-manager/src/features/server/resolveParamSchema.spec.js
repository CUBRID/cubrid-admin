import { describe, expect, it } from 'vitest';
import { resolveParamSchema, compareEngineVersions } from '@api-interfaces/param-schema/resolve-param-schema';
import { DATABASE_PARAM_SCHEMA } from '@api-interfaces/param-schema/database-param-schema';
import { BROKER_PARAM_SCHEMA } from '@api-interfaces/param-schema/broker-param-schema';

const keys = (schema, version) => resolveParamSchema(schema, version).map(e => e.key);

describe('resolveParamSchema — what a host of a given engine version receives', () => {
  it('reads the version out of a full CUBRIDVER banner', () => {
    expect(compareEngineVersions('CUBRID 11.4.5 (11.4.5.1907-7077e91) (64bit release build)', '11.4')).toBeGreaterThan(0);
    expect(compareEngineVersions('11.3.6', '11.4')).toBeLessThan(0);
  });
  it('drops keys outside their version range and strips the range fields', () => {
    const resolved = resolveParamSchema(BROKER_PARAM_SCHEMA, '11.3.6');
    expect(resolved.map(e => e.key)).not.toContain('ACCESS_CONTROL_DEFAULT_POLICY');
    expect(keys(BROKER_PARAM_SCHEMA, '11.4.5')).toContain('ACCESS_CONTROL_DEFAULT_POLICY');
    expect(resolved.some(e => 'minVersion' in e || 'maxVersion' in e)).toBe(false);
  });
  it('returns at most one variant of a version-split key', () => {
    for (const version of ['11.0.17', '11.3.6', '11.4.5', '11.5.0']) {
      const all = keys(DATABASE_PARAM_SCHEMA, version);
      expect(all.length).toBe(new Set(all).size);
    }
  });
  it('stored_procedure_port exists from 11.4 and is instance-only from 11.5', () => {
    expect(keys(DATABASE_PARAM_SCHEMA, '11.3.6')).not.toContain('stored_procedure_port');
    const at = v => resolveParamSchema(DATABASE_PARAM_SCHEMA, v).find(e => e.key === 'stored_procedure_port');
    expect(at('11.4.5').instanceOnly).toBeUndefined();
    expect(at('11.5.0').instanceOnly).toBe(true);
  });
  it('compat_numeric_division_scale (deprecated+hidden on develop) is not sent to an 11.5 host', () => {
    expect(keys(DATABASE_PARAM_SCHEMA, '11.4.5')).toContain('compat_numeric_division_scale');
    expect(keys(DATABASE_PARAM_SCHEMA, '11.5.0')).not.toContain('compat_numeric_division_scale');
  });
});
