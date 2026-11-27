import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
vi.mock('../../layout/components/LanguageToggle', () => ({ default: () => null }));
vi.mock('../adminApi', () => ({
  adminApi: { countPending: vi.fn(), queryApiLog: vi.fn() },
}));
import { adminApi } from '../adminApi';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminConsolePage from './AdminConsolePage';
import { resetPendingApprovals } from '../usePendingApprovals';
import { ConfirmProvider } from '../../../infrastructure/context/ConfirmContext';
import { CM } from '../../../constants/cmLabels';
import { apiActionText, apiLogCsv, apiTargetText, bucketLabel, rangeBounds } from '../apiLogView';

const NOW = new Date().toISOString();
const ENTRIES = [
  { at: NOW, requestId: 'r1', user: 'alice', action: 'database.start', category: 'database', method: 'POST', path: '/api/h1/database/start/demodb', host: 'prod-01', target: 'demodb', status: 200, ok: true, durationMs: 2300 },
  { at: NOW, requestId: 'r2', user: 'bob', action: 'auth.sign_in', category: 'auth', method: 'POST', path: '/api/auth/login', status: 401, ok: false, durationMs: 90, errorCode: 'INVALID_CREDENTIALS', error: 'Wrong id or password.' },
];
const SUMMARY = {
  actions: 2, failed: 1, failedSignIns: 1, activeUsers: 1, bucket: 'hour',
  buckets: [{ start: NOW, ok: 1, failed: 1 }],
};

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  resetPendingApprovals();
  adminApi.countPending.mockResolvedValue({ count: 0 });
  adminApi.queryApiLog.mockResolvedValue({ entries: ENTRIES, total: 2, summary: SUMMARY });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const state = {
  auth: { user: { id: 'root', isAdmin: true } },
  layout: { theme: 'dark', statusModal: { isOpen: false } },
  host: { hostGroups: {}, haInfo: {} },
  user: { preferences: { uiLocale: 'en' } },
};
const render = async () =>
  act(async () =>
    root.render(
      <Provider store={configureStore({ reducer: (s = state) => s })}>
        <ConfirmProvider>
          <MemoryRouter initialEntries={['/admin/api-log']}>
            <Routes>
              <Route path="/admin/*" element={<AdminConsolePage />} />
            </Routes>
          </MemoryRouter>
        </ConfirmProvider>
      </Provider>
    )
  );
const el = (id) => document.querySelector(`[data-testid="${id}"]`);
function setValue(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('API Log page', () => {
  it('is in the admin menu and shows totals, the chart and the actions', async () => {
    await render();
    expect(el('admin-section-api-log').textContent).toContain('API Log');
    expect(el('admin-api-log-stat-actions').textContent).toContain('2');
    expect(el('admin-api-log-stat-sign-ins').textContent).toContain('1');
    expect(el('admin-api-log-chart')).not.toBeNull();

    const rows = [...document.querySelectorAll('[data-testid="admin-api-log-row"]')].map((r) => r.textContent);
    expect(rows[0]).toContain('Start database');
    expect(rows[0]).toContain('prod-01 / demodb');
    expect(rows[0]).toContain('OK');
    expect(rows[1]).toContain('Sign in');
    expect(rows[1]).toContain('Failed');
    expect(rows[1]).toContain('Wrong id or password.');
  });

  it('asks for the last 24 hours with the time zone, then filters by user from the first page', async () => {
    await render();
    const first = adminApi.queryApiLog.mock.calls[0][0];
    expect(Date.parse(first.to) - Date.parse(first.from)).toBe(24 * 60 * 60 * 1000);
    expect(first).toMatchObject({ limit: 50, offset: 0, tz: new Date().getTimezoneOffset() });

    const input = el('admin-api-log-user').querySelector('input') ?? el('admin-api-log-user');
    await act(async () => setValue(input, 'alice'));
    const last = adminApi.queryApiLog.mock.calls.at(-1)[0];
    expect(last).toMatchObject({ user: 'alice', offset: 0 });
  });

  it('says so when nothing matches', async () => {
    adminApi.queryApiLog.mockResolvedValue({ entries: [], total: 0, summary: { ...SUMMARY, actions: 0, buckets: [] } });
    await render();
    expect(el('admin-api-log-table').textContent).toContain('No actions in this range.');
  });
});

describe('apiLogView', () => {
  it('names an action, or shows the route for one without a name', () => {
    expect(apiActionText(ENTRIES[0], CM)).toBe('Start database');
    expect(apiActionText({ method: 'POST', path: '/api/new/thing' }, CM)).toBe('POST /api/new/thing');
  });

  it('shows the host before the target', () => {
    expect(apiTargetText(ENTRIES[0])).toBe('prod-01 / demodb');
    expect(apiTargetText({ target: 'alice' })).toBe('alice');
  });

  it('labels hour buckets by local hour', () => {
    const start = new Date(2026, 10, 26, 9, 0, 0).toISOString();
    expect(bucketLabel(start, 'hour')).toBe('09:00');
  });

  it('gives each range its length', () => {
    const { from, to } = rangeBounds('7d', Date.parse('2026-11-26T00:00:00Z'));
    expect(to).toBe('2026-11-26T00:00:00.000Z');
    expect(from).toBe('2026-11-19T00:00:00.000Z');
  });

  it('writes a CSV that a spreadsheet cannot run as a formula', () => {
    const csv = apiLogCsv([{ ...ENTRIES[1], user: '=cmd' }], CM);
    const [, row] = csv.split('\r\n');
    expect(row).toContain(`"'=cmd"`);
    expect(row).toContain('"Wrong id or password."');
  });
});

describe('niceMax', () => {
  it('rounds the scale up to a clean number', async () => {
    const { niceMax } = await import('../apiLogView');
    expect([0, 3, 5, 11, 23, 70, 130].map(niceMax)).toEqual([4, 4, 5, 20, 50, 100, 200]);
  });
});
