import { describe, expect, it } from 'vitest';
import { getModifiedKeys } from './databasePropertyUtils';

describe('getModifiedKeys', () => {
  it('does not report values loaded from the server as modified', () => {
    const loaded = { max_clients: '100', auto_restart_server: 'no' };

    expect(getModifiedKeys(loaded, { ...loaded })).toEqual([]);
  });

  it('reports edited, added, and removed values', () => {
    const loaded = { max_clients: '100', replication: 'no' };
    const draft = { max_clients: '200', new_parameter: 'yes' };

    expect(getModifiedKeys(loaded, draft)).toEqual([
      'max_clients',
      'replication',
      'new_parameter',
    ]);
  });

  it('clears the change when a value is restored', () => {
    const loaded = { max_clients: '100' };
    const edited = { max_clients: '200' };

    expect(getModifiedKeys(loaded, edited)).toEqual(['max_clients']);
    expect(getModifiedKeys(loaded, { max_clients: '100' })).toEqual([]);
  });
});
