import { describe, expect, it, vi } from 'vitest';
import { fetchAllEntries, MAX_PAGE_SIZE } from './fetchAllEntries';

const pages = (total) =>
  vi.fn(async ({ limit, offset }) => ({
    total,
    entries: Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => offset + i),
  }));

describe('fetchAllEntries', () => {
  it('reads every page past the server page size, with the filter on each', async () => {
    const query = pages(MAX_PAGE_SIZE * 2 + 7);
    const entries = await fetchAllEntries(query, { user: 'alice' });
    expect(entries).toHaveLength(MAX_PAGE_SIZE * 2 + 7);
    expect(entries.at(-1)).toBe(MAX_PAGE_SIZE * 2 + 6);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.map(([f]) => f.offset)).toEqual([0, MAX_PAGE_SIZE, MAX_PAGE_SIZE * 2]);
    expect(query.mock.calls.every(([f]) => f.user === 'alice')).toBe(true);
  });

  it('asks once when everything fits on one page', async () => {
    const query = pages(3);
    await expect(fetchAllEntries(query, {})).resolves.toEqual([0, 1, 2]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('stops on an empty page even if the total says more', async () => {
    const query = vi.fn(async () => ({ total: 99, entries: [] }));
    await expect(fetchAllEntries(query, {})).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
