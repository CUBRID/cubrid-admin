import { describe, expect, it } from 'vitest';
import { validateConfText } from '@api-interfaces';

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

