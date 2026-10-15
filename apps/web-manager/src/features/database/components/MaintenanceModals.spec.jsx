import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CheckDatabaseModal from './CheckDatabaseModal';
import OptimizeDatabaseModal from './OptimizeDatabaseModal';

const mocks = vi.hoisted(() => ({ runJob: vi.fn(), getClassInfo: vi.fn() }));
vi.mock('../../../infrastructure/hooks/useCmsJob', () => ({
  useCmsJob: () => ({ runJob: mocks.runJob, background: vi.fn(), wasBackgrounded: () => false }),
}));
vi.mock('../databaseApi', () => ({ databaseApi: { getClassInfo: mocks.getClassInfo } }));

let container;
let root;
let store;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  store = configureStore({ reducer: () => ({
    user: { preferences: { uiLocale: 'en' } },
    host: { selectedHostUid: 'host-1' },
    database: { selectedDatabase: 'demodb', activeDatabases: [], loggedInDatabases: [] },
    databaseUI: { isCheckDatabaseModalOpen: true, isOptimizeDatabaseModalOpen: true },
  }) });
  mocks.getClassInfo.mockResolvedValue({ userclass: [{ classname: 'dba.employee' }] });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
const render = (node) => act(async () => root.render(<Provider store={store}>{node}</Provider>));

const job = (type, summary) => ({
  jobId: 'job-1', type, dbname: 'demodb', jobStatus: 'succeeded', maintenanceSummary: summary,
  startedAt: '2026-10-15T01:01:00Z', finishedAt: '2026-10-15T01:01:06Z', result: { success: true },
});

it.each([false, true])('shows inspection repair option %s before execution and in the foreground result', async (repair) => {
  mocks.runJob.mockResolvedValue(job('check', { operation: 'consistency-check', scope: 'entire-database', repairRequested: repair }));
  await render(<CheckDatabaseModal />);
  if (repair) await act(async () => container.querySelector('input[type="checkbox"]').click());
  const mode = repair ? 'Check with repair enabled' : 'Check only';
  expect(container.querySelector('[data-testid="maintenance-details"]').textContent).toContain(mode);
  await act(async () => container.querySelector('[data-testid="check-database-run-btn"]').click());
  const text = container.querySelector('[data-testid="maintenance-details"]').textContent;
  expect(text).toContain(mode);
  expect(text).toContain('6.0 seconds');
  expect(text).toContain('Detailed findingsNot reported by server');
});

it.each([false, true])('shows optimization scope for selected-class=%s before execution and in the foreground result', async (selected) => {
  const summary = { operation: 'statistics-update', scope: selected ? 'selected-class' : 'all-classes', scanMethod: 'unknown', ...(selected ? { className: 'dba.employee' } : {}) };
  mocks.runJob.mockResolvedValue(job('optimize', summary));
  await render(<OptimizeDatabaseModal />);
  if (selected) {
    const select = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('All Tables'));
    await act(async () => select.click());
    const option = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('dba.employee'));
    await act(async () => option.click());
  }
  const scope = selected ? 'Selected class: dba.employee' : 'All classes';
  expect(container.querySelector('[data-testid="maintenance-details"]').textContent).toContain(scope);
  await act(async () => container.querySelector('[data-testid="optimize-database-run-btn"]').click());
  const text = container.querySelector('[data-testid="maintenance-details"]').textContent;
  expect(text).toContain(scope);
  expect(text).toContain('Full scan or sampling: not reported by server');
  expect(text).toContain('6.0 seconds');
});

it('retains the failed job diagnostics and repair context in the foreground error view', async () => {
  const failed = { ...job('check', { scope: 'entire-database', repairRequested: false }), jobStatus: 'failed', result: { success: false, output: 'Index inconsistency reported' } };
  mocks.runJob.mockRejectedValue(Object.assign(new Error('Check failed'), { job: failed }));
  await render(<CheckDatabaseModal />);
  await act(async () => container.querySelector('[data-testid="check-database-run-btn"]').click());
  const text = container.querySelector('[data-testid="maintenance-details"]').textContent;
  expect(text).toContain('Check only');
  expect(text).toContain('Command failed');
  expect(text).toContain('Index inconsistency reported');
});
