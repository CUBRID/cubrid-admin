import { describe, expect, it } from 'vitest';
import { normalizeCopyVolumes, canCopyIndividualVolumes, buildCopyVolumeMappings } from './copyDatabaseVolumes';

const ready = spaces => normalizeCopyVolumes(spaces).map(v => ({
  ...v, newLocation: '/copy', newVolumeName: `target${v.volid}`,
}));

describe('individual database copy volumes', () => {
  it('normalizes modern full paths and sorts numeric IDs rather than source filenames', () => {
    const volumes = ready([
      { type: 'PERMANENT', volid: '2', spacename: '/a/extra2', location: '/a/extra2' },
      { type: 'PERMANENT', volid: '0', spacename: '/z/source', location: '/z/source' },
      { type: 'PERMANENT', volid: '1', spacename: '/b/extra1', location: '/b/extra1' },
      { type: 'Active_log', spacename: 'source_lgat', location: '/z' },
    ]);
    expect(canCopyIndividualVolumes(volumes)).toBe(true);
    expect(buildCopyVolumeMappings(volumes)).toEqual([
      { '/z/source': '/copy/target0' }, { '/b/extra1': '/copy/target1' }, { '/a/extra2': '/copy/target2' },
    ]);
    expect(volumes[0].spacename).toBe('source');
  });

  it('retains CMS physical order for legacy responses with no volume IDs', () => {
    const volumes = ready([
      { type: 'GENERIC', spacename: 'source', location: '/z/' },
      { type: 'DATA', spacename: 'source_x001', location: '/a' },
    ]);
    expect(canCopyIndividualVolumes(volumes)).toBe(true);
    expect(buildCopyVolumeMappings(volumes)).toEqual([
      { '/z/source': '/copy/target0' }, { '/a/source_x001': '/copy/target1' },
    ]);
  });

  it('supports drive and UNC paths without duplicating filenames', () => {
    const volumes = normalizeCopyVolumes([
      { type: 'PERMANENT', volid: 0, location: 'C:\\db\\source', spacename: 'C:\\db\\source' },
      { type: 'PERMANENT', volid: 1, location: '\\\\host\\volumes', spacename: 'source_x001' },
    ]).map((v, i) => ({ ...v, newLocation: 'D:\\copy\\', newVolumeName: `target${i}` }));
    expect(canCopyIndividualVolumes(volumes)).toBe(true);
    expect(buildCopyVolumeMappings(volumes)).toEqual([
      { 'C:\\db\\source': 'D:\\copy\\target0' },
      { '\\\\host\\volumes\\source_x001': 'D:\\copy\\target1' },
    ]);
  });

  it.each([
    [],
    [{ type: 'PERMANENT', volid: 1, spacename: '/db/source_x001' }],
    [{ type: 'PERMANENT', volid: '', spacename: '/db/source' }],
    [{ type: 'PERMANENT', volid: 0, spacename: 'source' }],
    [{ type: 'PERMANENT', volid: 0, spacename: '/db/source' }, { type: 'PERMANENT', spacename: '/db/extra' }],
    [{ type: 'PERMANENT', volid: 0, spacename: '/db/source' }, { type: 'PERMANENT', volid: 0, spacename: '/db/extra' }],
  ].map(spaces => [spaces]))('rejects incomplete or inconsistent metadata: %j', spaces => {
    expect(canCopyIndividualVolumes(ready(spaces))).toBe(false);
  });

  it('rejects blank, duplicate, and path-like destination names', () => {
    const volumes = ready([{ type: 'GENERIC', location: '/db', spacename: 'source' }]);
    for (const newVolumeName of ['', ' ', '.', '..', '../source', 'dir\\source']) {
      expect(canCopyIndividualVolumes([{ ...volumes[0], newVolumeName }])).toBe(false);
    }
    expect(canCopyIndividualVolumes([{ ...volumes[0], newLocation: '' }])).toBe(false);
    expect(canCopyIndividualVolumes([{ ...volumes[0], newLocation: 'relative' }])).toBe(false);
    expect(canCopyIndividualVolumes([volumes[0], { ...volumes[0], fullPath: '/db/extra', volid: 1 }])).toBe(false);
  });
});
