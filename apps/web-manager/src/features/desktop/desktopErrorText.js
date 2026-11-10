// An error from the desktop app's main process, as the settings page shows
// it. Electron puts "Error invoking remote method '<channel>': Error: " before
// the main process's message; the app names its own errors by a code, with
// the OS reason after a colon when there is one.
export function desktopErrorText(err, CM, fallback) {
  const message = String(err?.message ?? '').replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '');
  if (!message) return fallback;
  const [, code, reason] = /^([A-Z_]+)(?:: ([\s\S]*))?$/.exec(message) ?? [];
  const label = code ? CM.desktopErrors?.[code] : undefined;
  if (label === undefined) return CM.desktopFailedWithDetail(fallback, message);
  return reason ? `${label} (${reason})` : label;
}
