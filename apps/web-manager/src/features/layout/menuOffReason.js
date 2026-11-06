/**
 * Why a menu item is off, shown on hover. With several reasons, the one to
 * clear first: no host selected, host not connected, host not logged in with
 * the CMS admin account (`cmsAdmin`), database not logged in, HA, the
 * database's running state (`needs` 'stopped' or 'running', against
 * `dbRunning`), nothing to act on (`noTarget`, the text to show), then a task
 * in progress (`busy`, the text to show). undefined when none of these is why.
 */
export function menuOffReason(CM, {
  hostSelected = true,
  hostConnected = true,
  cmsAdmin = true,
  dbLoggedIn = true,
  haBlocked = false,
  needs,
  dbRunning,
  noTarget,
  busy,
} = {}) {
  if (!hostSelected) return CM.hostSelectRequiredHint;
  if (!hostConnected) return CM.hostConnectRequiredHint;
  if (!cmsAdmin) return CM.cmsAdminRequiredHint;
  if (!dbLoggedIn) return CM.dbLoginRequiredHint;
  if (haBlocked) return CM.manageDatabaseHaDisabledHint;
  if (needs === 'stopped' && dbRunning) return CM.dbStopRequiredHint;
  if (needs === 'running' && !dbRunning) return CM.dbStartRequiredHint;
  return noTarget || busy || undefined;
}
