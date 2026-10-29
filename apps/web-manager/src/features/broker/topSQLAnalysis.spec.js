import { describe, expect, it, vi } from 'vitest';
import { analyzeTopSQL } from './topSQLAnalysis';

function makeLog() {
  const lines = Array.from({ length: 1003 }, () => '26-10-28 10:00:00.000 (1) close_req_handle srv_h_id 1');
  for (const [index, value, result] of [[99, 1, '0'], [999, 2, 'error:-1']]) {
    lines[index] = '26-10-28 10:00:00.000 (1) execute srv_h_id 1 SELECT * FROM t WHERE id = ?';
    lines[index + 1] = `26-10-28 10:00:00.001 (1) bind 1 : INT ${value}`;
    lines[index + 2] = `26-10-28 10:00:00.002 (1) execute ${result} tuple 1 time 0.002`;
  }
  return lines;
}

const response = (lines, start, end) => ({ total: String(lines.length), log: [{ line: lines.slice(Number(start) - 1, Number(end)) }] });

describe('complete-log Top SQL analysis', () => {
  it('reads bounded ranges and carries executions across 100-line and 1000-line boundaries', async () => {
    const lines = makeLog();
    const read = vi.fn(async ({ start, end }) => response(lines, start, end));
    const result = await analyzeTopSQL(read);
    expect(read.mock.calls.map(([range]) => range)).toEqual([
      { start: '1', end: '1000' }, { start: '1001', end: '1003' },
    ]);
    expect(result).toEqual({ total: 1003, rows: [{
      id: 'Q1', sql: 'SELECT * FROM t WHERE id = ?', c: 2, e: 1,
      max: '0.002', min: '0.002', avg: '0.002',
    }] });
  });

  it('stops at the initial line count even if the active log keeps growing', async () => {
    const lines = makeLog();
    const read = vi.fn(async ({ start, end }) => ({
      ...response(lines, start, end), total: read.mock.calls.length === 1 ? '1003' : '5000',
    }));
    expect((await analyzeTopSQL(read)).total).toBe(1003);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('rejects a truncated file instead of exporting partial counts', async () => {
    const lines = makeLog();
    const read = vi.fn(async ({ start, end }) => read.mock.calls.length === 1
      ? response(lines, start, end) : { total: '0', log: [] });
    await expect(analyzeTopSQL(read)).rejects.toThrow('LOG_CHANGED');
  });

  it('rejects a short or malformed response', async () => {
    await expect(analyzeTopSQL(async () => ({ total: '5', log: [] }))).rejects.toThrow('LOG_INCOMPLETE');
    await expect(analyzeTopSQL(async () => ({ total: 'unknown', log: [] }))).rejects.toThrow('LOG_INCOMPLETE');
  });

  it('handles empty files', async () => {
    expect(await analyzeTopSQL(async () => ({ total: '0', log: [] }))).toEqual({ rows: [], total: 0 });
  });

  it('does not continue reading after cancellation', async () => {
    const controller = new AbortController();
    const lines = makeLog();
    const read = vi.fn(async ({ start, end }) => {
      controller.abort();
      return response(lines, start, end);
    });
    await expect(analyzeTopSQL(read, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(read).toHaveBeenCalledTimes(1);
  });
});
