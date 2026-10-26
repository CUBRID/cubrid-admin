import { describe, expect, it } from 'vitest';
import { resolveEngineKnownKeys } from '@api-interfaces/param-schema/engine-catalog/resolve-engine-known-keys';
import { resolveParamSchema } from '@api-interfaces/param-schema/resolve-param-schema';
import { DATABASE_PARAM_SCHEMA } from '@api-interfaces/param-schema/database-param-schema';
import { validateConfText } from '@api-interfaces';

const BANNER_11_4_5 = 'CUBRID 11.4.5 (11.4.5.1907-7077e91) (64bit debug build for Linux)';

describe('resolveEngineKnownKeys', () => {
  it('is strict for a host whose major.minor.patch is catalogued, using that exact version\'s keys', () => {
    const k = resolveEngineKnownKeys(BANNER_11_4_5);
    expect(k.strict).toBe(true);
    expect(k.catalogVersion).toBe('11.4.5');
    expect(k.database).toContain('page_latch_timeout'); // renamed after 11.4.5
    expect(k.database).not.toContain('page_latch_timeout_in_msecs');
    expect(k.database).toContain('service::server');
    expect(k.broker).toContain('master_shm_id');
  });

  it('is not strict for an uncatalogued patch, and uses the same release line\'s keys', () => {
    const k = resolveEngineKnownKeys('11.4.3');
    expect(k.strict).toBe(false);
    expect(k.catalogVersion).toBeNull();
    expect(k.database).toEqual(expect.arrayContaining(['page_latch_timeout', 'page_latch_timeout_in_msecs']));
  });

  it('never lists keys real builds compile out or gateway-only broker keys', () => {
    for (const v of ['11.0.17', '11.4.5', '11.5.0']) {
      const k = resolveEngineKnownKeys(v);
      expect(k.database).not.toContain('single_byte_compare');
      expect(k.broker.some(key => key.startsWith('cgw_'))).toBe(false);
    }
  });
});

describe('stored_procedure_port placement (engine PRM_ERR_CANNOT_CHANGE on develop)', () => {
  const text = '[common]\nstored_procedure_port=4000';
  it('is refused in [common] on 11.5', () => {
    const schema = resolveParamSchema(DATABASE_PARAM_SCHEMA, '11.5.0');
    expect(validateConfText(schema, text, 'cubridconf')).toEqual([expect.objectContaining({ key: 'stored_procedure_port' })]);
    expect(validateConfText(schema, '[@demodb]\nstored_procedure_port=4000', 'cubridconf')).toEqual([]);
  });
  it('is allowed in [common] on 11.4.5', () => {
    expect(validateConfText(resolveParamSchema(DATABASE_PARAM_SCHEMA, BANNER_11_4_5), text, 'cubridconf')).toEqual([]);
  });
});

describe('keys outside the schema still get the engine\'s own type rules (from the catalog)', () => {
  const known = resolveEngineKnownKeys(BANNER_11_4_5);
  const schema = resolveParamSchema(DATABASE_PARAM_SCHEMA, BANNER_11_4_5);
  const check = line => validateConfText(schema, `[common]\n${line}`, 'cubridconf', known);

  it('blocks an empty or unparsable value the engine would fail to load', () => {
    expect(check('vacuum_worker_count=')).toEqual([expect.objectContaining({ key: 'vacuum_worker_count' })]);
    expect(check('vacuum_worker_count=abc')).toEqual([expect.objectContaining({ key: 'vacuum_worker_count' })]);
    expect(check('lock_timeout=10days')).toEqual([expect.objectContaining({ key: 'lock_timeout' })]);
  });

  it('accepts engine-valid values, including time units and DEFAULT', () => {
    expect(check('vacuum_worker_count=4')).toEqual([]);
    expect(check('lock_timeout=10s')).toEqual([]);
    expect(check('lock_timeout=-1')).toEqual([]);
    expect(check('lock_timeout=default')).toEqual([]);
  });

  it('only warns for an uncatalogued host version', () => {
    const loose = resolveEngineKnownKeys('11.4.3');
    expect(validateConfText(resolveParamSchema(DATABASE_PARAM_SCHEMA, '11.4.3'), '[common]\ndata_file_os_advise=abc', 'cubridconf', loose))
      .toEqual([expect.objectContaining({ key: 'data_file_os_advise', severity: 'warning' })]);
  });
});

