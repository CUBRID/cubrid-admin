import { describe, expect, it } from 'vitest';
import { computeBrokerRates, extractBrokerList, mapDiskInfo } from './hostMetrics';

// /broker/list (getbrokersinfo) resolves to [{ broker: [...] }].
const brokers = (...list) => [{ broker: list }];
const b = (name, tran, query) => ({ name, tran: String(tran), query: String(query), port: '30000' });

describe('extractBrokerList', () => {
  it('unwraps the getbrokersinfo envelope', () => {
    expect(extractBrokerList(brokers(b('a', 1, 2)))).toEqual([b('a', 1, 2)]);
    expect(extractBrokerList({ result: [b('a', 1, 2)] })).toEqual([b('a', 1, 2)]);
    expect(extractBrokerList(null)).toEqual([]);
    expect(extractBrokerList([])).toEqual([]);
  });
});

describe('computeBrokerRates', () => {
  it('has no rate on the first sample', () => {
    expect(computeBrokerRates(undefined, brokers(b('a', 100, 500)), 10_000).rates).toEqual({ tps: null, qps: null });
  });

  it('sums per-broker deltas over the elapsed seconds', () => {
    const first = computeBrokerRates(undefined, brokers(b('a', 100, 500), b('b', 10, 50)), 10_000).sample;
    const { rates } = computeBrokerRates(first, brokers(b('a', 140, 600), b('b', 20, 100)), 15_000);
    expect(rates).toEqual({ tps: 10, qps: 30 }); // (40+10)/5, (100+50)/5
  });

  it('skips a broker whose counters went backwards (restart) and one that just appeared', () => {
    const first = computeBrokerRates(undefined, brokers(b('a', 100, 500), b('b', 1000, 5000)), 10_000).sample;
    const { rates, sample } = computeBrokerRates(first, brokers(b('a', 120, 520), b('b', 3, 7), b('c', 999, 999)), 12_000);
    expect(rates).toEqual({ tps: 10, qps: 10 });

    // The restarted broker counts again from its new baseline next time.
    const next = computeBrokerRates(sample, brokers(b('a', 120, 520), b('b', 13, 17), b('c', 1003, 1003)), 14_000);
    expect(next.rates).toEqual({ tps: 7, qps: 7 }); // (0+10+4)/2
  });

  it('has no rate when no broker can be compared, but 0 when the host has no brokers', () => {
    const first = computeBrokerRates(undefined, brokers(b('a', 100, 500)), 10_000).sample;
    expect(computeBrokerRates(first, brokers(b('z', 1, 1)), 12_000).rates).toEqual({ tps: null, qps: null });
    expect(computeBrokerRates(first, brokers(), 12_000).rates).toEqual({ tps: 0, qps: 0 });
  });

  it('ignores a missing counter instead of treating it as 0', () => {
    const first = computeBrokerRates(undefined, brokers(b('a', 100, 500)), 10_000).sample;
    const { rates } = computeBrokerRates(first, brokers({ name: 'a', tran: '110' }), 12_000);
    expect(rates).toEqual({ tps: 5, qps: null });
  });

  it('keeps the previous sample when polled again within a second', () => {
    const first = computeBrokerRates(undefined, brokers(b('a', 100, 500)), 10_000).sample;
    const second = computeBrokerRates(first, brokers(b('a', 110, 510)), 12_000);
    const tooSoon = computeBrokerRates(second.sample, brokers(b('a', 900, 900)), 12_200);
    expect(tooSoon.sample).toBe(second.sample);
    expect(tooSoon.rates).toEqual(second.rates);
  });
});

describe('mapDiskInfo', () => {
  it('maps the Linux root filesystem entry to used/total/pct', () => {
    expect(mapDiskInfo({ disk_info: [{ name: '/', total_size: '1000', free_size: '250' }] }))
      .toEqual({ total: 1000, used: 750, pct: 75, names: ['/'] });
  });

  it('sums Windows drives', () => {
    expect(mapDiskInfo({ disk_info: [
      { name: 'C:', total_size: '1000', free_size: '500' },
      { name: 'D:', total_size: '3000', free_size: '1500' },
    ] })).toEqual({ total: 4000, used: 2000, pct: 50, names: ['C:', 'D:'] });
  });

  it('returns null when there is nothing usable', () => {
    expect(mapDiskInfo(undefined)).toBeNull();
    expect(mapDiskInfo({ disk_info: [] })).toBeNull();
    expect(mapDiskInfo({ disk_info: [{ name: '/', total_size: '0', free_size: '0' }] })).toBeNull();
    expect(mapDiskInfo({ disk_info: [{ name: '/', total_size: 'x', free_size: '1' }] })).toBeNull();
  });
});
