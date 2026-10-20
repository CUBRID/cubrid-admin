/**
 * Formatting utilities for CUBRID Web Manager
 */

/**
 * Format bytes to human readable size
 * @param {number} bytes 
 * @param {number} decimals 
 * @returns {string}
 */
export const formatSize = (bytes, decimals = 2) => {
  // CMS numeric fields (dbinfo.used_size/free_size/total_size, etc.) arrive as
  // JSON strings, e.g. "0". `!"0"` and `"0" === 0` are both false, so the old
  // falsy/zero guard let string "0" slip through into Math.log(0) = -Infinity,
  // cascading to NaN. Coerce first so the guard actually sees the real value.
  //
  // (upstream/develop's independent fix for the same bug declared `num` only
  // inside the string branch, then referenced it unconditionally below —
  // ReferenceError for any plain-number input. Kept this version instead.)
  const num = typeof bytes === 'string' ? parseFloat(bytes) : bytes;
  if (!num || isNaN(num) || num <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(num) / Math.log(k));
  return `${parseFloat((num / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

/**
 * Format page-based size to human readable size
 * @param {number} pages 
 * @param {number} pageSize 
 * @returns {string}
 */
export const formatPagesToSize = (pages, pageSize) => {
  if (!pages || !pageSize) return '0 B';
  return formatSize(pages * pageSize);
};

/**
 * Format storage free space (KB to human readable)
 * @param {number|string} kb 
 * @returns {string}
 */
export const formatKBToSize = (kb) => {
  const val = typeof kb === 'string' ? parseInt(kb) : kb;
  if (isNaN(val)) return '—';
  return formatSize(val * 1024);
};

/**
 * Simple MB to GB/MB formatter
 * @param {number} mb 
 * @returns {string}
 */
export const formatMBToSize = (mb) => {
  if (!mb) return '0 MB';
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
};
