import { describe, expect, it } from 'vitest';
import { parseConfText } from '@api-interfaces';

const entriesOf = (text, name) => parseConfText(text).sections.find(s => s.name === name)?.entries ?? [];
const valueOf = (line) => entriesOf(`[common]\n${line}`, 'common')[0]?.value;
const errorsOf = (text) => parseConfText(text).syntaxErrors;

describe('parseConfText — whitespace/tab formatting', () => {
  it('trims leading whitespace/tabs before a key', () => {
    expect(entriesOf('[common]\n  max_clients=100\n\tcsql_history_num=50', 'common')).toEqual([
      { key: 'max_clients', value: '100', lineNo: 2 },
      { key: 'csql_history_num', value: '50', lineNo: 3 },
    ]);
  });

  it('trims tabs and spaces on either side of "="', () => {
    expect(entriesOf('[common]\nmax_clients \t = \t 100\ncsql_history_num\t=\t50\t', 'common')).toEqual([
      { key: 'max_clients', value: '100', lineNo: 2 },
      { key: 'csql_history_num', value: '50', lineNo: 3 },
    ]);
  });

  it('skips blank lines and # comments, with leading whitespace allowed', () => {
    const { sections, syntaxErrors } = parseConfText('  [common]  \n   # comment\n\nmax_clients=100');
    expect(syntaxErrors).toEqual([]);
    expect(sections).toEqual([{ name: 'common', lineNo: 1, entries: [{ key: 'max_clients', value: '100', lineNo: 4 }] }]);
  });

  it('keeps everything after the first "=" (a value containing "=" is not truncated)', () => {
    expect(valueOf('access_ip_control_file=a=b')).toBe('a=b');
  });
});

describe('parseConfText — engine (ini_parse_line) value rules', () => {
  it('strips surrounding double or single quotes', () => {
    expect(valueOf('max_clients="100"')).toBe('100');
    expect(valueOf("max_clients = '100'")).toBe('100');
  });

  it('quotes win over a comment character inside them', () => {
    expect(valueOf('ha_node_list="a#b"')).toBe('a#b');
  });

  it('ignores anything after the closing quote', () => {
    expect(valueOf('max_clients="100"junk')).toBe('100');
  });

  it('reads an unterminated quote to the end of the line', () => {
    expect(valueOf('max_clients="100')).toBe('100');
  });

  it('cuts an unquoted value at an inline ; or # comment', () => {
    expect(valueOf('max_clients=100 ; note')).toBe('100');
    expect(valueOf('max_clients=100 # note')).toBe('100');
  });

  it('treats key=, key=;, key= # c, key="" as present with an empty value', () => {
    for (const line of ['max_clients=', 'max_clients=;', 'max_clients= # c', 'max_clients=""', "max_clients=''"]) {
      expect(valueOf(line)).toBe('');
    }
  });
});

describe('parseConfText — lines the engine rejects (whole file fails to load)', () => {
  it('a line with no "="', () => {
    expect(errorsOf('[common]\nmax_clients 100')).toEqual([expect.objectContaining({ lineNo: 2 })]);
  });

  it('a line starting with "="', () => {
    expect(errorsOf('[common]\n=100')).toHaveLength(1);
  });

  it('a ;-prefixed line (only # starts a comment)', () => {
    expect(errorsOf('[common]\n; note')).toHaveLength(1);
  });

  it('a section header with trailing text', () => {
    expect(errorsOf('[common] # c')).toHaveLength(1);
  });

  it('a line longer than the engine buffer allows', () => {
    expect(errorsOf(`[common]\nha_node_list=${'a'.repeat(497)}`)).toEqual([]); // 510 chars
    expect(errorsOf(`[common]\nha_node_list=${'a'.repeat(498)}`)).toHaveLength(1); // 511 chars
  });
});

describe('parseConfText — continuation lines', () => {
  it('joins a trailing-backslash line with the next, reported at the first line', () => {
    const { sections, syntaxErrors } = parseConfText('[service]\nserver=a,\\\nb');
    expect(syntaxErrors).toEqual([]);
    expect(sections[0].entries).toEqual([{ key: 'server', value: 'a,b', lineNo: 2 }]);
  });

  it('drops a continuation still pending at end of file, like the engine', () => {
    const { sections, syntaxErrors } = parseConfText('[common]\nmax_clients=100\\');
    expect(syntaxErrors).toEqual([]);
    expect(sections[0].entries).toEqual([]);
  });
});

describe('parseConfText — sections', () => {
  it('lowercases section names but keeps an @-section case-sensitive', () => {
    const names = parseConfText('[Common]\na=1\n[@DemoDB]\nb=2\n[%Broker1]\nc=3').sections.map(s => s.name);
    expect(names).toEqual(['common', '@DemoDB', '%broker1']);
  });

  it('merges a section that appears twice, like the engine\'s single section:key table', () => {
    const { sections } = parseConfText('[%b1]\nBROKER_PORT=30000\n[broker]\nMASTER_SHM_ID=1\n[%b1]\nMIN_NUM_APPL_SERVER=5');
    expect(sections.map(s => s.name)).toEqual(['%b1', 'broker']);
    expect(sections[0].entries.map(e => e.key)).toEqual(['BROKER_PORT', 'MIN_NUM_APPL_SERVER']);
  });

  it('keeps an empty section (the engine still sees it)', () => {
    expect(parseConfText('[%b1]\n[broker]\nMASTER_SHM_ID=1').sections.map(s => s.name)).toEqual(['%b1', 'broker']);
  });

  it('accepts array input (CMS confdata) the same as text', () => {
    expect(parseConfText(['[common]', 'max_clients=100']).sections[0].entries[0].value).toBe('100');
  });
});
