import { describe, expect, it, vi } from 'vitest';
import { createSharedReads } from './singleFlight';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('createSharedReads', () => {
  it('lets reads of the same key share the request in flight', async () => {
    const read = createSharedReads();
    const gate = deferred();
    const run = vi.fn(() => gate.promise);

    const a = read('k', run);
    const b = read('k', run);
    gate.resolve('v1');

    const [ra, rb] = await Promise.all([a, b]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(ra).toEqual(rb);
    expect(ra.value).toBe('v1');
  });

  it('keeps different keys apart', async () => {
    const read = createSharedReads();
    const run = vi.fn(async (seq) => seq);
    await Promise.all([read('a', run), read('b', run)]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('sends a fresh read after the one in flight, shared by every fresh read meanwhile', async () => {
    const read = createSharedReads();
    const first = deferred();
    const calls = [];
    const run = vi.fn((seq) => { calls.push(seq); return calls.length === 1 ? first.promise : Promise.resolve('v2'); });

    const plain = read('k', run);
    const fresh1 = read('k', run, { fresh: true });
    const fresh2 = read('k', run, { fresh: true });
    expect(fresh1).toBe(fresh2);
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);

    first.resolve('v1');
    const [p, f] = await Promise.all([plain, fresh1]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(p.value).toBe('v1');
    expect(f.value).toBe('v2');
    expect(f.seq).toBeGreaterThan(p.seq);
  });

  it('lets a plain read join the queued request once the first settles', async () => {
    const read = createSharedReads();
    const first = deferred();
    const second = deferred();
    const run = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    read('k', run);
    const fresh = read('k', run, { fresh: true });
    first.resolve('v1');
    await new Promise((r) => setTimeout(r, 0));

    const late = read('k', run);
    second.resolve('v2');
    expect((await late).value).toBe('v2');
    expect((await fresh).value).toBe('v2');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('gives every reader the same failure and still sends the queued read', async () => {
    const read = createSharedReads();
    const run = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('v2');

    const a = read('k', run);
    const b = read('k', run);
    const fresh = read('k', run, { fresh: true });

    await expect(a).rejects.toThrow('down');
    await expect(b).rejects.toThrow('down');
    expect((await fresh).value).toBe('v2');
  });

  it('starts a new request once everything has settled', async () => {
    const read = createSharedReads();
    const run = vi.fn(async () => 'v');
    await read('k', run);
    await read('k', run);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
