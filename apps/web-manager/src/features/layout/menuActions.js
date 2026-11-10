import { askWorkspaceSwitch, openTab, openWorkspaceExport, showStatusModal } from './layoutSlice';
import {
  openAddHostModal,
  openEditHostModal,
  openServerVersionModal,
  openImportExportModal,
  openCmsUserManagementModal,
} from '../host/hostSlice';
import { isCmsAdminHost } from '../host/cmsAdmin';
import { openUpdateCheck, setAboutCubrid } from './appBarSlice';

/**
 * In-app menu actions shared by the header menu (HeaderMenu) and the desktop
 * app's native menu (main sends the id over `desktop:menu-action`). The id
 * strings must match MENU_ACTION_IDS in apps/desktop/src/menu/application-menu.ts.
 */
export const MENU_ACTIONS = Object.freeze({
  addHost: 'add-host',
  editHost: 'edit-host',
  exportHosts: 'export-hosts',
  importHosts: 'import-hosts',
  switchWorkspace: 'switch-workspace',
  exportWorkspace: 'export-workspace',
  importWorkspace: 'import-workspace',
  serviceDashboard: 'service-dashboard',
  cmsAccountManagement: 'cms-account-management',
  editCubridConfig: 'edit-cubrid-config',
  editBrokerConfig: 'edit-broker-config',
  editCmConfig: 'edit-cm-config',
  checkForUpdates: 'check-for-updates',
  serverVersion: 'server-version',
  about: 'about',
});

const ALL_ACTION_IDS = Object.values(MENU_ACTIONS);

/** Every action disabled. */
export const ALL_MENU_ACTIONS_DISABLED = Object.freeze(
  Object.fromEntries(ALL_ACTION_IDS.map((id) => [id, false]))
);

/**
 * While no dashboard is shown (login, register, workspace setup): only About
 * and Check for Updates, whose modals App renders on every route and which
 * need no host or session. Every other action opens a modal or tab that only
 * exists inside the dashboard.
 */
export const NO_DASHBOARD_MENU_ACTIONS = Object.freeze({
  ...ALL_MENU_ACTIONS_DISABLED,
  [MENU_ACTIONS.checkForUpdates]: true,
  [MENU_ACTIONS.about]: true,
});

/**
 * The host Host Engine Version reads: the one highlighted in the host list,
 * which a click on a host that is not connected moves without selecting it.
 */
export function engineVersionHostUid({ selectedHostUid, highlightedHostUid }) {
  return highlightedHostUid ?? selectedHostUid ?? null;
}

/**
 * The host a header menu item acts on, and whether it is connected: Host
 * Engine Version the highlighted host (engineVersionHostUid), connected only
 * outside the reconnect queue; every other item the selected host. Whether
 * the item is on and the reason shown when it is off both go by it.
 */
export function menuActionHost(id, { selectedHostUid, highlightedHostUid, authorizedHosts = [], reconnectQueue = [] }) {
  if (id === MENU_ACTIONS.serverVersion) {
    const hostUid = engineVersionHostUid({ selectedHostUid, highlightedHostUid });
    return { hostUid, connected: Boolean(hostUid) && authorizedHosts.includes(hostUid) && !reconnectQueue.includes(hostUid) };
  }
  const hostUid = selectedHostUid ?? null;
  return { hostUid, connected: Boolean(hostUid) && authorizedHosts.includes(hostUid) };
}

/** @returns {Record<string, boolean>} enabled flag per action id */
export function getMenuActionEnabled({ selectedHostUid, highlightedHostUid, authorizedHosts = [], reconnectQueue = [], hosts = [] }) {
  const hostState = { selectedHostUid, highlightedHostUid, authorizedHosts, reconnectQueue };
  return {
    [MENU_ACTIONS.addHost]: true,
    [MENU_ACTIONS.editHost]: Boolean(selectedHostUid),
    [MENU_ACTIONS.exportHosts]: true,
    [MENU_ACTIONS.importHosts]: true,
    // Desktop app only; the header shows it only there.
    [MENU_ACTIONS.switchWorkspace]: true,
    [MENU_ACTIONS.exportWorkspace]: true,
    [MENU_ACTIONS.importWorkspace]: true,
    [MENU_ACTIONS.serviceDashboard]: true,
    // Only for the CMS admin account, as in CA (isCmsAdminHost).
    [MENU_ACTIONS.cmsAccountManagement]:
      Boolean(selectedHostUid) && authorizedHosts.includes(selectedHostUid) && isCmsAdminHost(hosts, selectedHostUid),
    // The config editors stay enabled and explain a missing host on click.
    [MENU_ACTIONS.editCubridConfig]: true,
    [MENU_ACTIONS.editBrokerConfig]: true,
    [MENU_ACTIONS.editCmConfig]: true,
    [MENU_ACTIONS.checkForUpdates]: true,
    // Read from the host's CMS, so only for a connected host, and not while
    // it waits to reconnect.
    [MENU_ACTIONS.serverVersion]: menuActionHost(MENU_ACTIONS.serverVersion, hostState).connected,
    [MENU_ACTIONS.about]: true,
  };
}

