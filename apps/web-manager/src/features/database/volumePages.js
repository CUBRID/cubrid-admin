// CMS gives no free page count for log volumes: freepage comes as a blank
// string and usedpage is left out. Such a count is null here, so the screens
// show "-" instead of reading it as 0, which made a log volume look fully used.

/** A page count ("1,234", "1234 pages", 1234), or null when there is none. */
export function pageCount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  const text = value.toString().trim().replace(/,/g, '').split(/\s+/)[0];
  if (!text) return null;
  const n = parseInt(text, 10);
  return Number.isNaN(n) ? null : n;
}

/** Active or archive log volume (by its CMS type). */
export function isLogVolume(row) {
  const type = (row?.type || '').toString().toUpperCase();
  return type.includes('LOG') || type.includes('ACTIVE') || type.includes('ARCHIVE');
}
