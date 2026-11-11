import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { DropdownMenu, SubMenu, MenuItem, MenuDivider } from '../../../components/common/DropdownMenu';
import { MENU_ACTIONS, getMenuActionEnabled, menuActionHost, runMenuAction } from '../menuActions';
import { menuOffReason } from '../menuOffReason';
import { isCmsAdminHost } from '../../host/cmsAdmin';
import { useCM } from '../../../constants/useCM';
import { isDesktopApp } from '../../desktop/isDesktopApp';
import { isAnyModalOpen } from '../../../infrastructure/hooks/useAnyModalOpen';

const NO_TABS = [];

export default function HeaderMenu({ folded = false }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { selectedHostUid, highlightedHostUid, authorizedHosts, reconnectQueue, hosts } = useSelector((state) => state.host, shallowEqual);
  const dirtyTabs = useSelector((state) => state.layout?.dirtyTabs ?? NO_TABS, shallowEqual);

  const enabled = getMenuActionEnabled({ selectedHostUid, highlightedHostUid, authorizedHosts, reconnectQueue, hosts });
  // Only Edit Host, CMS Account Management and Host Engine Version are ever
  // off, for want of a selected (and, for CMS accounts, connected with the
  // CMS admin account) host.
  const action = (id) => {
    // The host the item acts on (Host Engine Version: the highlighted one),
    // the same one that turned it off.
    const target = menuActionHost(id, { selectedHostUid, highlightedHostUid, authorizedHosts: authorizedHosts ?? [], reconnectQueue: reconnectQueue ?? [] });
    return {
      disabled: !enabled[id],
      title: enabled[id] ? undefined : menuOffReason(CM, {
        hostSelected: Boolean(target.hostUid),
        hostConnected: target.connected,
        cmsAdmin: id !== MENU_ACTIONS.cmsAccountManagement || isCmsAdminHost(hosts, selectedHostUid),
      }),
      onClick: () => runMenuAction(id, { dispatch, CM, selectedHostUid, highlightedHostUid, navigate, dirtyTabs, anyModalOpen: isAnyModalOpen() }),
    };
  };

  const MenuLabel = ({ children }) => (
    <span className="text-13 font-semibold text-slate-500 dark:text-slate-400 tracking-wide group-hover:text-amber-500 transition-colors">
      {children}
    </span>
  );

  // Each menu's items, shown as three menus or, when the header is too
  // narrow for them (see Header.jsx), folded into one.
  const fileItems = (
    <>
      <MenuItem
        icon="add_box"
        label={CM.addHost}
        {...action(MENU_ACTIONS.addHost)}
      />
      <MenuItem
        icon="edit"
        label={CM.editHost}
        {...action(MENU_ACTIONS.editHost)}
      />
      <MenuItem
        icon="file_upload"
        label={CM.exportHost}
        {...action(MENU_ACTIONS.exportHosts)}
      />
      <MenuItem
        icon="file_download"
        label={CM.importHost}
        {...action(MENU_ACTIONS.importHosts)}
      />
      {isDesktopApp() && (
        <>
          <MenuDivider />
          <MenuItem
            icon="folder_open"
            label={CM.switchWorkspace}
            {...action(MENU_ACTIONS.switchWorkspace)}
          />
          <MenuItem
            icon="upload_file"
            label={CM.exportWorkspace}
            {...action(MENU_ACTIONS.exportWorkspace)}
          />
          <MenuItem
            icon="drive_folder_upload"
            label={CM.importWorkspace}
            {...action(MENU_ACTIONS.importWorkspace)}
          />
          <MenuDivider />
          <MenuItem
            icon="logout"
            label={CM.quit}
            onClick={() => void window.desktopBridge?.quitApp?.()}
          />
        </>
      )}
    </>
  );
  const configItems = (
    <>
      <MenuItem
        icon="edit_document"
        label={CM.editCubridConfig}
        {...action(MENU_ACTIONS.editCubridConfig)}
      />
      <MenuItem
        icon="edit_note"
        label={CM.editBrokerConfig}
        {...action(MENU_ACTIONS.editBrokerConfig)}
      />
      <MenuItem
        icon="manage_accounts"
        label={CM.editCmConfig}
        {...action(MENU_ACTIONS.editCmConfig)}
      />
    </>
  );
  const hostItems = (folded) => (
    <>
      <MenuItem
        icon="space_dashboard"
        label={CM.serviceDashboard}
        {...action(MENU_ACTIONS.serviceDashboard)}
      />
      <MenuDivider />
      <MenuItem
        icon="supervisor_account"
        label={CM.cmsAccountManagement}
        {...action(MENU_ACTIONS.cmsAccountManagement)}
      />
      {folded ? configItems : (
        <SubMenu icon="settings" label={CM.configParam} minWidth="min-w-56" gap="ml-3">
          {configItems}
        </SubMenu>
      )}
    </>
  );
  const helpItems = (
    <>
      <MenuItem
        icon="help"
        label={CM.help}
        onClick={() => window.open('https://www.cubrid.org/', '_blank')}
      />
      <MenuItem
        icon="bug_report"
        label={CM.reportBug}
        onClick={() => window.open('http://jira.cubrid.org/secure/Dashboard.jspa', '_blank')}
      />
      <MenuItem
        icon="forum"
        label={CM.cubridOnlineForum}
        onClick={() => window.open('https://www.reddit.com/r/CUBRID/', '_blank')}
      />
      <MenuItem
        icon="code"
        label={CM.cubridToolsDevelopment}
        onClick={() => window.open('https://github.com/CUBRID/cubrid-admin', '_blank')}
      />
      <MenuDivider />
      <MenuItem
        icon="update"
        label={CM.checkForUpdates}
        {...action(MENU_ACTIONS.checkForUpdates)}
      />
      <MenuItem
        icon="info"
        label={CM.serverVersion}
        {...action(MENU_ACTIONS.serverVersion)}
      />
      <MenuItem
        icon="admin_panel_settings"
        label={CM.aboutCubridAdmin}
        {...action(MENU_ACTIONS.about)}
      />
    </>
  );

  if (folded) {
    // No submenu inside: the config file items are listed in place.
    const Heading = ({ children }) => (
      <div className="px-3 pt-2 pb-1 text-11 font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{children}</div>
    );
    return (
      <nav className="flex items-center font-sans" data-testid="header-menu-folded">
        <DropdownMenu label={<MenuLabel>{CM.headerMenu}</MenuLabel>} minWidth="min-w-64">
          <Heading>{CM.file}</Heading>
          {fileItems}
          <MenuDivider />
          <Heading>{CM.hostServiceManagement}</Heading>
          {hostItems(true)}
          <MenuDivider />
          <Heading>{CM.help}</Heading>
          {helpItems}
        </DropdownMenu>
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-6 font-sans">
      <DropdownMenu label={<MenuLabel>{CM.file}</MenuLabel>}>
        {fileItems}
      </DropdownMenu>

      <DropdownMenu label={<MenuLabel>{CM.hostServiceManagement}</MenuLabel>} minWidth="min-w-60">
        {hostItems(false)}
      </DropdownMenu>

      <DropdownMenu label={<MenuLabel>{CM.help}</MenuLabel>} minWidth="min-w-56">
        {helpItems}
      </DropdownMenu>
    </nav>
  );
}
