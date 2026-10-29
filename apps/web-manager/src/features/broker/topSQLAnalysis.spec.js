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
const snapshot = lines => ({ total: String(lines.length), log: [{ line: lines }] });

describe('complete-log Top SQL analysis', () => {
  it('captures once and carries executions across local chunk boundaries', async () => {
    const capture = vi.fn(async () => snapshot(makeLog()));
    expect(await analyzeTopSQL(capture)).toEqual({ total: 1003, rows: [{
      id: 'Q1', sql: 'SELECT * FROM t WHERE id = ?', c: 2, e: 1,
      max: '0.002', min: '0.002', avg: '0.002',
    }] });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith();
  });

  it.each([1003, 2000])('never reopens the live path after replacement with %i lines', async total => {
    const capture = vi.fn()
      .mockResolvedValueOnce(snapshot(makeLog()))
      .mockResolvedValue({ total: String(total), log: [{ line: Array(total).fill('replacement file') }] });
    const result = await analyzeTopSQL(capture);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(1003);
    expect(result.rows[0].c).toBe(2);
  });

  it('keeps an execution prefix whose SQL body starts in the next chunk', async () => {
    const lines = Array(999).fill('26-10-28 10:00:00.000 (0) STATE idle');
    lines.push('26-10-28 10:00:00.000 (1) execute srv_h_id 1 ',
      'SELECT * FROM t WHERE id = ?',
      '26-10-28 10:00:00.001 (1) bind 1 : INT 2',
      '26-10-28 10:00:00.004 (1) execute error:-670 tuple 0 time 0.004');
    const { rows } = await analyzeTopSQL(async () => snapshot(lines));
    expect(rows).toEqual([{ id: 'Q1', sql: 'SELECT * FROM t WHERE id = ?',
      c: 1, e: 1, min: '0.004', max: '0.004', avg: '0.004' }]);
  });

  it('rejects a short or malformed snapshot', async () => {
    await expect(analyzeTopSQL(async () => ({ total: '5', log: [] }))).rejects.toThrow('LOG_INCOMPLETE');
    await expect(analyzeTopSQL(async () => ({ total: 'unknown', log: [] }))).rejects.toThrow('LOG_INCOMPLETE');
  });

  it('handles empty snapshots', async () => {
    expect(await analyzeTopSQL(async () => snapshot([]))).toEqual({ rows: [], total: 0 });
  });

  it('does not analyze after cancellation during capture', async () => {
    const controller = new AbortController();
    const capture = vi.fn(async () => { controller.abort(); return snapshot(makeLog()); });
    await expect(analyzeTopSQL(capture, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
