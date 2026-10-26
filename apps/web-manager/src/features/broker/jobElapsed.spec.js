import { describe, expect, it } from 'vitest';
import { jobElapsedSeconds, formatElapsed } from './jobElapsed';

describe('jobElapsedSeconds', () => {
  it('subtracts the receive time from the server sample time', () => {
    expect(jobElapsedSeconds('2026/10/26 14:23:45', '14:23:40')).toBe(5);
    expect(jobElapsedSeconds('2026/10/26 14:25:00', '14:23:55')).toBe(65);
    expect(jobElapsedSeconds('2026/10/26 14:23:40', '14:23:40')).toBe(0);
  });

  it('wraps across midnight', () => {
    expect(jobElapsedSeconds('2026/10/27 00:00:03', '23:59:58')).toBe(5);
  });

  it('returns null for missing or unparseable values', () => {
    expect(jobElapsedSeconds(undefined, '14:23:40')).toBeNull();
    expect(jobElapsedSeconds('2026/10/26 14:23:45', '')).toBeNull();
    expect(jobElapsedSeconds('2026/10/26 14:23:45', undefined)).toBeNull();
    expect(jobElapsedSeconds('garbage', '14:23:40')).toBeNull();
    expect(jobElapsedSeconds('2026/10/26 14:23:45', '25:00:00')).toBeNull();
  });
});

describe('formatElapsed', () => {
  it('formats compactly', () => {
    expect(formatElapsed(0)).toBe('0s');
    expect(formatElapsed(5)).toBe('5s');
    expect(formatElapsed(65)).toBe('1m 05s');
    expect(formatElapsed(3725)).toBe('1h 02m 05s');
    expect(formatElapsed(null)).toBeNull();
  });
});
