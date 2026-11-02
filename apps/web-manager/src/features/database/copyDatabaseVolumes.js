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
  const sourceKeys = new Set(volumes.map(volume => copyVolumePathKey(volume.fullPath)));
  const targetKeys = new Set(volumes.map(volume => copyVolumePathKey(joinVolumePath(volume.newLocation, volume.newVolumeName))));
  return volumes.length > 0 && volumes.every((volume, index) =>
    volume.volid === index && isAbsolutePath(volume.fullPath) &&
    volume.spacename && volume.newVolumeName?.trim() &&
    !/[\\/]/.test(volume.newVolumeName) && !['.', '..'].includes(volume.newVolumeName) &&
    isAbsolutePath(volume.newLocation || '')
  ) && sourceKeys.size === volumes.length && targetKeys.size === volumes.length &&
    // copydb formats each target file, removing whatever is there first, so
    // no target may be a source volume (its own or another volume's).
    ![...targetKeys].some(key => sourceKeys.has(key));
}

// CMS (ts_copydb) cuts each target at its last '/' to make the lob directory
// before it turns '/' into '\\' on Windows, so Windows paths go with '/'.
// Other paths are sent as they are: '\\' is an ordinary character there.
const isWindowsPath = (path) => /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
const toCmsPath = (path) => (isWindowsPath(path) ? path.replace(/\\/g, '/') : path);

export function buildCopyVolumeMappings(volumes) {
  // Each array element must have exactly one key: CMS sorts object keys
  // before generating the numbered engine control file, but preserves arrays.
  return volumes.map(volume => ({
    [toCmsPath(volume.fullPath)]: toCmsPath(joinVolumePath(volume.newLocation, volume.newVolumeName)),
  }));
}
