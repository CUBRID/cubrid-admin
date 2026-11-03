import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../api/apiClient', () => ({ default: {
  defaults: { headers: { common: { Authorization: 'session-a' } } },
  get: vi.fn(),
  post: vi.fn(),
} }));
import apiClient from '../../api/apiClient';
import { databaseApi } from './databaseApi';

describe('volume read coalescing', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    apiClient.defaults.headers.common.Authorization = 'session-a';
  });

  it('shares concurrent reads but fetches again after completion', async () => {
    let resolve;
    apiClient.get.mockImplementation(() => new Promise(r => { resolve = r; }));
    const first = databaseApi.getVolumeInfo('host', 'demodb');
    const second = databaseApi.getVolumeInfo('host', 'demodb');
    expect(first).toBe(second);
    await Promise.resolve();
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    resolve({ spaceinfo: [] });
    await Promise.all([first, second]);
    apiClient.get.mockResolvedValue({ spaceinfo: [] });
    await databaseApi.getVolumeInfo('host', 'demodb');
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it('does not share different databases, hosts, or sessions', async () => {
    apiClient.get.mockResolvedValue({});
    const reads = [databaseApi.getVolumeInfo('host', 'one'), databaseApi.getVolumeInfo('host', 'two'), databaseApi.getVolumeInfo('other', 'one')];
    apiClient.defaults.headers.common.Authorization = 'session-b';
    reads.push(databaseApi.getVolumeInfo('host', 'one'));
    await Promise.all(reads);
    expect(apiClient.get).toHaveBeenCalledTimes(4);
  });

  it('clears failed reads so a later refresh can recover', async () => {
    apiClient.get.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({});
    await expect(databaseApi.getVolumeInfo('host', 'demodb')).rejects.toThrow('timeout');
    await databaseApi.getVolumeInfo('host', 'demodb');
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });
});

describe('bulk database actions', () => {
  it('wait well past the default timeout, since HA databases go one at a time', async () => {
    apiClient.post.mockResolvedValue({});
    await databaseApi.startAllDatabases('host', ['a']);
    await databaseApi.stopAllDatabases('host', ['a']);
    await databaseApi.startWholeService('host');
    await databaseApi.stopWholeService('host');

    expect(apiClient.post).toHaveBeenCalledTimes(4);
    for (const call of apiClient.post.mock.calls) {
      expect(call[2].timeout).toBeGreaterThanOrEqual(10 * 60 * 1000);
    }
  });
});
