import { useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCM } from '../../../constants/useCM';
import {
  NO_DASHBOARD_MENU_ACTIONS,
  getMenuActionEnabled,
  runMenuAction,
  MENU_ACTIONS,
} from '../../layout/menuActions';
import { isAnyModalOpen, useAnyModalOpen } from '../../../infrastructure/hooks/useAnyModalOpen';

// Stable fallback for a store without the list, so the selector stays equal.
const NO_HOSTS = [];
const NO_TABS = [];

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
 * modals they open, is shown, only About and Check for Updates stay enabled.
 */
export function useDesktopMenuActions() {
  const CM = useCM();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isAuthenticated = useSelector((state) => state.auth?.isAuthenticated, shallowEqual);
  const { selectedHostUid, highlightedHostUid, authorizedHosts, reconnectQueue, hosts } = useSelector(
    (state) => ({
      selectedHostUid: state.host?.selectedHostUid ?? null,
      highlightedHostUid: state.host?.highlightedHostUid ?? null,
      authorizedHosts: state.host?.authorizedHosts ?? NO_HOSTS,
      reconnectQueue: state.host?.reconnectQueue ?? NO_HOSTS,
      hosts: state.host?.hosts ?? NO_HOSTS,
    }),
    shallowEqual
  );

  const dirtyTabs = useSelector((state) => state.layout?.dirtyTabs ?? NO_TABS, shallowEqual);
  const anyModalOpen = useAnyModalOpen();

  const { pathname } = useLocation();
  const isDashboardShown = isAuthenticated
    && !NO_DASHBOARD_PATHS.includes(pathname.replace(/\/+$/, '') || '/');

  const enabled = isDashboardShown
    ? {
      ...getMenuActionEnabled({ selectedHostUid, highlightedHostUid, authorizedHosts, reconnectQueue, hosts }),
      // Not over an open modal (it would close with what it holds).
      [MENU_ACTIONS.switchWorkspace]: !anyModalOpen,
      [MENU_ACTIONS.exportWorkspace]: !anyModalOpen,
      [MENU_ACTIONS.importWorkspace]: !anyModalOpen,
    }
    : NO_DASHBOARD_MENU_ACTIONS;
  const enabledKey = JSON.stringify(enabled);
  const stableEnabled = useMemo(() => JSON.parse(enabledKey), [enabledKey]);

  const latest = useRef(null);
  latest.current = { dispatch, CM, selectedHostUid, highlightedHostUid, navigate, dirtyTabs, enabled: stableEnabled };

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
      runMenuAction(actionId, { ...ctx, anyModalOpen: isAnyModalOpen() });
    });
  }, []);
}