function openHostTab(dispatch, CM, selectedHostUid, tabId) {
  if (selectedHostUid) {
    dispatch(openTab(tabId));
  } else {
    dispatch(showStatusModal({ type: 'info', title: CM.noHostSelected, message: CM.selectHostHint }));
  }
}

/** The desktop app's workspace page (App.jsx route). */
export const DESKTOP_WORKSPACE_PATH = '/desktop/workspace';

/**
 * Runs one menu action. Callers check the enabled flag first.
 * `navigate` is react-router's, for actions that leave the dashboard.
 * `dirtyTabs` (tabs with unsaved changes) and `anyModalOpen` guard the
 * workspace switch, which leaves the dashboard and drops both.
 * @returns {boolean} false when the id is unknown
 */
export function runMenuAction(id, { dispatch, CM, selectedHostUid, highlightedHostUid, navigate, dirtyTabs = [], anyModalOpen = false }) {
  switch (id) {
    case MENU_ACTIONS.addHost:
      dispatch(openAddHostModal());
      return true;
    case MENU_ACTIONS.editHost:
      dispatch(openEditHostModal(selectedHostUid));
      return true;
    case MENU_ACTIONS.exportHosts:
      dispatch(openImportExportModal('export'));
      return true;
    case MENU_ACTIONS.importHosts:
      dispatch(openImportExportModal('import'));
      return true;
    case MENU_ACTIONS.switchWorkspace:
      // Leaving the dashboard would close an open modal with what it holds.
      if (anyModalOpen) return true;
      // ... and drop unsaved conf edits: ask first (WorkspaceSwitchConfirm).
      if (dirtyTabs.length > 0) {
        dispatch(askWorkspaceSwitch());
        return true;
      }
      navigate(DESKTOP_WORKSPACE_PATH);
      return true;
    // Over the dashboard: nothing is left, so unsaved edits stay.
    case MENU_ACTIONS.exportWorkspace:
      if (anyModalOpen) return true;
      dispatch(openWorkspaceExport());
      return true;
    // Ends in a switch to the imported workspace: the same checks as Switch Workspace.
    case MENU_ACTIONS.importWorkspace:
      if (anyModalOpen) return true;
      if (dirtyTabs.length > 0) {
        dispatch(askWorkspaceSwitch('import'));
        return true;
      }
      navigate(`${DESKTOP_WORKSPACE_PATH}?do=import`);
      return true;
    case MENU_ACTIONS.serviceDashboard:
      dispatch(openTab('service_dashboard'));
      return true;
    case MENU_ACTIONS.cmsAccountManagement:
      dispatch(openCmsUserManagementModal());
      return true;
    case MENU_ACTIONS.editCubridConfig:
      openHostTab(dispatch, CM, selectedHostUid, `edit_config:${selectedHostUid}:cubridconf`);
      return true;
    case MENU_ACTIONS.editBrokerConfig:
      openHostTab(dispatch, CM, selectedHostUid, `broker_config:${selectedHostUid}`);
      return true;
    case MENU_ACTIONS.editCmConfig:
      openHostTab(dispatch, CM, selectedHostUid, `edit_config:${selectedHostUid}:cmconf`);
      return true;
    case MENU_ACTIONS.checkForUpdates:
      dispatch(openUpdateCheck({ source: 'manual' }));
      return true;
    case MENU_ACTIONS.serverVersion:
      dispatch(openServerVersionModal(engineVersionHostUid({ selectedHostUid, highlightedHostUid })));
      return true;
    case MENU_ACTIONS.about:
      dispatch(setAboutCubrid(true));
      return true;
    default:
      return false;
  }
}
