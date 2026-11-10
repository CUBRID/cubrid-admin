/**
 * Whether a key press asks to re-read the current screen: F5, or Ctrl/Cmd+R
 * without Shift (Shift+Ctrl/Cmd+R reloads the whole page). R is matched by
 * its key position (`code`), as the desktop app's zoom keys are: with the
 * Korean input on, `key` is "ㄱ", not "r".
 */
export function isRefreshViewKey(e) {
  if (e.key === 'F5' || e.code === 'F5') return true;
  return Boolean((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyR');
}
