import { describe, expect, it } from 'vitest';
import { validateConfText, isBlockingConfTextProblem } from '@api-interfaces';
import { resolveParamSchema } from '@api-interfaces/param-schema/resolve-param-schema';
import { BROKER_PARAM_SCHEMA } from '@api-interfaces/param-schema/broker-param-schema';
import { resolveBrokerKeyGuards } from '@api-interfaces/param-schema/broker-key-guards';
import { resolveEngineKnownKeys } from '@api-interfaces/param-schema/engine-catalog/resolve-engine-known-keys';

const DB_SCHEMA = [
  { key: 'max_clients', category: 'general', guard: { kind: 'int', min: 10, max: 4000 }, default: '100' },
  { key: 'ha_node_list', category: 'advanced', guard: { kind: 'string' }, default: '', commonOnly: true },
  { key: 'async_commit', category: 'advanced', guard: { kind: 'boolean' }, default: 'no' },
];
const BROKER_SCHEMA = [
  { key: 'MASTER_SHM_ID', category: 'common', guard: { kind: 'int', min: 1 }, default: '', commonOnly: true, required: true },
  { key: 'BROKER_PORT', category: 'common', guard: { kind: 'int', min: 1, max: 65535, base: 0 }, default: '', instanceOnly: true, required: true },
  { key: 'MIN_NUM_APPL_SERVER', category: 'common', guard: { kind: 'int', min: 1 }, default: '5' },
  { key: 'MAX_STRING_LENGTH', category: 'advance', guard: { kind: 'int' }, default: '-1' },
  { key: 'SERVICE', category: 'common', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'ON' },
];

describe('validateConfText — cubridconf', () => {
  it('passes a well-formed file', () => {
    expect(validateConfText(DB_SCHEMA, '[common]\nmax_clients=100\nasync_commit=no', 'cubridconf')).toEqual([]);
  });

  it('reports a line the engine cannot parse', () => {
    expect(validateConfText(DB_SCHEMA, '[common]\nmax_clients 100', 'cubridconf'))
      .toEqual([expect.objectContaining({ lineNo: 2 })]);
  });

  it('reports a present-but-empty value for a non-string key (engine fails to load)', () => {
    expect(validateConfText(DB_SCHEMA, '[common]\nmax_clients=', 'cubridconf'))
      .toEqual([expect.objectContaining({ lineNo: 2, key: 'max_clients' })]);
    expect(validateConfText(DB_SCHEMA, '[common]\nasync_commit= # c', 'cubridconf'))
      .toEqual([expect.objectContaining({ key: 'async_commit' })]);
  });

  it('allows an empty value for a string key', () => {
    expect(validateConfText(DB_SCHEMA, '[common]\nha_node_list=', 'cubridconf')).toEqual([]);
  });

  it('validates the value the engine actually sees — quotes and inline comments stripped', () => {
    expect(validateConfText(DB_SCHEMA, '[common]\nmax_clients="100" # tuned', 'cubridconf')).toEqual([]);
    expect(validateConfText(DB_SCHEMA, '[common]\nmax_clients="5"', 'cubridconf'))
      .toEqual([expect.objectContaining({ key: 'max_clients' })]);
  });

  it('warns on a repeated key — the engine silently keeps only the last one', () => {
    expect(validateConfText(DB_SCHEMA, '[common]\nmax_clients=100\n[@demodb]\nmax_clients=50\n[common]\nMAX_CLIENTS=200', 'cubridconf'))
      .toEqual([expect.objectContaining({ lineNo: 2, key: 'max_clients', severity: 'warning', message: expect.stringContaining('line 6') })]);
    expect(validateConfText(DB_SCHEMA, '[common]\nmax_clients=100\nmax_clients=9999', 'cubridconf'))
      .toEqual([
        expect.objectContaining({ lineNo: 2, severity: 'warning' }),
        expect.objectContaining({ lineNo: 3, key: 'max_clients', message: expect.stringContaining('<= 4000') }),
      ]);
  });

  it('runs syntax checks even before the schema has loaded', () => {
    expect(validateConfText([], '[common]\nmax_clients 100', 'cubridconf')).toHaveLength(1);
  });
});

