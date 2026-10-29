const joinPath = (dir, name, separator) => {
  if (!dir) return name;
  return dir.endsWith('/') || dir.endsWith('\\') ? `${dir}${name}` : `${dir}${separator}${name}`;
};

const separatorOf = (path) => (path && path.includes('\\') ? '\\' : '/');

// Name and directory of a volume from spacedb's spacename/location, which
// are both the full path on CUBRID 11+ and a name plus directory before.
export function splitVolumePath(spacename, location) {
  const full = spacename || '';
  const cut = Math.max(full.lastIndexOf('/'), full.lastIndexOf('\\'));
  if (cut < 0) return { name: full, dir: location || '' };
  return { name: full.slice(cut + 1), dir: full.slice(0, cut) };
}

// Permanent volumes from a volume-info response, in volid order — copydb's
// control file must list every one of them in that order.
export function toCopyVolumes(spaceinfo, defaultPath) {
  const validTypes = ['generic', 'data', 'index', 'temp', 'permanent'];
  return (spaceinfo || [])
    .filter((space) => space.type && validTypes.includes(space.type.toLowerCase()))
    .map((space, index) => {
      const { name, dir } = splitVolumePath(space.spacename, space.location);
      const volid = Number.parseInt(space.volid, 10);
      return {
        volid: Number.isNaN(volid) ? index : volid,
        spacename: name,
        type: space.type,
        location: dir,
        newVolumeName: name,
        newLocation: dir || defaultPath,
        isNameEdited: false,
        isLocationEdited: false,
      };
    })
    .sort((a, b) => a.volid - b.volid);
}

// copydb's `volume` argument: one { source: target } object per volume, in
// volid order. CMS writes each array element as the next control-file line,
// while the keys of a single object would come out sorted by path.
export function buildCopyVolumeList(volumes, destPath) {
  return volumes.map((vol) => {
    const separator = separatorOf(vol.location || destPath || '/');
    const oldPath = joinPath(vol.location || '', vol.spacename, separator);
    const newPath = joinPath(vol.newLocation || destPath, vol.newVolumeName || vol.spacename, separator);
    return { [oldPath]: newPath };
  });
}
