import { openTab, showStatusModal } from './layoutSlice';
import {
  openAddHostModal,
  openEditHostModal,
  openServerVersionModal,
  openImportExportModal,
  openCmsUserManagementModal,
} from '../host/hostSlice';
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

/** @returns {Record<string, boolean>} enabled flag per action id */
export function getMenuActionEnabled({ selectedHostUid, authorizedHosts = [] }) {
  return {
    [MENU_ACTIONS.addHost]: true,
    [MENU_ACTIONS.editHost]: Boolean(selectedHostUid),
    [MENU_ACTIONS.exportHosts]: true,
    [MENU_ACTIONS.importHosts]: true,
    [MENU_ACTIONS.serviceDashboard]: true,
    [MENU_ACTIONS.cmsAccountManagement]:
      Boolean(selectedHostUid) && authorizedHosts.includes(selectedHostUid),
    // The config editors stay enabled and explain a missing host on click.
    [MENU_ACTIONS.editCubridConfig]: true,
    [MENU_ACTIONS.editBrokerConfig]: true,
    [MENU_ACTIONS.editCmConfig]: true,
    [MENU_ACTIONS.checkForUpdates]: true,
    [MENU_ACTIONS.serverVersion]: Boolean(selectedHostUid),
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

/**
 * Runs one menu action. Callers check the enabled flag first.
 * @returns {boolean} false when the id is unknown
 */
export function runMenuAction(id, { dispatch, CM, selectedHostUid }) {
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
      dispatch(openServerVersionModal(selectedHostUid));
      return true;
    case MENU_ACTIONS.about:
      dispatch(setAboutCubrid(true));
      return true;
    default:
      return false;
  }
}
