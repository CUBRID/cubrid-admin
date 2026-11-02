import { copyVolumePathKey } from '@api-interfaces/copy-volume-path';
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
    // Sent with '/': CMS makes each target's lob directory from its last '/'
    // before converting the path for Windows.
    expect(buildCopyVolumeMappings(volumes)).toEqual([
      { 'C:/db/source': 'D:/copy/target0' },
      { '//host/volumes/source_x001': 'D:/copy/target1' },
    ]);
  });

  it('keeps a backslash in a non-Windows path as it is', () => {
    const volumes = normalizeCopyVolumes([
      { type: 'PERMANENT', volid: 0, location: '/db/a\\b', spacename: '/db/a\\b/source' },
    ]).map((v) => ({ ...v, newLocation: '/copy', newVolumeName: 'target' }));
    expect(buildCopyVolumeMappings(volumes)).toEqual([{ '/db/a\\b/source': '/copy/target' }]);
  });

  it('refuses a target that is a source volume, its own or another volume\'s', () => {
    const base = normalizeCopyVolumes([
      { type: 'PERMANENT', volid: 0, spacename: '/db/source' },
      { type: 'PERMANENT', volid: 1, spacename: '/db/source_x001' },
    ]);
    const withTargets = (targets) => base.map((v, i) => ({ ...v, newLocation: targets[i][0], newVolumeName: targets[i][1] }));

    expect(canCopyIndividualVolumes(withTargets([['/copy', 'target'], ['/copy', 'target_x001']]))).toBe(true);
    expect(canCopyIndividualVolumes(withTargets([['/db', 'source'], ['/copy', 'target_x001']]))).toBe(false);
    expect(canCopyIndividualVolumes(withTargets([['/db', 'source_x001'], ['/copy', 'target_x001']]))).toBe(false);
    expect(canCopyIndividualVolumes(withTargets([['/copy', 'target'], ['/db/./', 'source']]))).toBe(false);
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

const aliases = [
  ['/copy', '/copy/.'],
  ['/copy', '/copy/sub/..'],
  ['/copy', '//copy///'],
  ['C:\\copy', 'c:/copy/.'],
  ['C:\\copy', 'C:\\COPY\\sub\\..'],
  ['\\\\server\\share\\copy', '\\\\SERVER\\share\\copy\\.'],
];

it.each(aliases)('blocks aliased destination directories: %s and %s', (first, second) => {
  const volumes = ready([
    { type: 'PERMANENT', volid: 0, spacename: '/db/source' },
    { type: 'PERMANENT', volid: 1, spacename: '/db/extra' },
  ]).map((v, i) => ({ ...v, newLocation: i === 0 ? first : second, newVolumeName: 'clone' }));
  expect(canCopyIndividualVolumes(volumes)).toBe(false);
});

it('uses POSIX case and separator rules for POSIX paths', () => {
  expect(copyVolumePathKey('/copy/Clone')).not.toBe(copyVolumePathKey('/copy/clone'));
  expect(copyVolumePathKey('/copy/a\\b')).not.toBe(copyVolumePathKey('/copy/a/b'));
});

it('does not traverse above a drive or UNC share root', () => {
  expect(copyVolumePathKey('C:\\..\\clone')).toBe(copyVolumePathKey('C:\\clone'));
  expect(copyVolumePathKey('\\\\server\\share\\..\\clone')).toBe(copyVolumePathKey('\\\\server\\share\\clone'));
});

it('leaves the actual CMS mapping paths unchanged when comparing aliases', () => {
  const volumes = ready([{ type: 'GENERIC', spacename: 'source', location: '/db' }]);
  volumes[0].newLocation = '/copy/./nested/..';
  expect(canCopyIndividualVolumes(volumes)).toBe(true);
  expect(buildCopyVolumeMappings(volumes)).toEqual([{ '/db/source': '/copy/./nested/../target0' }]);
});
