import { useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { useCM } from '../../../constants/useCM';
import {
  NO_DASHBOARD_MENU_ACTIONS,
  getMenuActionEnabled,
  runMenuAction,
} from '../../layout/menuActions';

// App routes rendered without DashboardLayout (see App.jsx). A stored token
// keeps isAuthenticated true on /login too, e.g. after the desktop app
// crashed, since main always opens /login on startup.
const NO_DASHBOARD_PATHS = ['/', '/login', '/register', '/desktop/workspace'];

/**
 * Wires the desktop app's native menu to the same actions as the header menu:
 * reports which actions are enabled (only when that changes) and runs the
 * action main sends on a native menu click. No-op outside the desktop app.
 *
 * Mounted in App rather than in HeaderMenu so a full reload (logout, View >
 * Reload) re-reports the state; whenever no dashboard, and so none of the
 * modals they open, is shown, only About stays enabled.
 */
export function useDesktopMenuActions() {
  const CM = useCM();
  const dispatch = useDispatch();
  const isAuthenticated = useSelector((state) => state.auth?.isAuthenticated, shallowEqual);
  const { selectedHostUid, authorizedHosts } = useSelector(
    (state) => ({
      selectedHostUid: state.host?.selectedHostUid ?? null,
      authorizedHosts: state.host?.authorizedHosts ?? [],
    }),
    shallowEqual
  );

  const { pathname } = useLocation();
  const isDashboardShown = isAuthenticated
    && !NO_DASHBOARD_PATHS.includes(pathname.replace(/\/+$/, '') || '/');

  const enabled = isDashboardShown
    ? getMenuActionEnabled({ selectedHostUid, authorizedHosts })
    : NO_DASHBOARD_MENU_ACTIONS;
  const enabledKey = JSON.stringify(enabled);
  const stableEnabled = useMemo(() => JSON.parse(enabledKey), [enabledKey]);

  const latest = useRef(null);
  latest.current = { dispatch, CM, selectedHostUid, enabled: stableEnabled };

  useEffect(() => {
    const setMenuState = window.desktopBridge?.setMenuState;
    if (!setMenuState) return;
    Promise.resolve(setMenuState(stableEnabled)).catch(() => {
      // The native menu is a convenience; a failed update must not surface in the UI.
    });
  }, [stableEnabled]);

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (!onMenuAction) return undefined;
    return onMenuAction((actionId) => {
      const ctx = latest.current;
      // Main may still show the previous menu for a moment after a state change.
      if (!ctx.enabled[actionId]) return;
      runMenuAction(actionId, ctx);
    });
  }, []);
}
