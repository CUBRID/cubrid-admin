import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../api/apiClient';
import { LOCALE_STORAGE_KEY } from '../../constants/useCM';
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

describe('job status in the UI language', () => {
  afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));

  it('words a job error and its warnings from their codes', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ko');
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      jobId: 'job-1', jobStatus: 'failed', finishedAt: 1,
      error: { message: 'Unable to mount disk volume', code: 'REQUEST_FAILED', type: '/errors/cms/request_failed', cmsNote: 'Unable to mount disk volume', cmsTask: 'backupdb' },
      warnings: ['Database "olddb" was deleted, but cubrid.conf could not be updated.'],
      warningDetails: [{ code: 'DELETE_CONF_NOT_UPDATED', dbname: 'olddb' }],
    });
    const job = await databaseJobApi.getJob('job-1');
    expect(job.error.message).toBe('CMS 작업이 실패했습니다. (Unable to mount disk volume)');
    expect(job.error.cmsTask).toBe('backupdb');
    expect(job.warnings).toEqual(['데이터베이스 "olddb"을(를) 삭제했지만 cubrid.conf를 고치지 못했습니다. [service] server에서 "olddb"을(를) 빼고 [@olddb] 구역을 직접 지우세요.']);
  });
});
