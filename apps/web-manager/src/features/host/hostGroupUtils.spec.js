import { describe, it, expect } from 'vitest';
import { stripHaRoleTagFromAlias, inferHaNodeType } from './hostGroupUtils';

describe('stripHaRoleTagFromAlias', () => {
  it('strips a trailing (master)/(slave)/(replica) tag', () => {
    expect(stripHaRoleTagFromAlias('myhost (master)')).toBe('myhost');
    expect(stripHaRoleTagFromAlias('myhost (slave)')).toBe('myhost');
    expect(stripHaRoleTagFromAlias('myhost (replica)')).toBe('myhost');
  });

  it('does not touch a user-typed alias with the tag in the middle, not at the end', () => {
    // e.g. "cglee1_(master)_prod" — a genuine user-chosen alias, not an
    // auto-appended tag. Only a real trailing tag should ever be stripped.
    expect(stripHaRoleTagFromAlias('cglee1_(master)_prod')).toBe('cglee1_(master)_prod');
  });

  it('passes through an alias with no tag unchanged', () => {
    expect(stripHaRoleTagFromAlias('plain-host')).toBe('plain-host');
  });
});

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