describe('validateConfText — brokerconf', () => {
  it('passes a well-formed file', () => {
    expect(validateConfText(BROKER_SCHEMA, '[broker]\nMASTER_SHM_ID=30001\n[%b1]\nBROKER_PORT=30000', 'brokerconf')).toEqual([]);
  });

  it('reports brokers sharing a port or shared memory id, compared as the broker parses them', () => {
    const base = '[broker]\nMASTER_SHM_ID=30001\n[%b1]\nBROKER_PORT=30000\nAPPL_SERVER_SHM_ID=30000\n';
    expect(validateConfText(BROKER_SCHEMA, `${base}[%b2]\nBROKER_PORT=0x7530\nAPPL_SERVER_SHM_ID=30002`, 'brokerconf'))
      .toEqual([expect.objectContaining({ lineNo: 7, key: 'BROKER_PORT', message: expect.stringContaining('[%b1]') })]);
    expect(validateConfText(BROKER_SCHEMA, `${base}[%b2]\nBROKER_PORT=30001\nAPPL_SERVER_SHM_ID=0x30000`, 'brokerconf'))
      .toEqual([expect.objectContaining({ lineNo: 8, key: 'APPL_SERVER_SHM_ID' })]);
    expect(validateConfText(BROKER_SCHEMA, `${base}[%b2]\nBROKER_PORT=30001\nAPPL_SERVER_SHM_ID=30001`, 'brokerconf'))
      .toEqual([expect.objectContaining({ lineNo: 8, message: expect.stringContaining('MASTER_SHM_ID') })]);
  });

  it('reports a missing [broker] section', () => {
    expect(validateConfText(BROKER_SCHEMA, '[%b1]\nBROKER_PORT=30000', 'brokerconf'))
      .toEqual([expect.objectContaining({ message: expect.stringContaining('[broker]') })]);
  });

  it('reports an empty [%name] section missing its required BROKER_PORT', () => {
    expect(validateConfText(BROKER_SCHEMA, '[broker]\nMASTER_SHM_ID=30001\n[%b1]', 'brokerconf'))
      .toEqual([expect.objectContaining({ key: 'BROKER_PORT' })]);
  });

  it('checks a section split across the file as one section', () => {
    const text = '[%b1]\nMIN_NUM_APPL_SERVER=5\n[broker]\nMASTER_SHM_ID=30001\n[%b1]\nBROKER_PORT=30000';
    expect(validateConfText(BROKER_SCHEMA, text, 'brokerconf')).toEqual([]);
  });
});

describe('validateConfText — keys the engine does not know', () => {
  const strict = { strict: true, catalogVersion: '11.4.5', database: ['max_clients', 'ha_node_list', 'async_commit', 'service::server', 'service::service'], broker: ['master_shm_id', 'broker_port', 'min_num_appl_server'] };
  const loose = { ...strict, strict: false, catalogVersion: null };

  it('blocks an unknown key when the host version is catalogued exactly', () => {
    expect(validateConfText(DB_SCHEMA, '[common]\nmax_client=100', 'cubridconf', strict))
      .toEqual([expect.objectContaining({ lineNo: 2, key: 'max_client' })]);
    expect(validateConfText(DB_SCHEMA, '[common]\nmax_client=100', 'cubridconf', strict)[0].severity).toBeUndefined();
  });

  it('only warns when the host version is not catalogued exactly', () => {
    expect(validateConfText(DB_SCHEMA, '[common]\nmax_client=100', 'cubridconf', loose))
      .toEqual([expect.objectContaining({ key: 'max_client', severity: 'warning' })]);
  });

  it('matches keys case-insensitively, like the engine', () => {
    expect(validateConfText(DB_SCHEMA, '[common]\nMAX_CLIENTS=100', 'cubridconf', strict)).toEqual([]);
    expect(validateConfText(BROKER_SCHEMA, '[broker]\nmaster_shm_id=30001\n[%b1]\nBroker_Port=30000', 'brokerconf', strict)).toEqual([]);
  });

  it('looks [service] keys up as service::<key>, so only service/server belong there', () => {
    expect(validateConfText(DB_SCHEMA, '[service]\nserver=demodb\nservice=server,broker', 'cubridconf', strict)).toEqual([]);
    expect(validateConfText(DB_SCHEMA, '[service]\nmax_clients=100', 'cubridconf', strict))
      .toEqual([expect.objectContaining({ key: 'max_clients' })]);
    expect(validateConfText(DB_SCHEMA, '[common]\nserver=demodb', 'cubridconf', strict))
      .toEqual([expect.objectContaining({ key: 'server' })]);
  });

  it('skips the known-key check entirely when no key list is available', () => {
    expect(validateConfText(DB_SCHEMA, '[common]\nmax_client=100', 'cubridconf')).toEqual([]);
  });
});

