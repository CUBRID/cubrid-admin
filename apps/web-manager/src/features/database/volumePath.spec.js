import { describe, expect, it } from 'vitest';
import { parentDirectory, volumeDirectory } from './volumePath';

describe('volumeDirectory', () => {
  it('cuts the file name from a CUBRID 10+ data volume (location = spacename = full path)', () => {
    expect(volumeDirectory({ spacename: '/db/testdb/testdb', location: '/db/testdb/testdb' })).toBe('/db/testdb');
    expect(volumeDirectory({ spacename: '/db/testdb/testdb_x001', location: '/db/testdb/testdb_x001' })).toBe('/db/testdb');
  });

  it('takes the folder from a full-path spacename whatever location holds', () => {
    expect(volumeDirectory({ spacename: '/db/testdb/testdb', location: '/db/testdb' })).toBe('/db/testdb');
    expect(volumeDirectory({ spacename: '/db/testdb/testdb', location: '/db/testdb/' })).toBe('/db/testdb');
    expect(volumeDirectory({ spacename: '/db/testdb/testdb' })).toBe('/db/testdb');
  });

  it('keeps a log volume folder (spacename = file name, location = folder)', () => {
    expect(volumeDirectory({ spacename: 'testdb_lgat', location: '/db/testdb/log' })).toBe('/db/testdb/log');
  });

  it('keeps the 9.x format folder, even when the folder is named like the volume', () => {
    expect(volumeDirectory({ spacename: 'testdb', location: '/db/testdb' })).toBe('/db/testdb');
    expect(volumeDirectory({ spacename: 'testdb_x001', location: '/db/testdb' })).toBe('/db/testdb');
  });

  it('handles Windows paths', () => {
    expect(volumeDirectory({ spacename: 'C:\\CUBRID\\databases\\testdb\\testdb', location: 'C:\\CUBRID\\databases\\testdb\\testdb' }))
      .toBe('C:\\CUBRID\\databases\\testdb');
    expect(volumeDirectory({ spacename: 'C:/CUBRID/databases/testdb/testdb', location: 'C:/CUBRID/databases/testdb/testdb' }))
      .toBe('C:/CUBRID/databases/testdb');
    expect(volumeDirectory({ spacename: 'testdb_lgat', location: 'C:\\CUBRID\\databases\\testdb\\log' }))
      .toBe('C:\\CUBRID\\databases\\testdb\\log');
    expect(volumeDirectory({ spacename: '\\\\srv\\share\\testdb', location: '\\\\srv\\share\\testdb' })).toBe('\\\\srv\\share');
  });

  it('keeps the root for a file directly under it', () => {
    expect(volumeDirectory({ spacename: '/testdb', location: '/testdb' })).toBe('/');
    expect(volumeDirectory({ spacename: 'C:\\testdb', location: 'C:\\testdb' })).toBe('C:\\');
    expect(volumeDirectory({ spacename: 'C:/testdb', location: 'C:/testdb' })).toBe('C:/');
  });

  it('returns location as it is, or empty, when a field is missing', () => {
    expect(volumeDirectory({ spacename: '', location: '' })).toBe('');
    expect(volumeDirectory({ location: '/db/testdb' })).toBe('/db/testdb');
    expect(volumeDirectory(undefined)).toBe('');
  });
});

describe('parentDirectory', () => {
  it('returns the folder part and keeps roots', () => {
    expect(parentDirectory('/a/b')).toBe('/a');
    expect(parentDirectory('/a')).toBe('/');
    expect(parentDirectory('C:\\a')).toBe('C:\\');
    expect(parentDirectory('a')).toBe('');
  });
});
