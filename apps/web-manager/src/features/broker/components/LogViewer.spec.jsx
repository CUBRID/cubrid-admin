import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import brokerReducer from '../brokerSlice';
import { brokerApi } from '../brokerApi';
import { CM } from '../../../constants/cmLabels';
import LogViewer from './LogViewer';

vi.mock('../brokerApi', () => ({ brokerApi: { viewLog: vi.fn(), captureLogSnapshot: vi.fn() } }));

let container, root, lines, exportedBlob;
const path = '/cubrid/log/broker/sql_log/query_editor_1.sql.log';
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.resetAllMocks();
  exportedBlob = null;
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(blob => { exportedBlob = blob; return 'blob:top-sql-export'; });
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  lines = Array.from({ length: 1003 }, () => '26-10-28 10:00:00.000 (1) close_req_handle srv_h_id 1');
  for (const [index, value] of [[99, 1], [999, 2]]) {
    lines[index] = '26-10-28 10:00:00.000 (1) execute srv_h_id 1 SELECT * FROM t WHERE id = ?';
    lines[index + 1] = `26-10-28 10:00:00.001 (1) bind 1 : INT ${value}`;
    lines[index + 2] = '26-10-28 10:00:00.002 (1) execute 0 tuple 1 time 0.002';
  }
  brokerApi.captureLogSnapshot.mockImplementation(async () => ({ total: String(lines.length), log: [{ line: lines }] }));
  brokerApi.viewLog.mockImplementation(async (_host, { start, end }) => ({
    total: String(lines.length), log: [{ line: lines.slice(Number(start) - 1, Number(end)) }],
  }));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
const render = (logPath = path) => {
  const store = configureStore({ reducer: {
    broker: brokerReducer,
    user: (s = { preferences: { uiLocale: 'en' } }) => s,
  } });
  return act(async () => root.render(<Provider store={store}><LogViewer hostUid="h1" path={logPath} /></Provider>));
};
const click = async selector => {
  await act(async () => container.querySelector(selector).click());
  await act(async () => vi.runAllTimersAsync());
};
const readBlob = blob => new Promise(resolve => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.readAsText(blob);
});

describe('LogViewer complete-log Top SQL', () => {
  it('shows and exports full-file counts while keeping raw pagination separate', async () => {
    await render();
    expect(brokerApi.viewLog).toHaveBeenCalledWith('h1', { path, start: '1', end: '100' });
    await click('[data-testid="log-viewer-mode-top"]');
    expect(brokerApi.captureLogSnapshot).toHaveBeenCalledWith('h1', path);
    expect(brokerApi.viewLog).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(CM.topSQLScopeLabel(1003));
    const row = container.querySelector('[data-testid="top-sql-row"]');
    expect([...row.children].map(node => node.textContent)).toEqual([
      'Q1', '0.002', '0.002', '0.002', '2', '—', 'SELECT * FROM t WHERE id = ?',
    ]);
    expect(container.querySelector(`[aria-label="${CM.nextPage}"]`)).toBeNull();
    await click(`[title="${CM.downloadExcel}"]`);
    const xml = new DOMParser().parseFromString(await readBlob(exportedBlob), 'text/xml');
    expect(xml.querySelector('parsererror')).toBeNull();
    const rows = [...xml.getElementsByTagName('Row')];
    expect(rows[0].textContent).toBe(CM.topSQLScopeLabel(1003));
    expect([...rows[2].getElementsByTagName('Data')].map(node => node.textContent)).toEqual([
      'Q1', '0.002', '0.002', '0.002', '2', '0', 'SELECT * FROM t WHERE id = ?',
    ]);
    await click('[data-testid="log-viewer-mode-raw"]');
    expect(container.querySelector(`[aria-label="${CM.nextPage}"]`)).not.toBeNull();
    expect(container.textContent).toContain(CM.linesRangeLabel(1, 100, '1,003'));
  });

  it('disables export until the complete snapshot is captured and analyzed', async () => {
    await render();
    let finish;
    brokerApi.captureLogSnapshot.mockImplementation(() => new Promise(resolve => {
      finish = () => resolve({ total: String(lines.length), log: [{ line: lines }] });
    }));
    await click('[data-testid="log-viewer-mode-top"]');
    expect(container.querySelector(`[title="${CM.downloadExcel}"]`).disabled).toBe(true);
    expect(container.querySelector('[data-testid="top-sql-row"]')).toBeNull();
    expect(container.textContent).toContain(CM.loadingLogLines);
    await act(async () => finish());
    // Capture has completed, but analysis is still waiting between chunks.
    expect(container.querySelector(`[title="${CM.downloadExcel}"]`).disabled).toBe(true);
    await act(async () => vi.runAllTimersAsync());
    expect(container.querySelector(`[title="${CM.downloadExcel}"]`).disabled).toBe(false);
  });

  it('shows a capture failure and lets Refresh retry the whole analysis', async () => {
    await render();
    const original = brokerApi.captureLogSnapshot.getMockImplementation();
    brokerApi.captureLogSnapshot.mockRejectedValue(new Error('CMS read failed'));
    await click('[data-testid="log-viewer-mode-top"]');
    expect(container.querySelector('[role="alert"]').textContent).toBe('CMS read failed');
    expect(container.querySelector(`[title="${CM.downloadExcel}"]`).disabled).toBe(true);
    brokerApi.captureLogSnapshot.mockImplementation(original);
    await click('[data-testid="log-viewer-refresh-btn"]');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[data-testid="top-sql-row"]')).not.toBeNull();
  });

  it('does not show results from a cancelled analysis after leaving Top SQL', async () => {
    await render();
    let finish;
    brokerApi.captureLogSnapshot.mockImplementationOnce(() => new Promise(resolve => {
      finish = () => resolve({ total: '0', log: [] });
    }));
    await click('[data-testid="log-viewer-mode-top"]');
    await click('[data-testid="log-viewer-mode-raw"]');
    await act(async () => finish());
    expect(container.querySelector('[data-testid="log-viewer-mode-raw"]').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-testid="top-sql-row"]')).toBeNull();
  });
});
