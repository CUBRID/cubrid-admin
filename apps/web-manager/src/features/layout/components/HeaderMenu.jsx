import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { DropdownMenu, SubMenu, MenuItem, MenuDivider } from '../../../components/common/DropdownMenu';
import { openTab, showStatusModal } from '../layoutSlice';
import { openAddHostModal, openEditHostModal, openServerVersionModal, openImportExportModal, openCmsUserManagementModal } from '../../host/hostSlice';
import { setAboutCubrid } from '../appBarSlice';
import { useCM } from '../../../constants/useCM';

export default function HeaderMenu() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { selectedHostUid, authorizedHosts } = useSelector((state) => state.host, shallowEqual);

  const handleExport = () => {
    dispatch(openImportExportModal('export'));
  };

  const handleImport = () => {
    dispatch(openImportExportModal('import'));
  };

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
          onClick={() => dispatch(openAddHostModal())}
        />
        <MenuItem
          icon="edit"
          label={CM.editHost}
          disabled={!selectedHostUid}
          onClick={() => dispatch(openEditHostModal(selectedHostUid))}
        />
        <MenuItem
          icon="file_upload"
          label={CM.exportHost}
          onClick={handleExport}
        />
        <MenuItem
          icon="file_download"
          label={CM.importHost}
          onClick={handleImport}
        />
      </DropdownMenu>

      <DropdownMenu label={<MenuLabel>{CM.hostServiceManagement}</MenuLabel>} width="w-60">
        <MenuItem
          icon="space_dashboard"
          label={CM.serviceDashboard}
          onClick={() => dispatch(openTab('service_dashboard'))}
        />
        <MenuDivider />
        <MenuItem
          icon="supervisor_account"
          label={CM.cmsAccountManagement}
          disabled={!selectedHostUid || !authorizedHosts.includes(selectedHostUid)}
          onClick={() => dispatch(openCmsUserManagementModal())}
        />
        <SubMenu icon="settings" label={CM.configParam} width="w-56" gap="ml-3">
          <MenuItem
            icon="edit_document"
            label={CM.editCubridConfig}
            onClick={() => {
              if (selectedHostUid) {
                dispatch(openTab(`edit_config:${selectedHostUid}:cubridconf`));
              } else {
                dispatch(showStatusModal({ type: 'info', title: CM.noHostSelected, message: CM.selectHostHint }));
              }
            }}
          />
          <MenuItem
            icon="edit_note"
            label={CM.editBrokerConfig}
            onClick={() => {
              if (selectedHostUid) {
                dispatch(openTab(`broker_config:${selectedHostUid}`));
              } else {
                dispatch(showStatusModal({ type: 'info', title: CM.noHostSelected, message: CM.selectHostHint }));
              }
            }}
          />
          <MenuItem
            icon="manage_accounts"
            label={CM.editCmConfig}
            onClick={() => {
              if (selectedHostUid) {
                dispatch(openTab(`edit_config:${selectedHostUid}:cmconf`));
              } else {
                dispatch(showStatusModal({ type: 'info', title: CM.noHostSelected, message: CM.selectHostHint }));
              }
            }}
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
          disabled={true}
          onClick={() => {}}
        />
        <MenuItem
          icon="info"
          label={CM.serverVersion}
          disabled={!selectedHostUid}
          onClick={() => dispatch(openServerVersionModal(selectedHostUid))}
        />
        <MenuItem
          icon="admin_panel_settings"
          label={CM.aboutCubridAdmin}
          onClick={() => dispatch(setAboutCubrid(true))}
        />
      </DropdownMenu>
    </nav>
  );
}
