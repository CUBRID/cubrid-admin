import { describe, expect, it, vi } from 'vitest';
// Avoids apiClient.js's top-level `localStorage.getItem('token')` read, which
// this test's minimal jsdom setup doesn't need to exercise.
vi.mock('../../api/apiClient', () => ({ default: {
  defaults: { headers: { common: {} } },
  get: vi.fn(),
  post: vi.fn(),
} }));
import { enqueueUniqueJobResult } from './CmsJobContext';

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
