import {
  HOST_CONF_CACHE_TTL_MS,
  clearAllHostConfCache,
  clearHostConfCache,
  getCachedHostConf,
  readHostConfCached,
} from './host-conf-cache';

describe('host conf cache', () => {
  let now: number;
  const clock = () => now;

  beforeEach(() => {
    clearAllHostConfCache();
    now = 1_000_000;
  });

  it('keeps a read for the host until it expires, then reads again', async () => {
    const read = jest.fn().mockResolvedValue('replica');
    await expect(readHostConfCached('h1', 'haMode', read, clock)).resolves.toBe('replica');
    await expect(readHostConfCached('h1', 'haMode', read, clock)).resolves.toBe('replica');
    expect(read).toHaveBeenCalledTimes(1);

    now += HOST_CONF_CACHE_TTL_MS;
    await readHostConfCached('h1', 'haMode', read, clock);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('keeps entries per host and per key', async () => {
    await readHostConfCached('h1', 'haMode', async () => 'a', clock);
    await readHostConfCached('h2', 'haMode', async () => 'b', clock);
    await readHostConfCached('h1', 'databasesTxt', async () => 'c', clock);
    expect(getCachedHostConf('h1', 'haMode', now)).toBe('a');
    expect(getCachedHostConf('h2', 'haMode', now)).toBe('b');
    expect(getCachedHostConf('h1', 'databasesTxt', now)).toBe('c');
    clearHostConfCache('h1', now);
    expect(getCachedHostConf('h1', 'haMode', now)).toBeUndefined();
    expect(getCachedHostConf('h2', 'haMode', now)).toBe('b');
  });

  it('keeps nothing from a failed read', async () => {
    const read = jest.fn().mockRejectedValueOnce(new Error('no')).mockResolvedValue('ok');
    await expect(readHostConfCached('h1', 'haMode', read, clock)).rejects.toThrow('no');
    await expect(readHostConfCached('h1', 'haMode', read, clock)).resolves.toBe('ok');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('does not keep a read that started before the host was cleared (a conf saved meanwhile)', async () => {
    let finish: (value: string) => void = () => undefined;
    const pending = readHostConfCached('h1', 'haMode', () => new Promise<string>((resolve) => { finish = resolve; }), clock);
    // The read has started (shareInFlight runs it on the next microtask).
    await Promise.resolve();
    now += 10;
    clearHostConfCache('h1', now);
    finish('old');
    await expect(pending).resolves.toBe('old');
    expect(getCachedHostConf('h1', 'haMode', now)).toBeUndefined();
  });

  it('shares one read between callers that arrive together', async () => {
    const read = jest.fn().mockResolvedValue('v');
    await Promise.all([
      readHostConfCached('h1', 'haMode', read, clock),
      readHostConfCached('h1', 'haMode', read, clock),
    ]);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
