import { describe, expect, it } from 'vitest';
import { validateConfText, isBlockingConfTextProblem, validateCrossFieldParams } from '@api-interfaces';
import { resolveParamSchema } from '@api-interfaces/param-schema/resolve-param-schema';
import { DATABASE_PARAM_SCHEMA } from '@api-interfaces/param-schema/database-param-schema';
import { BROKER_PARAM_SCHEMA } from '@api-interfaces/param-schema/broker-param-schema';
import { resolveEngineKnownKeys } from '@api-interfaces/param-schema/engine-catalog/resolve-engine-known-keys';

// Runs the real (resolved) schemas + engine catalog the server sends to an
// 11.4.5 host — the exact combination the editors and the save endpoint use.
const VERSION = 'CUBRID 11.4.5 (11.4.5.1907-7077e91) (64bit release build for Linux)';
const db = resolveParamSchema(DATABASE_PARAM_SCHEMA, VERSION);
const broker = resolveParamSchema(BROKER_PARAM_SCHEMA, VERSION);
const knownKeys = resolveEngineKnownKeys(VERSION);
const checkDb = text => validateConfText(db, text, 'cubridconf', knownKeys);
const blockingDb = text => checkDb(text).filter(isBlockingConfTextProblem);
const brokerConf = extra => ['[broker]', 'MASTER_SHM_ID=30001', '[%query_editor]', 'BROKER_PORT=30000', 'APPL_SERVER_SHM_ID=30000', ...extra].join('\n');
const blockingBroker = extra => validateConfText(broker, brokerConf(extra), 'brokerconf', knownKeys).filter(isBlockingConfTextProblem);

describe('P0 keys added to the cubrid.conf schema', () => {
  it('checkpoint_interval: ms rounded up to seconds must reach 60', () => {
    expect(blockingDb('[common]\ncheckpoint_interval=1min')).toEqual([]);
    expect(blockingDb('[common]\ncheckpoint_interval=59001')).toEqual([]);
    expect(blockingDb('[common]\ncheckpoint_interval=59000')).toEqual([expect.objectContaining({ key: 'checkpoint_interval' })]);
    expect(blockingDb('[common]\ncheckpoint_interval=-1')).toEqual([expect.objectContaining({ key: 'checkpoint_interval' })]);
  });
  it('lock_timeout: -1 is "forever", -2 is rejected', () => {
    expect(blockingDb('[common]\nlock_timeout=-1')).toEqual([]);
    expect(blockingDb('[common]\nlock_timeout=10s')).toEqual([]);
    expect(blockingDb('[common]\nlock_timeout=-2')).toEqual([expect.objectContaining({ key: 'lock_timeout' })]);
  });
  it('checkpoint_every_size: at least 10 log pages', () => {
    expect(blockingDb('[common]\ncheckpoint_every_size=100M')).toEqual([]);
    expect(blockingDb('[common]\ncheckpoint_every_size=36864')).toEqual([expect.objectContaining({ key: 'checkpoint_every_size' })]);
  });
  it('vacuum_worker_count: 1..50', () => {
    expect(blockingDb('[common]\nvacuum_worker_count=50')).toEqual([]);
    expect(blockingDb('[common]\nvacuum_worker_count=51')).toEqual([expect.objectContaining({ key: 'vacuum_worker_count' })]);
    expect(blockingDb('[common]\nvacuum_worker_count=0')).toEqual([expect.objectContaining({ key: 'vacuum_worker_count' })]);
  });
  it('HA keys belong in [common] only', () => {
    expect(blockingDb('[common]\nha_db_list=demodb\nha_copy_log_max_archives=1')).toEqual([]);
    expect(blockingDb('[@demodb]\nha_db_list=demodb')).toEqual([expect.objectContaining({ key: 'ha_db_list' })]);
  });
});

describe('deprecated keys', () => {
  it('are accepted but reported as a non-blocking warning naming the replacement', () => {
    const problems = checkDb('[common]\ndata_buffer_pages=32768\nlock_timeout_in_secs=10');
    expect(problems.filter(isBlockingConfTextProblem)).toEqual([]);
    expect(problems).toEqual([
      expect.objectContaining({ key: 'data_buffer_pages', severity: 'warning', message: expect.stringContaining('use data_buffer_size') }),
      expect.objectContaining({ key: 'lock_timeout_in_secs', severity: 'warning', message: expect.stringContaining('use lock_timeout') }),
    ]);
  });
});

describe('broker SSL', () => {
  it('accepts ON/OFF only', () => {
    expect(blockingBroker(['SSL=ON'])).toEqual([]);
    expect(blockingBroker(['SSL=YES'])).toEqual([expect.objectContaining({ key: 'SSL' })]);
  });
});

describe('MIN/MAX_NUM_APPL_SERVER cross-field check reads ints like broker ini_getint (strtol base 0)', () => {
  it('"010" is octal 8, so MAX=9 is >= MIN', () => {
    expect(blockingBroker(['MIN_NUM_APPL_SERVER=010', 'MAX_NUM_APPL_SERVER=9'])).toEqual([]);
  });
  it('"0x10" is 16, so MAX=10 is < MIN', () => {
    expect(blockingBroker(['MIN_NUM_APPL_SERVER=0x10', 'MAX_NUM_APPL_SERVER=10']))
      .toEqual([expect.objectContaining({ key: 'MAX_NUM_APPL_SERVER' })]);
  });
  it('plain decimals still compare as before', () => {
    expect(validateCrossFieldParams(broker, { MIN_NUM_APPL_SERVER: '20', MAX_NUM_APPL_SERVER: '10' }))
      .toEqual({ MAX_NUM_APPL_SERVER: expect.stringContaining('MIN_NUM_APPL_SERVER') });
  });
});
