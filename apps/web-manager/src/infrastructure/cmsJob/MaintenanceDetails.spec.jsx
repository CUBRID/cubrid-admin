import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCM } from '../../constants/useCM';
import { MaintenanceDetails } from './MaintenanceDetails';
import { getMaintenanceRows } from './maintenanceDetailsUtils';
import { JobResultModal } from './JobResultModal';
import { BackgroundJobsPanel } from './BackgroundJobsPanel';
import { getCmsJobErrorResult, normalizeTrackedJob } from './cmsJobUtils';

const completed = {
  jobId: 'job-1', type: 'optimize', dbname: 'demodb', hostUid: 'host-1', jobStatus: 'succeeded',
  createdAt: '2026-10-15T01:00:00Z',
  startedAt: '2026-10-15T01:01:00Z', finishedAt: '2026-10-15T01:01:06Z',
  maintenanceSummary: { operation: 'statistics-update', scope: 'selected-class', className: 'dba.employee', scanMethod: 'unknown' },
  result: { success: true },
};

describe('maintenance result rows', () => {
  it('uses execution time excluding queue time and identifies the class and unknown scan method', () => {
    const CM = getCM('en');
    const rows = Object.fromEntries(getMaintenanceRows(completed, CM));
    expect(rows[CM.maintenanceScope]).toBe('Selected class: dba.employee');
    expect(rows[CM.maintenanceScanMethod]).toBe(CM.maintenanceScanUnknown);
    expect(rows[CM.maintenanceDuration]).toBe('6.0 seconds');
    expect(rows[CM.maintenanceOutput]).toBe(CM.maintenanceNotReported);
  });

  it('does not infer scope or repair settings from older results or display invalid duration', () => {
    const CM = getCM('en');
    const rows = Object.fromEntries(getMaintenanceRows({ type: 'check', jobStatus: 'succeeded', startedAt: 'bad', finishedAt: 'bad' }, CM));
    expect(rows[CM.maintenanceScope]).toBe(CM.maintenanceNotReported);
    expect(rows[CM.maintenanceRepairMode]).toBe(CM.maintenanceNotReported);
    expect(rows[CM.maintenanceDuration]).toBe('—');
    expect(rows[CM.maintenanceFindings]).toBe(CM.maintenanceNotReported);
  });

  it('falls back to English for new maintenance keys while preserving existing Korean labels', () => {
    const CM = getCM('ko');
    const rows = Object.fromEntries(getMaintenanceRows({ ...completed, type: 'check', maintenanceSummary: { scope: 'entire-database', repairRequested: true } }, CM));
    expect(CM.databaseName).toBe('데이터베이스 이름');
    expect(CM.maintenanceRepairMode).toBe('Repair mode');
    expect(rows[CM.maintenanceRepairMode]).toBe('Check with repair enabled');
    expect(rows[CM.result]).toBe('Command completed successfully');
    expect(rows[CM.maintenanceDuration]).toBe('6.0 seconds');
  });

  it('retains the summary when a later snapshot omits it', () => {
    expect(normalizeTrackedJob({ jobId: completed.jobId }, normalizeTrackedJob(completed)).maintenanceSummary)
      .toEqual(completed.maintenanceSummary);
  });

  it('preserves the last server status and clears uncertainty on an authoritative success', () => {
    const running = { ...completed, jobStatus: 'running', finishedAt: undefined, result: undefined };
    const uncertain = getCmsJobErrorResult(new Error('Network unavailable'), running);
    expect(uncertain.jobStatus).toBe('running');
    expect(uncertain.outcomeUnknown).toBe(true);
    expect(normalizeTrackedJob(completed, uncertain).outcomeUnknown).toBe(false);
  });
});

let container;
let root;
let store;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  store = configureStore({ reducer: () => ({ user: { preferences: { uiLocale: 'en' } }, host: { hosts: [] } }) });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = (node) => act(async () => root.render(<Provider store={store}>{node}</Provider>));

it('renders details inside the background completion notification and failure notification', async () => {
  await render(<JobResultModal result={{ ...completed, status: 'succeeded' }} onClose={vi.fn()} />);
  expect(container.querySelector('[data-testid="maintenance-details"]').textContent).toContain('dba.employee');
  await render(<JobResultModal result={{ ...completed, status: 'failed', jobStatus: 'failed', error: { message: 'Check failed' } }} onClose={vi.fn()} />);
  expect(container.querySelector('[data-testid="maintenance-details"]').textContent).toContain('Command failed');
});

it('shows persisted maintenance summaries when a restored job is opened from the jobs panel', async () => {
  await render(<BackgroundJobsPanel jobs={[completed]} activeCount={0} expanded onToggleExpanded={vi.fn()} onDismiss={vi.fn()} onClearCompleted={vi.fn()} />);
  await act(async () => container.querySelector('li > div').click());
  const details = container.querySelector('[data-testid="job-detail-modal"] [data-testid="maintenance-details"]');
  expect(details.textContent).toContain('Selected class: dba.employee');
  expect(details.textContent).toContain('6.0 seconds');
});

it('shows an unconfirmed background result without claiming the command failed', async () => {
  const result = { ...completed, jobStatus: 'running', status: 'running', finishedAt: undefined, result: undefined, outcomeUnknown: true };
  await render(<JobResultModal result={result} onClose={vi.fn()} />);
  expect(container.textContent).toContain('Result unconfirmed');
  expect(container.textContent).toContain('may still be running or may have completed');
  expect(container.textContent).not.toContain('Command failed');
  expect(container.textContent).not.toContain('Optimize failed');
});

it('labels a job with lost polling as unconfirmed in the jobs panel', async () => {
  const uncertain = { ...completed, jobStatus: 'running', finishedAt: undefined, result: undefined, outcomeUnknown: true };
  await render(<BackgroundJobsPanel jobs={[uncertain]} activeCount={0} expanded onToggleExpanded={vi.fn()} onDismiss={vi.fn()} onClearCompleted={vi.fn()} />);
  expect(container.querySelector('li').textContent).toContain('Result unconfirmed');
  await act(async () => container.querySelector('li > div').click());
  expect(container.querySelector('[data-testid="maintenance-details"]').textContent).toContain('Result unconfirmed');
  expect(container.textContent).not.toContain('Command failed');
});

it('copies available output and displays a fallback when clipboard access fails', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  await render(<MaintenanceDetails job={{ ...completed, result: { output: 'Reported utility detail' } }} />);
  await act(async () => container.querySelector('button').click());
  expect(writeText).toHaveBeenCalledWith('Reported utility detail');
  expect(container.querySelector('[role="status"]').textContent).toBe('Output copied');
  writeText.mockRejectedValueOnce(new Error('Clipboard unavailable'));
  await act(async () => container.querySelector('button').click());
  expect(container.querySelector('[role="status"]').textContent).toContain('Select the text');
});