describe('validateConfText — engine DEFAULT/MIN/MAX words', () => {
  it('accepts DEFAULT for any cubrid.conf key, in any case', () => {
    expect(validateConfText(DB_SCHEMA, '[common]\nmax_clients=DEFAULT\nasync_commit=default\nha_node_list=Default', 'cubridconf')).toEqual([]);
  });

  it('accepts MIN/MAX for numeric keys', () => {
    expect(validateConfText(DB_SCHEMA, '[common]\nmax_clients=max', 'cubridconf')).toEqual([]);
  });

  it('rejects MIN/MAX for non-numeric keys (the engine fails the load)', () => {
    expect(validateConfText(DB_SCHEMA, '[common]\nasync_commit=MAX', 'cubridconf')).toEqual([expect.objectContaining({ key: 'async_commit' })]);
    expect(validateConfText(DB_SCHEMA, '[common]\nha_node_list=min', 'cubridconf')).toEqual([expect.objectContaining({ key: 'ha_node_list' })]);
  });

  it('does not apply to broker.conf', () => {
    expect(validateConfText(BROKER_SCHEMA, '[broker]\nMASTER_SHM_ID=30001\n[%b1]\nBROKER_PORT=30000\nMIN_NUM_APPL_SERVER=default', 'brokerconf'))
      .toEqual([expect.objectContaining({ key: 'MIN_NUM_APPL_SERVER' })]);
  });
});

describe('validateConfText — empty values in broker.conf', () => {
  const head = '[broker]\nMASTER_SHM_ID=30001\n[%b1]\nBROKER_PORT=30000\n';
  it('reads an empty int as 0, then applies its range (ini_getint)', () => {
    expect(validateConfText(BROKER_SCHEMA, head + 'MIN_NUM_APPL_SERVER=', 'brokerconf')).toEqual([expect.objectContaining({ key: 'MIN_NUM_APPL_SERVER' })]);
    expect(validateConfText(BROKER_SCHEMA, head + 'MAX_STRING_LENGTH=', 'brokerconf')).toEqual([]);
  });
  it('rejects an empty value for keyword keys (the broker fails the load)', () => {
    expect(validateConfText(BROKER_SCHEMA, head + 'SERVICE=', 'brokerconf')).toEqual([expect.objectContaining({ key: 'SERVICE' })]);
  });
});

describe('validateConfText — cubrid.conf HA host and standalone sections', () => {
  it('does not apply common/instance placement rules to [%host|*] or [standalone]', () => {
    expect(validateConfText(DB_SCHEMA, '[%node1|*]\nha_node_list=a@b:c', 'cubridconf')).toEqual([]);
    expect(validateConfText(DB_SCHEMA, '[standalone]\nha_node_list=a@b:c', 'cubridconf')).toEqual([]);
    expect(validateConfText(DB_SCHEMA, '[@demodb]\nha_node_list=a@b:c', 'cubridconf')).toEqual([expect.objectContaining({ key: 'ha_node_list' })]);
  });
});


describe('validateConfText — broker keys outside the schema (BROKER_KEY_GUARDS)', () => {
  const file = (lines) => `[broker]\nMASTER_SHM_ID=30001\n[%b1]\nBROKER_PORT=30000\n${lines}`;
  const problemKeys = (lines) => validateConfText(BROKER_SCHEMA, file(lines), 'brokerconf').map((p) => p.key);

  it('accepts what broker_config.c accepts', () => {
    expect(problemKeys('NET_BUF_SIZE=32K\nSHARD=off\nAPPL_SERVER=cas_oracle\nJOB_QUEUE_SIZE=4096\nSHARD_PROXY_TIMEOUT=1h\nACCESS_LOG_MAX_SIZE=1G')).toEqual([]);
  });

  it('rejects values the broker refuses to load', () => {
    expect(problemKeys('NET_BUF_SIZE=20K')).toEqual(['NET_BUF_SIZE']); // 16/32/48/64 KB only
    expect(problemKeys('SHARD=yes')).toEqual(['SHARD']); // ON/OFF only
    expect(problemKeys('ACCESS_LOG_MAX_SIZE=3G')).toEqual(['ACCESS_LOG_MAX_SIZE']);
    expect(problemKeys('SHARD_PROXY_TIMEOUT=90000')).toEqual(['SHARD_PROXY_TIMEOUT']); // > 86400 s
    expect(problemKeys('SHARD_KEY_FILE=')).toEqual(['SHARD_KEY_FILE']);
    expect(problemKeys('MAX_PREPARED_STMT_COUNT=0')).toEqual(['MAX_PREPARED_STMT_COUNT']);
    expect(problemKeys('SHARD_PROXY_LOG=debug')).toEqual(['SHARD_PROXY_LOG']); // DEBUG is not in tbl_proxy_log_mode
  });

  it('rejects values the broker would silently replace', () => {
    expect(problemKeys('JOB_QUEUE_SIZE=5000')).toEqual(['JOB_QUEUE_SIZE']); // lowered to 4096
    expect(problemKeys('SQL_LOG2=4')).toEqual(['SQL_LOG2']); // lowered to 3
  });

  it('leaves the [broker] section alone, where these keys are never read', () => {
    expect(validateConfText(BROKER_SCHEMA, '[broker]\nMASTER_SHM_ID=30001\nNET_BUF_SIZE=20K\n[%b1]\nBROKER_PORT=30000', 'brokerconf')).toEqual([]);
  });
});

