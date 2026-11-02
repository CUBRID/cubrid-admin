import { copyVolumePathKey } from '@api-interfaces/copy-volume-path';

const isAbsolutePath = (path) => /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(path);

export const joinVolumePath = (directory, name) => {
  const separator = directory.includes('\\') ? '\\' : '/';
  return `${directory.replace(/[\\/]+$/, '')}${separator}${name}`;
};

export function normalizeCopyVolumes(spaceinfo = []) {
  const spaces = spaceinfo.filter(space =>
    ['generic', 'data', 'index', 'temp', 'permanent'].includes(space.type?.toLowerCase())
  );
  // Older CMS versions omit volid and emit volumes in physical order.
  // Only use that order if the entire response uses the legacy format.
  const legacyOrder = spaces.every(space => space.volid == null);
  return spaces.map((space, index) => {
    const name = typeof space.spacename === 'string' ? space.spacename : '';
    const location = typeof space.location === 'string' ? space.location : '';
    const fullPath = isAbsolutePath(name) ? name : location && name ? joinVolumePath(location, name) : '';
    const split = Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\'));
    const id = space.volid;
    return {
      fullPath,
      spacename: fullPath.slice(split + 1),
      location: fullPath.slice(0, split + 1),
      volid: legacyOrder ? index : /^\d+$/.test(String(id)) ? Number(id) : NaN,
    };
  }).sort((a, b) => a.volid - b.volid);
}

export function canCopyIndividualVolumes(volumes) {
  return volumes.length > 0 && volumes.every((volume, index) =>
    volume.volid === index && isAbsolutePath(volume.fullPath) &&
    volume.spacename && volume.newVolumeName?.trim() &&
    !/[\\/]/.test(volume.newVolumeName) && !['.', '..'].includes(volume.newVolumeName) &&
    isAbsolutePath(volume.newLocation || '')
  ) && new Set(volumes.map(volume => copyVolumePathKey(volume.fullPath))).size === volumes.length &&
    new Set(volumes.map(volume => copyVolumePathKey(joinVolumePath(volume.newLocation, volume.newVolumeName)))).size === volumes.length;
}

export function buildCopyVolumeMappings(volumes) {
  // Each array element must have exactly one key: CMS sorts object keys
  // before generating the numbered engine control file, but preserves arrays.
  return volumes.map(volume => ({
    [volume.fullPath]: joinVolumePath(volume.newLocation, volume.newVolumeName),
  }));
}
