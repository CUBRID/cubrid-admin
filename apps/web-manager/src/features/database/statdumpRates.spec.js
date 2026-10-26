import { describe, expect, it } from 'vitest';
import { computeStatdumpRates } from './statdumpRates';

const dump = (overrides = {}) => ({
  num_tran_commits: '100',
  num_tran_rollbacks: '10',
  num_data_page_fetches: '1000',
  num_data_page_dirties: '200',
  num_file_ioreads: '50',
  num_file_iowrites: '20',
  ...overrides,
});

const allNull = { tps: null, fetchPerSec: null, dirtyPerSec: null, ioReadPerSec: null, ioWritePerSec: null };

describe('computeStatdumpRates', () => {
  it('has no rates on the first sample', () => {
    const { rates, sample } = computeStatdumpRates(undefined, dump(), 10_000);
    expect(rates).toEqual(allNull);
    expect(sample.time).toBe(10_000);
  });

  it('derives per-second rates from the delta over the elapsed time', () => {
    const first = computeStatdumpRates(undefined, dump(), 10_000).sample;
    const { rates } = computeStatdumpRates(first, dump({
      num_tran_commits: '150', // +50
      num_tran_rollbacks: '20', // +10 -> 60 ended transactions
      num_data_page_fetches: '2000',
      num_data_page_dirties: '300',
      num_file_ioreads: '70',
      num_file_iowrites: '40',
    }), 15_000); // 5s later

    expect(rates).toEqual({ tps: 12, fetchPerSec: 200, dirtyPerSec: 20, ioReadPerSec: 4, ioWritePerSec: 4 });
  });

  it('treats a counter that went backwards (server restart) as no rate and rebases on it', () => {
    const first = computeStatdumpRates(undefined, dump(), 10_000).sample;
    const reset = computeStatdumpRates(first, dump({ num_tran_commits: '5', num_tran_rollbacks: '0' }), 15_000);
    expect(reset.rates.tps).toBeNull();
    expect(reset.rates.fetchPerSec).toBe(0);

    const next = computeStatdumpRates(reset.sample, dump({ num_tran_commits: '15', num_tran_rollbacks: '0' }), 20_000);
    expect(next.rates.tps).toBe(2);
  });

  it('gives no rate for a missing or non-numeric counter instead of a fake 0', () => {
    const first = computeStatdumpRates(undefined, dump(), 10_000).sample;
    const { rates } = computeStatdumpRates(first, dump({ num_file_ioreads: undefined, num_file_iowrites: 'n/a' }), 12_000);
    expect(rates.ioReadPerSec).toBeNull();
    expect(rates.ioWritePerSec).toBeNull();
    expect(rates.fetchPerSec).toBe(0);

    expect(computeStatdumpRates(first, {}, 12_000).rates).toEqual(allNull);
    expect(computeStatdumpRates(first, undefined, 12_000).rates).toEqual(allNull);
  });

  it('counts commits alone when statdump has no rollback counter', () => {
    const first = computeStatdumpRates(undefined, dump({ num_tran_rollbacks: undefined }), 10_000).sample;
    const { rates } = computeStatdumpRates(first, dump({ num_tran_commits: '120', num_tran_rollbacks: undefined }), 12_000);
    expect(rates.tps).toBe(10);
  });

  it('keeps the previous sample and rates when polled again within a second', () => {
    const first = computeStatdumpRates(undefined, dump(), 10_000).sample;
    const second = computeStatdumpRates(first, dump({ num_tran_commits: '200' }), 12_000);
    const tooSoon = computeStatdumpRates(second.sample, dump({ num_tran_commits: '900' }), 12_300);
    expect(tooSoon.sample).toBe(second.sample);
    expect(tooSoon.rates).toEqual(second.rates);
  });
});
