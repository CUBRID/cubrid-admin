import { describe, it, expect } from 'vitest';
import { inferHaNodeType } from './hostGroupUtils';

describe('inferHaNodeType', () => {
  it('reads the role from live haInfo', () => {
    expect(inferHaNodeType({ alias: 'anything' }, { isHA: true, currentNodeType: 'master' })).toBe('master');
  });

  it('never infers a role from the alias text, even one that looks tagged', () => {
    // This is the regression this function exists to prevent: a host whose
    // real, user-typed alias happens to contain "(master)" must not be
    // reported as HA just because of that text — HA role must come only
    // from live haInfo.
    expect(inferHaNodeType({ alias: 'cglee1_(master)' }, undefined)).toBeNull();
    expect(inferHaNodeType({ alias: 'cglee1_(master)' }, { isHA: false })).toBeNull();
  });

  it('returns null when haInfo has no usable role', () => {
    expect(inferHaNodeType({ alias: 'plain-host' }, { isHA: true, currentNodeType: 'unknown-role' })).toBeNull();
  });
});