describe('validateConfText — broker rules that differ by engine version', () => {
  // Exact catalogued versions, so knownKeys is strict and a guard failure blocks the save.
  const blocking = (version, lines) => {
    const text = ['[broker]', 'MASTER_SHM_ID=30001', '[%b1]', 'BROKER_PORT=30000', 'APPL_SERVER_SHM_ID=30000', ...lines].join('\n');
    return validateConfText(resolveParamSchema(BROKER_PARAM_SCHEMA, version), text, 'brokerconf', resolveEngineKnownKeys(version))
      .filter(isBlockingConfTextProblem)
      .map(p => p.key);
  };

  it('JOB_QUEUE_SIZE: JOB_QUEUE_MAX_SIZE is 2048 through 11.2, 4096 from 11.3', () => {
    expect(blocking('11.2.10', ['JOB_QUEUE_SIZE=3000'])).toEqual(['JOB_QUEUE_SIZE']);
    expect(blocking('11.2.10', ['JOB_QUEUE_SIZE=2048'])).toEqual([]);
    expect(blocking('11.4.5', ['JOB_QUEUE_SIZE=3000'])).toEqual([]);
  });

  it('APPL_SERVER: CAS_CGW from 11.2; develop (11.5) keeps only CAS and CAS_CGW', () => {
    expect(blocking('11.0.17', ['APPL_SERVER=CAS_CGW'])).toEqual(['APPL_SERVER']);
    expect(blocking('11.4.5', ['APPL_SERVER=CAS_CGW'])).toEqual([]);
    expect(blocking('11.5.0', ['APPL_SERVER=CAS_ORACLE'])).toEqual(['APPL_SERVER']);
    expect(blocking('11.4.5', ['APPL_SERVER=CAS_ORACLE'])).toEqual([]);
    expect(blocking('11.5.0', ['APPL_SERVER=cas_cgw'])).toEqual([]);
  });

  it('MAX_NUM_APPL_SERVER < MIN_NUM_APPL_SERVER fails the load only from 11.3 (before, max is raised to min)', () => {
    const lines = ['MIN_NUM_APPL_SERVER=10', 'MAX_NUM_APPL_SERVER=5'];
    expect(blocking('11.4.5', lines)).toEqual(['MAX_NUM_APPL_SERVER']);
    expect(blocking('11.3.6', lines)).toEqual(['MAX_NUM_APPL_SERVER']);
    expect(blocking('11.2.10', lines)).toEqual([]);
  });

  it('MIN_NUM_APPL_SERVER: > 4096 is PARAM_BAD_VALUE through 11.2; from 11.3 only MAX caps it', () => {
    expect(blocking('11.2.10', ['MIN_NUM_APPL_SERVER=5000', 'MAX_NUM_APPL_SERVER=4096'])).toEqual(['MIN_NUM_APPL_SERVER']);
    expect(blocking('11.4.5', ['MIN_NUM_APPL_SERVER=5000', 'MAX_NUM_APPL_SERVER=4096'])).toEqual(['MAX_NUM_APPL_SERVER']);
    expect(blocking('11.2.10', ['MIN_NUM_APPL_SERVER=0'])).toEqual(['MIN_NUM_APPL_SERVER']); // ini_getuint would silently use 5
  });

  it('resolves an uncatalogued patch with its own line\'s rules', () => {
    expect(resolveEngineKnownKeys('11.4.3').brokerGuards.JOB_QUEUE_SIZE).toMatchObject({ max: 4096 });
    expect(resolveEngineKnownKeys('11.2.3').brokerGuards.JOB_QUEUE_SIZE).toMatchObject({ max: 2048 });
    expect(resolveEngineKnownKeys('11.1.5').brokerGuards.APPL_SERVER.options).not.toContain('CAS_CGW');
    expect(resolveBrokerKeyGuards('CUBRID 11.5.0 (11.5.0.0001-abc)').APPL_SERVER.options).toEqual(['CAS', 'CAS_CGW']);
  });
});
