import { describe, expect, it } from 'vitest';
import { unloadClassFlags } from './unloadClassFlags';

describe('unloadClassFlags', () => {
  it('chosen tables with referenced tables: -ir without --input-class-only', () => {
    expect(unloadClassFlags({ schemaScope: 'selected', includeReferencedTables: true })).toEqual({ ref: 'yes', classonly: 'no' });
  });

  it('chosen tables only: --input-class-only', () => {
    expect(unloadClassFlags({ schemaScope: 'selected', includeReferencedTables: false })).toEqual({ ref: 'no', classonly: 'yes' });
  });

  it('every table, or data only, as before', () => {
    expect(unloadClassFlags({ schemaScope: 'all', includeReferencedTables: true })).toEqual({ ref: 'no', classonly: 'no' });
    expect(unloadClassFlags({ schemaScope: 'none', includeReferencedTables: true })).toEqual({ ref: 'no', classonly: 'yes' });
  });
});
