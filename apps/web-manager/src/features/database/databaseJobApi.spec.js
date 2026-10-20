import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseJobApi, pollCmsJob } from './databaseJobApi';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('pollCmsJob result certainty', () => {
  it('preserves a running job when three consecutive status requests fail', async () => {
    const running = { jobId: 'job-1', jobStatus: 'running', dbname: 'demodb' };
    const getJob = vi.spyOn(databaseJobApi, 'getJob')
      .mockResolvedValueOnce(running).mockRejectedValue(new Error('Network unavailable'));
    const failure = pollCmsJob('job-1').promise.catch(error => error);
    await vi.advanceTimersByTimeAsync(6000);
    const error = await failure;
    expect(getJob).toHaveBeenCalledTimes(4);
    expect(error.jobStatusUnavailable).toBe(true);
    expect(error.lastKnownJob).toEqual(running);
    expect(error.job).toBeUndefined();
    expect(error.jobTerminalFailure).toBeUndefined();
  });

  it('identifies an accepted job even when no status response has been received', async () => {
    vi.spyOn(databaseJobApi, 'getJob').mockRejectedValue(new Error('Network unavailable'));
    const failure = pollCmsJob('job-1').promise.catch(error => error);
    await vi.advanceTimersByTimeAsync(4000);
    const error = await failure;
    expect(error.jobStatusUnavailable).toBe(true);
    expect(error.jobId).toBe('job-1');
    expect(error.lastKnownJob).toBeNull();
    expect(error.jobTerminalFailure).toBeUndefined();
  });

  it('reports failure only when the server returns a failed job', async () => {
    const failed = { jobId: 'job-1', jobStatus: 'failed', error: { message: 'Index inconsistency' } };
    vi.spyOn(databaseJobApi, 'getJob').mockResolvedValue(failed);
    const error = await pollCmsJob('job-1').promise.catch(error => error);
    expect(error.jobTerminalFailure).toBe(true);
    expect(error.job).toEqual(failed);
    expect(error.jobStatusUnavailable).toBeUndefined();
  });

  it('can confirm success after a transient status request failure', async () => {
    const succeeded = { jobId: 'job-1', jobStatus: 'succeeded' };
    vi.spyOn(databaseJobApi, 'getJob')
      .mockResolvedValueOnce({ jobId: 'job-1', jobStatus: 'running' })
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(succeeded);
    const result = pollCmsJob('job-1').promise;
    await vi.advanceTimersByTimeAsync(4000);
    expect(await result).toEqual(succeeded);
  });
});
