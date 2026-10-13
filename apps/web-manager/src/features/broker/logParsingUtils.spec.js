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
