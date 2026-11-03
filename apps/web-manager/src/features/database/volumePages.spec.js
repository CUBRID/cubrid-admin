import { describe, expect, it } from 'vitest';
import { isLogVolume, pageCount } from './volumePages';

describe('pageCount', () => {
  it('reads plain, comma-grouped and "N pages" counts', () => {
    expect(pageCount('8192')).toBe(8192);
    expect(pageCount('3,904 pages')).toBe(3904);
    expect(pageCount(' 0 ')).toBe(0);
    expect(pageCount(12)).toBe(12);
  });

  it('is null when there is no count, as CMS sends it for log volumes', () => {
    expect(pageCount(' ')).toBeNull();
    expect(pageCount('')).toBeNull();
    expect(pageCount('-')).toBeNull();
    expect(pageCount(undefined)).toBeNull();
  });
});

describe('isLogVolume', () => {
  it('tells active and archive logs from data volumes', () => {
    expect(isLogVolume({ type: 'Active_log' })).toBe(true);
    expect(isLogVolume({ type: 'ARCHIVE_LOG' })).toBe(true);
    expect(isLogVolume({ type: 'PERMANENT' })).toBe(false);
  });
});
