/**
 * Lexical comparison key for a volume path on the CMS host. Do not use the
 * API server's OS rules: a Linux API server can manage Windows databases.
 * This does not resolve filesystem links or change the path sent to CMS.
 */
export function copyVolumePathKey(path: string): string {
  const windows = /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
  const value = windows ? path.replace(/\\/g, '/') : path;
  let root = '';
  let remainder = value;
  if (windows && /^[A-Za-z]:\//.test(value)) {
    root = value.slice(0, 3);
    remainder = value.slice(3);
  } else if (windows && value.startsWith('//')) {
    const parts = value.slice(2).split('/').filter(Boolean);
    // A UNC share is the root; '..' cannot remove its server/share name.
    root = `//${parts.slice(0, 2).join('/')}/`;
    remainder = parts.slice(2).join('/');
  } else if (value.startsWith('/')) {
    root = '/';
    remainder = value.slice(1);
  }
  const parts: string[] = [];
  for (const part of remainder.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length && parts[parts.length - 1] !== '..') parts.pop();
      else if (!root) parts.push(part);
    } else {
      parts.push(part);
    }
  }
  const key = root + parts.join('/');
  return windows ? key.toLowerCase() : key;
}
