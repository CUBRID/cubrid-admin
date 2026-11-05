import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { DropdownMenu, SubMenu, MenuItem, MenuDivider } from '../../../components/common/DropdownMenu';
import { MENU_ACTIONS, getMenuActionEnabled, runMenuAction } from '../menuActions';
import { useCM } from '../../../constants/useCM';

export default function HeaderMenu() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { selectedHostUid, authorizedHosts } = useSelector((state) => state.host, shallowEqual);

  const enabled = getMenuActionEnabled({ selectedHostUid, authorizedHosts });
  const action = (id) => ({
    disabled: !enabled[id],
    onClick: () => runMenuAction(id, { dispatch, CM, selectedHostUid }),
  });

  const MenuLabel = ({ children }) => (
    <span className="text-13 font-semibold text-slate-500 dark:text-slate-400 tracking-wide group-hover:text-amber-500 transition-colors">
      {children}
    </span>
  );

  return (
    <nav className="flex items-center gap-6 font-sans">
      <DropdownMenu label={<MenuLabel>{CM.file}</MenuLabel>}>
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
      </DropdownMenu>

      <DropdownMenu label={<MenuLabel>{CM.hostServiceManagement}</MenuLabel>} width="w-60">
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
        <SubMenu icon="settings" label={CM.configParam} width="w-56" gap="ml-3">
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
        </SubMenu>
      </DropdownMenu>

      <DropdownMenu label={<MenuLabel>{CM.help}</MenuLabel>} width="w-56">
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
          onClick={() => window.open('https://github.com/CUBRID/cubrid-manager', '_blank')}
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
      </DropdownMenu>
    </nav>
  );
}
