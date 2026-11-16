import { describe, expect, it } from 'vitest';
import { Text } from '@codemirror/state';
import { getCM } from '../../../constants/useCM';
import { confContextAt, confKeyAt } from './confContext';
import { confParams, describeGuard, paramHintDom, paramHintLines } from './confParams';
import { confDiagnostics } from './confLint';

const KO = getCM('ko');
const EN = getCM('en');
const doc = (text) => Text.of(text.split('\n'));

// The shape getEnv sends (paramSchemas), cut down to a few keys.
const schemas = {
  database: [
    { key: 'cubrid_port_id', category: 'common', guard: { kind: 'int', min: 1, max: 65535 }, default: '1523', scope: 'BOTH' },
    { key: 'data_buffer_size', category: 'buffer', guard: { kind: 'size', min: 16777216 }, default: '512M' },
  ],
  broker: [
    { key: 'MASTER_SHM_ID', category: 'common', guard: { kind: 'int', min: 1, base: 16 }, default: '', commonOnly: true },
    { key: 'SQL_LOG', category: 'general', guard: { kind: 'enum', options: ['ON', 'OFF', 'ERROR', 'NOTICE', 'TIMEOUT'] }, default: 'ON' },
  ],
  cm: [{ key: 'cm_port', category: 'general', guard: { kind: 'int', min: 1024, max: 65535 }, default: '8001' }],
  knownKeys: {
    strict: true,
    catalogVersion: '11.4.5',
    database: ['cubrid_port_id', 'data_buffer_size', 'log_buffer_size', 'service::server', 'service::service'],
    broker: ['master_shm_id', 'sql_log', 'broker_port'],
    databaseGuards: { log_buffer_size: { kind: 'size' } },
    databaseScopes: { cubrid_port_id: 'BOTH', log_buffer_size: 'SERVER' },
    databaseDeprecated: [],
    brokerGuards: { BROKER_PORT: { kind: 'int', min: 1024, max: 65535 } },
  },
};

describe('confContextAt', () => {
  const text = '# conf\n[common]\ncubrid_po\n[service]\nserver=de';
  it('knows the section and whether the cursor is on a key, a value or a heading', () => {
    expect(confContextAt(doc(text), text.indexOf('cubrid_po') + 9)).toMatchObject({ section: 'common', place: 'key', text: 'cubrid_po' });
    expect(confContextAt(doc(text), text.length)).toMatchObject({ section: 'service', place: 'value', key: 'server', text: 'de' });
    expect(confContextAt(doc('[comm'), 5)).toMatchObject({ section: null, place: 'heading', text: 'comm' });
    expect(confContextAt(doc(text), 3)).toMatchObject({ place: 'comment' });
  });

  it('finds the key under the pointer', () => {
    const t = '  SQL_LOG = ON';
    expect(confKeyAt(doc(t), 4)).toEqual({ key: 'SQL_LOG', from: 2, to: 9 });
    expect(confKeyAt(doc(t), 13)).toBeNull();
    expect(confKeyAt(doc('# SQL_LOG=ON'), 3)).toBeNull();
  });
});

describe('confParams', () => {
  it('keeps each file to its own keys, in that file\'s case', () => {
    const names = (kind, section) => confParams(kind, schemas).forSection(section).map((p) => p.name);
    expect(names('cubridconf', 'common')).toEqual(['cubrid_port_id', 'data_buffer_size', 'log_buffer_size']);
    expect(names('cubridconf', 'service')).toEqual(['server', 'service']);
    expect(names('brokerconf', 'broker')).toEqual(['MASTER_SHM_ID', 'SQL_LOG', 'BROKER_PORT']);
    expect(names('brokerconf', '%query_editor')).toEqual(['SQL_LOG', 'BROKER_PORT']);
    expect(names('cmconf', null)).toEqual(['cm_port']);
  });

  it('looks names up without regard to case, as the engine and CMS do', () => {
    expect(confParams('brokerconf', schemas).get('sql_log').guard.kind).toBe('enum');
    expect(confParams('cubridconf', schemas).get('CUBRID_PORT_ID').default).toBe('1523');
    expect(confParams('cubridconf', schemas).get('server', 'service')).toMatchObject({ name: 'server', place: 'service' });
    expect(confParams('cubridconf', schemas).get('cm_port')).toBeUndefined();
  });

  it('describes a parameter for its hint', () => {
    const port = confParams('cubridconf', schemas).get('cubrid_port_id');
    expect(paramHintLines(KO, port)).toEqual(['정수, 1 ~ 65535', '기본값: 1523', '적용 대상: BOTH']);
    expect(paramHintLines(EN, confParams('brokerconf', schemas).get('MASTER_SHM_ID'))).toEqual(['Hexadecimal integer, at least 1', 'Only in the [broker] section']);
    expect(describeGuard(KO, { kind: 'size', min: 16777216 })).toBe('크기(K·M·G·T, 단위가 없으면 바이트), 16M 이상');
    expect(describeGuard(KO, { kind: 'brokerTime', minSec: 0 })).toBe('시간(ms·s·min·h, 단위가 없으면 초), 0s 이상');
  });

  it('builds the hint as a DOM node, which CodeMirror needs for the hover and the completion panel', () => {
    const port = confParams('cubridconf', schemas).get('cubrid_port_id');
    const hover = paramHintDom(KO, port, true);
    expect(hover).toBeInstanceOf(HTMLElement);
    expect(hover.querySelector('b').textContent).toBe('cubrid_port_id');
    expect([...hover.querySelectorAll('div')].map((d) => d.textContent)).toEqual(['정수, 1 ~ 65535', '기본값: 1523', '적용 대상: BOTH']);
    expect(paramHintDom(KO, port, false).querySelector('b')).toBeNull();
    expect(paramHintDom(KO, { name: 'x' }, false)).toBeNull();
  });
});

describe('confDiagnostics', () => {
  it('underlines what the server would refuse, on its key, in the UI language', () => {
    // A key twice: the engine uses the last one, so only that one's value is checked.
    const text = '[common]\ncubrid_port_id=1523\nno_such_param=1\ncubrid_port_id=99999';
    const marks = confDiagnostics(KO, doc(text), 'cubridconf', schemas);
    const where = (m) => [doc(text).lineAt(m.from).number, text.slice(m.from, m.to), m.severity];
    expect(marks.map(where)).toEqual(expect.arrayContaining([
      [2, 'cubrid_port_id', 'warning'],
      [3, 'no_such_param', 'error'],
      [4, 'cubrid_port_id', 'error'],
    ]));
    // On the line already, so without the "N번째 줄: " prefix of the save dialog.
    expect(marks.every((m) => !/^\d+번째 줄: /.test(m.message))).toBe(true);
  });

  it('marks nothing before the host schema is read', () => {
    expect(confDiagnostics(KO, doc('[common]\nno_such=1'), 'cubridconf', undefined)).toEqual([]);
  });
});
