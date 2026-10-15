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
    database: { selectedDatabase: 'demodb', activeDatabasesByHost: { 'host-1': [] }, loggedInDatabases: [] },
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

it.each([
  ['check', CheckDatabaseModal, 'check-database-run-btn'],
  ['optimize', OptimizeDatabaseModal, 'optimize-database-run-btn'],
])('does not report a command failure or offer resubmission when %s status polling loses connection', async (type, Component, buttonId) => {
  const running = { jobId: 'job-1', type, dbname: 'demodb', jobStatus: 'running' };
  mocks.runJob.mockImplementation(async (_submit, { onProgress }) => {
    onProgress(running);
    throw Object.assign(new Error('Network unavailable'), { jobStatusUnavailable: true, jobId: 'job-1', lastKnownJob: running });
  });
  await render(<Component />);
  await act(async () => container.querySelector(`[data-testid="${buttonId}"]`).click());
  const text = container.textContent;
  expect(text).toContain('Result unconfirmed');
  expect(text).toContain('may still be running or may have completed');
  expect(text).not.toContain('Command failed');
  expect(container.querySelector('[data-testid="modal-status-retry-btn"]')).toBeNull();
  expect(mocks.runJob).toHaveBeenCalledTimes(1);
});

it.each([
  [CheckDatabaseModal, 'check-database-run-btn', 'Check only'],
  [OptimizeDatabaseModal, 'optimize-database-run-btn', 'All classes'],
])('preserves the requested scope when the first status response is unavailable', async (Component, buttonId, option) => {
  mocks.runJob.mockRejectedValue(Object.assign(new Error('Network unavailable'), { jobStatusUnavailable: true, jobId: 'job-1' }));
  await render(<Component />);
  await act(async () => container.querySelector(`[data-testid="${buttonId}"]`).click());
  const text = container.querySelector('[data-testid="maintenance-details"]').textContent;
  expect(text).toContain(option);
  expect(text).toContain('Result unconfirmed');
  expect(text).not.toContain('Command failed');
});

it('continues to show command failure and retry for a server-confirmed optimization failure', async () => {
  const failed = { ...job('optimize', { scope: 'all-classes', scanMethod: 'unknown' }), jobStatus: 'failed', error: { message: 'Optimization failed on server' } };
  mocks.runJob.mockRejectedValue(Object.assign(new Error('Optimization failed on server'), { jobTerminalFailure: true, job: failed }));
  await render(<OptimizeDatabaseModal />);
  await act(async () => container.querySelector('[data-testid="optimize-database-run-btn"]').click());
  expect(container.querySelector('[data-testid="maintenance-details"]').textContent).toContain('Command failed');
  expect(container.querySelector('[data-testid="modal-status-retry-btn"]')).not.toBeNull();
  expect(container.textContent).not.toContain('Result unconfirmed');
});
