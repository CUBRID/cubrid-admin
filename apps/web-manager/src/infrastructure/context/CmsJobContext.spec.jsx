import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CmsJobProvider } from './CmsJobContext';
import { enqueueUniqueJobResult } from '../cmsJob/cmsJobUtils';
import { useCmsJobs } from '../hooks/useCmsJobs';
import { useCmsJob } from '../hooks/useCmsJob';

const mocks = vi.hoisted(() => ({ getJob: vi.fn(), listRecent: vi.fn(), run: vi.fn() }));
vi.mock('../../features/database/databaseJobApi', async importOriginal => ({
  ...await importOriginal(),
  databaseJobApi: { getJob: mocks.getJob, listRecent: mocks.listRecent },
}));
vi.mock('../services/cmsJobRunner', () => ({
  runCmsJobInBackground: mocks.run,
  isCmsJobPolling: () => false,
  cancelAllCmsJobPolls: vi.fn(),
}));
// Avoids apiClient.js's top-level `localStorage.getItem('token')` read, which
// this test's minimal jsdom setup doesn't need to exercise.
vi.mock('../../api/apiClient', () => ({ default: {
  defaults: { headers: { common: {} } },
  get: vi.fn(),
  post: vi.fn(),
} }));

describe('enqueueUniqueJobResult', () => {
  it('does not queue the same job result twice', () => {
    const result = { jobId: 'job-1', status: 'failed' };
    const queued = enqueueUniqueJobResult([], result);

    expect(enqueueUniqueJobResult(queued, { ...result })).toBe(queued);
    expect(queued).toEqual([result]);
  });

  it('keeps results from different jobs', () => {
    const first = { jobId: 'job-1', status: 'failed' };
    const second = { jobId: 'job-2', status: 'failed' };

    expect(enqueueUniqueJobResult([first], second)).toEqual([first, second]);
  });
});

describe('background job outcome certainty', () => {
  let container;
  let root;
  let store;
  const running = {
    jobId: 'job-1', type: 'check', dbname: 'demodb', jobStatus: 'running',
    maintenanceSummary: { operation: 'consistency-check', scope: 'entire-database', repairRequested: false },
  };

  function Harness() {
    const jobs = useCmsJobs();
    return <>
      <button onClick={() => jobs.runJob(async () => ({ jobId: 'job-1' })).catch(() => undefined)}>Start test job</button>
      <output data-testid="tracked-state">{JSON.stringify(jobs.allJobs)}</output>
    </>;
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    store = configureStore({ reducer: () => ({ auth: { isAuthenticated: true }, user: { preferences: { uiLocale: 'en' } } }) });
    mocks.listRecent.mockResolvedValue([]);
    mocks.getJob.mockResolvedValue(running);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  it.each([false, true])('uses server-confirmed failure=%s to distinguish failure from lost polling', async confirmed => {
    const failed = { ...running, jobStatus: 'failed', error: { message: 'Index inconsistency reported' } };
    const error = confirmed
      ? Object.assign(new Error(failed.error.message), { jobTerminalFailure: true, job: failed })
      : Object.assign(new Error('Network unavailable'), { jobStatusUnavailable: true, lastKnownJob: running });
    mocks.run.mockRejectedValue(error);
    await act(async () => root.render(<Provider store={store}><CmsJobProvider><Harness /></CmsJobProvider></Provider>));
    await act(async () => container.querySelector('button').click());
    const [tracked] = JSON.parse(container.querySelector('[data-testid="tracked-state"]').textContent);
    expect(tracked.jobStatus).toBe(confirmed ? 'failed' : 'running');
    expect(tracked.outcomeUnknown).toBe(!confirmed);
    expect(tracked.maintenanceSummary).toEqual(running.maintenanceSummary);
    const result = container.querySelector('[data-testid="job-result-modal"]');
    expect(result).not.toBeNull();
    if (confirmed) {
      expect(result.textContent).toContain('Command failed');
      expect(result.textContent).not.toContain('Result unconfirmed');
    } else {
      expect(result.textContent).toContain('Result unconfirmed');
      expect(result.textContent).not.toContain('Command failed');
    }
  });
});

describe('a job the dialog that ran it is still showing', () => {
  let container;
  let root;
  let store;
  const failed = { jobId: 'job-1', type: 'load', dbname: 'demodb', jobStatus: 'failed', error: { message: 'loaddb failed with exit status: 3' } };
  const done = { jobId: 'job-1', type: 'load', dbname: 'demodb', jobStatus: 'succeeded', result: { success: true } };

  function Dialog() {
    const { runJob, background } = useCmsJob();
    return <>
      <button data-testid="run" onClick={() => runJob(async () => ({ jobId: 'job-1' })).catch(() => undefined)}>Run</button>
      <button data-testid="background" onClick={background}>Background</button>
    </>;
  }
  const render = () => act(async () => root.render(<Provider store={store}><CmsJobProvider><Dialog /></CmsJobProvider></Provider>));
  const click = (id) => act(async () => container.querySelector(`[data-testid="${id}"]`).click());
  const globalResult = () => container.querySelector('[data-testid="job-result-modal"]');

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    store = configureStore({ reducer: () => ({ auth: { isAuthenticated: true }, user: { preferences: { uiLocale: 'en' } } }) });
    mocks.listRecent.mockResolvedValue([]);
    mocks.getJob.mockResolvedValue({ ...failed, jobStatus: 'running' });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  it('leaves its failure to the dialog, without the global result dialog on top', async () => {
    mocks.run.mockRejectedValue(Object.assign(new Error(failed.error.message), { jobTerminalFailure: true, job: failed }));
    await render();
    await click('run');
    expect(globalResult()).toBeNull();
  });

  it('leaves its success to the dialog as well', async () => {
    mocks.run.mockResolvedValue(done);
    await render();
    await click('run');
    expect(globalResult()).toBeNull();
  });

  it('still shows the global result for a job sent to the background', async () => {
    let fail;
    mocks.run.mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    await render();
    await click('run');
    await click('background');
    await act(async () => fail(Object.assign(new Error(failed.error.message), { jobTerminalFailure: true, job: failed })));
    expect(globalResult()).not.toBeNull();
  });
});
