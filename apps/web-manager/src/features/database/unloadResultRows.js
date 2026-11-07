// unloaddb's per-table result reads like "1234 (100%/38%)": the rows
// unloaded, then a fixed 100% and how far the whole unload was when the table
// finished. Only the row count says something about the table; anything that
// doesn't start with a number is shown as given.
export function unloadRowCount(stats) {
  const match = /^\s*(\d+)/.exec(String(stats ?? ''));
  return match ? match[1] : stats;
}

// When some objects fail, unloaddb ends with "Only N out of M objects dumped
// successfully." (utils.msg set 13, 46). CMS reads its log lines as
// "name x count pct x pct", so that sentence arrives as a row of its own:
// Only: "out of/objects", or with the Korean catalog N: "객체가 (전체/객체)".
export function isPartialUnloadRow(name, stats) {
  const value = String(stats ?? '');
  return (name === 'Only' && value.startsWith('out of/'))
    || (/^\d+$/.test(name) && value.startsWith('객체가 (전체/'));
}
