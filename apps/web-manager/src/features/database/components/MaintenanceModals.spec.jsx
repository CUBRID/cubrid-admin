import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CheckDatabaseModal from './CheckDatabaseModal';
import OptimizeDatabaseModal from './OptimizeDatabaseModal';
import uiReducer from '../databaseUISlice';
import { CmsJobProvider } from '../../../infrastructure/context/CmsJobContext';

const mocks = vi.hoisted(() => ({ submit: vi.fn(), run: vi.fn(), getClassInfo: vi.fn() }));
vi.mock('../../../api/apiClient', () => ({ default: { defaults: { headers: { common: {} } } } }));
vi.mock('../databaseJobApi', async importOriginal => ({
  ...await importOriginal(),
  databaseJobApi: { submitCheck: mocks.submit, submitOptimize: mocks.submit, listRecent: async () => [] },
}));
vi.mock('../../../infrastructure/services/cmsJobRunner', () => ({
  runCmsJobInBackground: mocks.run, isCmsJobPolling: () => false,
  cancelAllCmsJobPolls: vi.fn(), cancelCmsJobPoll: vi.fn(),
}));
vi.mock('../databaseApi', () => ({ databaseApi: { getClassInfo: mocks.getClassInfo } }));

let container;
let root;
let store;
const cases = [
  ['check', CheckDatabaseModal, 'check-database-run-btn'],
  ['optimize', OptimizeDatabaseModal, 'optimize-database-run-btn'],
];
const summary = type => type === 'check'
  ? { operation: 'consistency-check', scope: 'entire-database', repairRequested: false }
  : { operation: 'statistics-update', scope: 'all-classes', scanMethod: 'unknown' };
const job = type => ({
  jobId: 'job-1', type, dbname: 'demodb', jobStatus: 'succeeded', maintenanceSummary: summary(type),
  startedAt: '2026-10-15T01:01:00Z', finishedAt: '2026-10-15T01:01:06Z', result: { success: true },
});
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const state = {
    auth: { isAuthenticated: true }, user: { preferences: { uiLocale: 'en' } },
    host: { selectedHostUid: 'host-1' },
    database: { selectedDatabase: 'demodb', activeDatabasesByHost: { 'host-1': [] }, loggedInDatabases: [] },
  };
  store = configureStore({ reducer: {
    ...Object.fromEntries(Object.entries(state).map(([key, value]) => [key, () => value])),
    databaseUI: uiReducer,
  }, preloadedState: { databaseUI: {
    ...uiReducer(undefined, { type: 'init' }), isCheckDatabaseModalOpen: true, isOptimizeDatabaseModalOpen: true,
  } } });
  mocks.submit.mockResolvedValue({ jobId: 'job-1' });
  mocks.getClassInfo.mockResolvedValue({ userclass: [{ classname: 'dba.employee' }] });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
const render = Component => act(async () => root.render(
  <StrictMode><Provider store={store}><CmsJobProvider><Component /></CmsJobProvider></Provider></StrictMode>
));
const click = selector => act(async () => container.querySelector(selector).click());
const resultModal = () => container.querySelector('[data-testid="job-result-modal"]');

it.each(cases)('shows exactly one shared result for foreground %s success', async (type, Component, buttonId) => {
  mocks.run.mockResolvedValue(job(type));
  await render(Component);
  await click(`[data-testid="${buttonId}"]`);
  expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(resultModal().textContent).toContain('6.0 seconds');
  expect(resultModal().textContent).toContain('Command completed successfully');
  expect(mocks.submit).toHaveBeenCalledTimes(1);
  await click('[data-testid="modal-status-confirm-btn"]');
  expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(0);
});

it.each([false, true])('keeps inspection repair=%s in preview and shared result', async repair => {
  mocks.run.mockResolvedValue({ ...job('check'), maintenanceSummary: { ...summary('check'), repairRequested: repair } });
  await render(CheckDatabaseModal);
  if (repair) await click('input[type="checkbox"]');
  const mode = repair ? 'Check with repair enabled' : 'Check only';
  expect(container.textContent).toContain(mode);
  await click('[data-testid="check-database-run-btn"]');
  expect(resultModal().textContent).toContain(mode);
  expect(mocks.submit).toHaveBeenCalledWith('host-1', 'demodb', { repairdb: repair ? 'y' : 'n' });
});

it('keeps selected-class scope in preview and shared optimization result', async () => {
  mocks.run.mockResolvedValue({ ...job('optimize'), maintenanceSummary: { ...summary('optimize'), scope: 'selected-class', className: 'dba.employee' } });
  await render(OptimizeDatabaseModal);
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent.includes('All Tables')).click());
  await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent.includes('dba.employee')).click());
  expect(container.textContent).toContain('Selected class: dba.employee');
  await click('[data-testid="optimize-database-run-btn"]');
  expect(resultModal().textContent).toContain('Selected class: dba.employee');
  expect(resultModal().textContent).toContain('Full scan or sampling: not reported by server');
});

it.each(cases)('shows only the shared error for a confirmed %s failure', async (type, Component, buttonId) => {
  const failed = { ...job(type), jobStatus: 'failed', error: { message: 'Utility failed' }, result: { success: false, output: 'Diagnostic output' } };
  mocks.run.mockRejectedValue(Object.assign(new Error('Utility failed'), { jobTerminalFailure: true, job: failed }));
  await render(Component);
  await click(`[data-testid="${buttonId}"]`);
  expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(resultModal().textContent).toContain('Command failed');
  expect(resultModal().textContent).toContain('Diagnostic output');
  await click('[data-testid="modal-status-cancel-btn"]');
  expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(0);
});

it.each(cases)('preserves requested %s scope in a shared unconfirmed result', async (type, Component, buttonId) => {
  mocks.run.mockRejectedValue(Object.assign(new Error('Network unavailable'), { jobStatusUnavailable: true, jobId: 'job-1' }));
  await render(Component);
  await click(`[data-testid="${buttonId}"]`);
  expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(resultModal().textContent).toContain('Result unconfirmed');
  expect(resultModal().textContent).toContain(type === 'check' ? 'Check only' : 'All classes');
  expect(resultModal().textContent).not.toContain('Command failed');
  expect(container.querySelector('[data-testid="modal-status-retry-btn"]')).toBeNull();
});

it.each(cases)('keeps %s submission errors local with retry because no job was accepted', async (_type, Component, buttonId) => {
  mocks.submit.mockRejectedValue(new Error('Submission rejected'));
  await render(Component);
  await click(`[data-testid="${buttonId}"]`);
  expect(resultModal()).toBeNull();
  expect(container.querySelector('[data-testid="modal-status-retry-btn"]')).not.toBeNull();
  expect(mocks.run).not.toHaveBeenCalled();
});

it.each(cases)('shows one shared result after %s continues in the background', async (type, Component, buttonId) => {
  let finish;
  mocks.run.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render(Component);
  await click(`[data-testid="${buttonId}"]`);
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent.includes('Confirm')).click());
  expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(0);
  await act(async () => finish(job(type)));
  expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(resultModal()).not.toBeNull();
});
