import { describe, expect, it } from 'vitest';
import { isCasBusy, isCasIdle, totalCasQps } from './casMetrics';

describe('CAS status', () => {
  it('counts IDLE as free, and BUSY, CLIENT WAIT and CLOSE WAIT as held, as the engine does; RESTART as neither', () => {
    const statuses = ['IDLE', 'BUSY', 'CLIENT WAIT', 'CLOSE WAIT', 'RESTART'];
    expect(statuses.filter(isCasIdle)).toEqual(['IDLE']);
    expect(statuses.filter(isCasBusy)).toEqual(['BUSY', 'CLIENT WAIT', 'CLOSE WAIT']);
  });
});

describe('totalCasQps', () => {
  it('adds up the CASes\' rates without dropping the fractions', () => {
    expect(totalCasQps([0.8, 0.8, 0.8, 0.8, 0.8].map((qps) => ({ qps })))).toBeCloseTo(4);
    expect(totalCasQps([{ qps: 11.8 }, { qps: 1.7 }, { qps: null }])).toBeCloseTo(13.5);
  });

  it('is null until some CAS has a rate', () => {
    expect(totalCasQps([{ qps: null }])).toBeNull();
    expect(totalCasQps([])).toBeNull();
  });
});
