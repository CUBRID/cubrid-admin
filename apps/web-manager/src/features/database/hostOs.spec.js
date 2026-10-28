import { describe, expect, it } from 'vitest';
import { isLinuxHost } from './hostOs';

describe('isLinuxHost', () => {
  it('recognises the CMS getenv osinfo for Linux only', () => {
    expect(isLinuxHost('LINUX')).toBe(true);
    expect(isLinuxHost('linux')).toBe(true);
    expect(isLinuxHost('NT')).toBe(false);
    expect(isLinuxHost('SOLARIS')).toBe(false);
    expect(isLinuxHost(undefined)).toBe(false); // unknown keeps the CAS CPU sum
  });
});
