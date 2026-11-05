/**
 * Why a menu item is off, shown on hover: the host is not connected, or the
 * database is not logged in. An item HA cannot do says so once the database
 * is logged in. undefined when none of these is why.
 */
export function menuOffReason(CM, { hostConnected = true, dbLoggedIn = true, haBlocked = false } = {}) {
  if (!hostConnected) return CM.hostConnectRequiredHint;
  if (!dbLoggedIn) return CM.dbLoginRequiredHint;
  return haBlocked ? CM.manageDatabaseHaDisabledHint : undefined;
}
