import { describe, expect, it } from 'vitest';
import { parseXaslCacheStats, xaslCacheHitRatio } from './planDumpStats';

// Shape of xcache_dump + fpcache_dump output (CUBRID 11.4), as plandump returns it.
const dump = [
  '',
  'XASL cache',
  'Stats: ',
  'Current entry count:        12',
  'Lookups:                    2698',
  'Hits:                       2650',
  'Miss:                       48',
  'Inserts:                    48',
  'Deletes at cleanup:\t    0',
  '',
  'XASL Cache Memory Info:',
  '  Memory Hard Limit:           64.00 MB',
  '',
  'Entries:',
  '  sql info: ',
  '    SQL_ID = 5b8b3c2a1d0e9 ',
  '',
  'Filter predicate cache',
  'Stats: ',
  'Max size:                   1000',
  'Lookups:                    0',
  'Entry Hits:                 0',
  'Entry Miss:                 0',
];

describe('parseXaslCacheStats', () => {
  it('reads only the XASL cache counters, not the filter predicate cache ones', () => {
    const stats = parseXaslCacheStats(dump);
    expect(stats.Lookups).toBe('2698');
    expect(stats.Hits).toBe('2650');
    expect(stats.Miss).toBe('48');
    expect(stats['Deletes at cleanup']).toBe('0');
    expect(stats['Max size']).toBeUndefined();
    expect(xaslCacheHitRatio(stats)).toBe('98.2');
  });

  it('stops at the end of the counters even without blank lines', () => {
    const stats = parseXaslCacheStats(dump.filter(Boolean));
    expect(stats.Lookups).toBe('2698');
    expect(stats['Max size']).toBeUndefined();
  });

  it('gives no ratio when the cache is disabled or has no lookups yet', () => {
    expect(parseXaslCacheStats(['', 'XASL cache is disabled.'])).toEqual({});
    expect(xaslCacheHitRatio({})).toBeNull();
    expect(xaslCacheHitRatio({ Lookups: '0', Hits: '0' })).toBeNull();
  });
});
