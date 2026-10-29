import { describe, expect, it } from 'vitest';
import { extractTopSQL } from './logParsingUtils';

describe('extractTopSQL', () => {
  // Real broker SQL log sample from RND-2876: a query that fails CAS-side
  // (execute_all error:-670) was still showing as 0 errors in the TOP SQL
  // view, because the extractor looked for a "*** error" marker that never
  // appears in this log format at all — the actual CUBRID broker log writes
  // the result code (optionally prefixed with the literal text "error:")
  // directly on the execute-result line, and a query failed iff that code
  // is negative (see broker_log_top.c's read_execute_end_msg/query_info_add,
  // the reference implementation this mirrors).
  it('counts a CAS-reported execution failure as an error, matching broker_log_top', () => {
    const lines = [
      '26-10-08 15:02:53.924 (0) close_req_handle srv_h_id 2',
      '26-10-08 15:02:53.924 (6) prepare 8 INSERT INTO s1 values(1)',
      '26-10-08 15:02:53.925 (6) prepare srv_h_id 2 (PC)',
      '26-10-08 15:02:53.941 (6) set query timeout to 0 (no limit)',
      '26-10-08 15:02:53.941 (6) execute_all srv_h_id 2 INSERT INTO s1 values(1)',
      '26-10-08 15:02:53.942 (6) execute_all error:-670 tuple 0 time 0.001, EID = 2',
    ];

    const [row] = extractTopSQL(lines);

    expect(row).toBeDefined();
    expect(row.c).toBe(1);
    expect(row.e).toBe(1);
    expect(row.max).toBe('0.001');
    expect(row.min).toBe('0.001');
    expect(row.avg).toBe('0.001');
  });

  it('does not count a successful execution (no "error:" prefix, non-negative result code) as an error', () => {
    const lines = [
      '26-10-08 15:03:10.100 (6) execute srv_h_id 1 select \'a\' from db_root',
      '26-10-08 15:03:10.104 (6) execute 0 tuple 1 time 0.004',
    ];

    const [row] = extractTopSQL(lines);

    expect(row).toBeDefined();
    expect(row.c).toBe(1);
    expect(row.e).toBe(0);
    expect(row.max).toBe('0.004');
    expect(row.min).toBe('0.004');
  });

  it('still finds a failure whose result line is pushed past a 500-char lookahead by long bind values', () => {
    const longValue = 'x'.repeat(100);
    const lines = [
      '26-10-08 15:05:00.000 (6) prepare 9 INSERT INTO s1 values(?, ?, ?, ?, ?, ?)',
      '26-10-08 15:05:00.001 (6) prepare srv_h_id 3 (PC)',
      // Six long bind lines (~120 bytes each, ~720 total) push the eventual
      // execute-result line well past a fixed 500-char lookahead window.
      `26-10-08 15:05:00.002 (6) bind 1 : VARCHAR (100) ${longValue}`,
      `26-10-08 15:05:00.002 (6) bind 2 : VARCHAR (100) ${longValue}`,
      `26-10-08 15:05:00.002 (6) bind 3 : VARCHAR (100) ${longValue}`,
      `26-10-08 15:05:00.002 (6) bind 4 : VARCHAR (100) ${longValue}`,
      `26-10-08 15:05:00.002 (6) bind 5 : VARCHAR (100) ${longValue}`,
      `26-10-08 15:05:00.002 (6) bind 6 : VARCHAR (100) ${longValue}`,
      '26-10-08 15:05:00.010 (6) execute_all srv_h_id 3 INSERT INTO s1 values(?, ?, ?, ?, ?, ?)',
      '26-10-08 15:05:00.012 (6) execute_all error:-670 tuple 0 time 0.002, EID = 3',
    ];

    const [row] = extractTopSQL(lines);

    expect(row).toBeDefined();
    expect(row.c).toBe(1);
    expect(row.e).toBe(1);
    expect(row.max).toBe('0.002');
    expect(row.min).toBe('0.002');
  });

  it('reports "-" instead of "0.000" when no execution result line can be found at all', () => {
    const lines = [
      '26-10-08 15:06:00.000 (6) execute_all srv_h_id 4 INSERT INTO s1 values(1)',
      // Log truncated before the result line ever arrives.
    ];

    const [row] = extractTopSQL(lines);

    expect(row).toBeDefined();
    expect(row.c).toBe(1);
    expect(row.e).toBe(0);
    expect(row.max).toBe('-');
    expect(row.min).toBe('-');
    expect(row.avg).toBe('-');
  });

  it('computes min separately from max across repeated executions of the same query', () => {
    const lines = [
      '26-10-08 15:04:00.000 (6) execute_all srv_h_id 1 INSERT INTO s1 values(1)',
      '26-10-08 15:04:00.010 (6) execute_all 0 tuple 1 time 0.010',
      '26-10-08 15:04:01.000 (6) execute_all srv_h_id 1 INSERT INTO s1 values(1)',
      '26-10-08 15:04:01.002 (6) execute_all 0 tuple 1 time 0.002',
    ];

    const [row] = extractTopSQL(lines);

    expect(row).toBeDefined();
    expect(row.c).toBe(2);
    expect(row.e).toBe(0);
    expect(row.max).toBe('0.010');
    expect(row.min).toBe('0.002');
  });
});

describe('Top SQL template grouping', () => {
  it('aggregates different bind values without changing SQL literals', () => {
    const lines = [
      "26-10-28 10:00:00.000 (1) execute srv_h_id 1 SELECT '?' AS marker FROM t WHERE id = ?",
      '26-10-28 10:00:00.001 (1) bind 1 : INT 1',
      '26-10-28 10:00:00.002 (1) execute 0 tuple 1 time 0.002',
      "26-10-28 10:00:01.000 (1) execute srv_h_id 1 SELECT '?' AS marker FROM t WHERE id = ?",
      '26-10-28 10:00:01.001 (1) bind 1 : INT 2',
      '26-10-28 10:00:01.004 (1) execute error:-1 tuple 0 time 0.004',
    ];
    expect(extractTopSQL(lines)).toEqual([{
      id: 'Q1', sql: "SELECT '?' AS marker FROM t WHERE id = ?",
      c: 2, e: 1, min: '0.002', max: '0.004', avg: '0.003',
    }]);
  });

  it('keeps queries with different literal SQL separate', () => {
    const lines = [
      "26-10-28 10:00:00.000 (1) execute srv_h_id 1 SELECT 'a  b' FROM db_root",
      '26-10-28 10:00:00.001 (1) execute 0 tuple 1 time 0.001',
      "26-10-28 10:00:01.000 (1) execute srv_h_id 1 SELECT 'a b' FROM db_root",
      '26-10-28 10:00:01.001 (1) execute 0 tuple 1 time 0.001',
    ];
    expect(extractTopSQL(lines)).toHaveLength(2);
  });
});
