import { describe, expect, it } from 'vitest';
import { compactLogLines, parseCompactLog } from './compactLogParse';

// The shape a verbose compact job result came back in on a real host.
const log = [{
  line: [
    '', 'Pass 1', '',
    'Class dba.t1', 'Total objects: 120', 'Failed objects: 0', 'Modified objects: 3', 'Big objects: 0',
    'Class dba.t2', 'Total objects: 8', 'Failed objects: 2', 'Modified objects: 0', 'Big objects: 1',
    '', 'Pass 2', '',
    'Class dba.t1', 'Reclaiming of OIDs and pages skipped.',
    'Class dba.t2', 'The unused class OIDs and pages have been reclaimed.',
    '', 'Pass 3', '',
    'Class dba.t1', 'Heap compact succeeded...',
    'Class dba.t2', 'Heap compact failed...',
  ],
}];

describe('parseCompactLog', () => {
  it('splits verbose compact output into per-class rows for each pass', () => {
    const { passes, notes } = parseCompactLog(compactLogLines(log));
    expect(passes[1]).toEqual([
      { name: 'dba.t1', messages: [], total: 120, failed: 0, modified: 3, big: 0 },
      { name: 'dba.t2', messages: [], total: 8, failed: 2, modified: 0, big: 1 },
    ]);
    expect(passes[2].map((r) => [r.name, r.messages])).toEqual([
      ['dba.t1', ['Reclaiming of OIDs and pages skipped.']],
      ['dba.t2', ['The unused class OIDs and pages have been reclaimed.']],
    ]);
    expect(passes[3].map((r) => r.messages[0])).toEqual(['Heap compact succeeded...', 'Heap compact failed...']);
    expect(notes).toEqual([]);
  });

  it('keeps error lines with their class and lines outside any class as notes', () => {
    const { passes, notes } = parseCompactLog([
      'Pass 1', 'Nothing to process...', 'Class dba.t3', 'Locked class... Incomplete processing...', 'Total objects: 0',
    ]);
    expect(passes[1][0]).toEqual({ name: 'dba.t3', messages: ['Locked class... Incomplete processing...'], total: 0 });
    expect(notes).toEqual(['Nothing to process...']);
  });

  it('gives null for output that names no class, and reads a plain string log', () => {
    expect(parseCompactLog(compactLogLines(''))).toBeNull();
    expect(parseCompactLog(compactLogLines(undefined))).toBeNull();
    expect(parseCompactLog(compactLogLines('Pass 1\nClass a\nTotal objects: 1'))?.passes[1]).toEqual([{ name: 'a', messages: [], total: 1 }]);
  });
});
