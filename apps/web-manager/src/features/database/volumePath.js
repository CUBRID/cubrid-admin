export const isAbsolutePath = (path) => /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(path);

// Index of the last '/' or '\\' in a path, -1 when there is none.
export const lastPathSeparator = (path) => Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));

// Folder part of a file path, keeping a root as it is: '/a' -> '/',
// 'C:\\a' -> 'C:\\'. Empty when the path has no separator.
export function parentDirectory(path) {
  const cut = lastPathSeparator(path);
  if (cut < 0) return '';
  const head = path.slice(0, cut);
  return head === '' || /^[A-Za-z]:$/.test(head) ? path.slice(0, cut + 1) : head;
}

// Folder a volume lives in, for display. CMS dbspaceinfo sends:
// - CUBRID 10+ data volumes: location = spacename = the file's full path;
// - log volumes and the 9.x format: location = folder, spacename = file name.
// As in normalizeCopyVolumes, a full-path spacename is the file itself, and a
// bare one means location is already the folder (the default layout puts
// volume 'testdb' in folder '.../testdb', so location is never cut then).
export function volumeDirectory(space) {
  const name = typeof space?.spacename === 'string' ? space.spacename : '';
  if (isAbsolutePath(name)) return parentDirectory(name);
  return typeof space?.location === 'string' ? space.location : '';
}
