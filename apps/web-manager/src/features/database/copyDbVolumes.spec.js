import { describe, expect, it } from 'vitest';
import { buildCopyVolumeList, splitVolumePath, toCopyVolumes } from './copyDbVolumes';

describe('splitVolumePath', () => {
  it('splits the full path CUBRID 11+ gives in spacename', () => {
    expect(splitVolumePath('/db/testdb/testdb_x001', '/db/testdb/testdb_x001')).toEqual({
      name: 'testdb_x001',
      dir: '/db/testdb',
    });
  });

  it('keeps a bare name and its separate directory from older versions', () => {
    expect(splitVolumePath('testdb_x001', '/db/testdb')).toEqual({ name: 'testdb_x001', dir: '/db/testdb' });
  });
});

describe('copydb volume list', () => {
  // CUBRID 11.4 volume-info: full paths, a volume added in another directory,
  // and a temporary volume that copydb does not copy.
  const spaceinfo = [
    { type: 'PERMANENT', purpose: 'PERMANENT', volid: '0', spacename: '/home/cubrid/db/testdb/testdb', location: '/home/cubrid/db/testdb/testdb' },
    { type: 'PERMANENT', purpose: 'TEMPORARY', volid: '2', spacename: '/data/ext/testdb_x002', location: '/data/ext/testdb_x002' },
    { type: 'PERMANENT', purpose: 'PERMANENT', volid: '1', spacename: '/home/cubrid/db/testdb/testdb_x001', location: '/home/cubrid/db/testdb/testdb_x001' },
    { type: 'TEMPORARY', purpose: 'TEMPORARY', volid: '32766', spacename: '/home/cubrid/db/testdb/testdb_t32766', location: '/home/cubrid/db/testdb/testdb_t32766' },
    { type: 'Active_log', spacename: 'testdb_lgat', location: '/home/cubrid/db/testdb' },
  ];

  it('lists every permanent volume in volid order with its real path', () => {
    const volumes = toCopyVolumes(spaceinfo, '/home/cubrid/db/copydb');

    expect(volumes.map((v) => [v.volid, v.location, v.spacename])).toEqual([
      [0, '/home/cubrid/db/testdb', 'testdb'],
      [1, '/home/cubrid/db/testdb', 'testdb_x001'],
      [2, '/data/ext', 'testdb_x002'],
    ]);
  });

  it('sends one source -> target pair per volume, in volid order', () => {
    const volumes = toCopyVolumes(spaceinfo, '/home/cubrid/db/copydb').map((v) => ({
      ...v,
      newLocation: '/home/cubrid/db/copydb',
      newVolumeName: v.volid === 0 ? 'copydb' : `copydb_x${String(v.volid).padStart(3, '0')}`,
    }));

    expect(buildCopyVolumeList(volumes, '/home/cubrid/db/copydb')).toEqual([
      { '/home/cubrid/db/testdb/testdb': '/home/cubrid/db/copydb/copydb' },
      { '/home/cubrid/db/testdb/testdb_x001': '/home/cubrid/db/copydb/copydb_x001' },
      { '/data/ext/testdb_x002': '/home/cubrid/db/copydb/copydb_x002' },
    ]);
  });
});
