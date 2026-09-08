import { useEffect, useState } from 'react';
import { useSelector, useDispatch , shallowEqual } from 'react-redux';
import { Routes, Route, Navigate } from 'react-router-dom';
import { toggleTheme, toggleSidebar, setIsResizing, setActiveMainTab, closeTab, closeOtherTabs, closeAllTabs, triggerRefreshActiveTab } from '../features/layout/layoutSlice';
import { openAddHostModal, closeAddHostModal, closeChangePasswordModal, setSelectedHost } from '../features/host/hostSlice';
import { stripHaRoleTagFromAlias } from '../features/host/hostGroupUtils';
import { setSelectedDatabase } from '../features/database/databaseSlice';
import { closeCreateUserModal, closeEditUserModal, closeDropUserModal } from '../features/user/userSlice';
import Sidebar from '../features/layout/components/Sidebar';
import Header from '../features/layout/components/Header';
import Breadcrumb from '../features/layout/components/Breadcrumb';
import Footer from '../features/layout/components/Footer';
import AddHostModal from '../features/host/components/AddHostModal';
import HostGroupNameModal from '../features/host/components/HostGroupNameModal';
import ChangeHostPasswordModal from '../features/host/components/ChangeHostPasswordModal';
import DeleteHostGroupModal from '../features/host/components/DeleteHostGroupModal';
import ManageGroupMembersModal from '../features/host/components/ManageGroupMembersModal';
import ServerContent from '../features/server/components/ServerContent';
import DatabaseDashboard from '../features/database/components/DatabaseDashboard';
import DatabaseSpaceMonitor from '../features/database/components/DatabaseSpaceMonitor';
import VolumeInfoMonitor from '../features/database/components/VolumeInfoMonitor';
import VolumeCategoryMonitor from '../features/database/components/VolumeCategoryMonitor';
import CubridConfigEditor from '../features/server/components/CubridConfigEditor';
import BrokerConfigEditor from '../features/server/components/BrokerConfigEditor';
import { SplitPane } from '../components/ds/layout/SplitPane';
import UnloadDatabaseModal from '../features/database/components/UnloadDatabaseModal';
import LoadDatabaseModal from '../features/database/components/LoadDatabaseModal';
import DeleteDatabaseModal from '../features/database/components/DeleteDatabaseModal';
import OptimizeDatabaseModal from '../features/database/components/OptimizeDatabaseModal';
import CheckDatabaseModal from '../features/database/components/CheckDatabaseModal';
import CompactDatabaseModal from '../features/database/components/CompactDatabaseModal';
import CopyDatabaseModal from '../features/database/components/CopyDatabaseModal';
import BackupDatabaseModal from '../features/database/components/BackupDatabaseModal';
import AddBackupPlanModal from '../features/database/components/AddBackupPlanModal';
import AutoBackupLogModal from '../features/database/components/AutoBackupLogModal';
import DeleteBackupPlanModal from '../features/database/components/DeleteBackupPlanModal';
import DatabaseInfoModal from '../features/database/components/DatabaseInfoModal';
import DatabasePlanDumpModal from '../features/database/components/DatabasePlanDumpModal';
import CreateDatabaseModal from '../features/database/components/CreateDatabaseModal';
import EditBackupPlanModal from '../features/database/components/EditBackupPlanModal';
import LoginDatabaseModal from '../features/database/components/LoginDatabaseModal';
import RestoreDatabaseModal from '../features/database/components/RestoreDatabaseModal';
import SetAutomationVolumeModal from '../features/database/components/SetAutomationVolumeModal';
import AutoVolumeLogModal from '../features/database/components/AutoVolumeLogModal';
import AutoQueryLogModal from '../features/database/components/AutoQueryLogModal';
import AddQueryPlanModal from '../features/database/components/AddQueryPlanModal';
import EditQueryPlanModal from '../features/database/components/EditQueryPlanModal';
import DeleteQueryPlanModal from '../features/database/components/DeleteQueryPlanModal';
// AddDatabaseModal was here

import LockInformationModal from '../features/database/components/LockInformationModal';
import UnloadResultModal from '../features/database/components/UnloadResultModal';
import TransactionInfoModal from '../features/database/components/TransactionInfoModal';
import KillTransactionModal from '../features/database/components/KillTransactionModal';
import DeleteHostModal from '../features/host/components/DeleteHostModal';
import EditHostModal from '../features/host/components/EditHostModal';
import ServerVersionModal from '../features/host/components/ServerVersionModal';
import LoginPage from '../features/auth/components/LoginPage';
import DesktopWorkspaceSettingsPage from '../features/desktop/components/DesktopWorkspaceSettingsPage';
import RegisterPage from '../features/auth/components/RegisterPage';
import ForgotPasswordPage from '../features/auth/components/ForgotPasswordPage';
import StatusModal from '../components/common/StatusModal';
import LoadingOverlay from '../components/common/LoadingOverlay';
import LogViewer from '../features/broker/components/LogViewer';
import CMSLogViewer from '../features/broker/components/CMSLogViewer';
import AllLogsViewer from '../features/broker/components/AllLogsViewer';
import BrokerStatus from '../features/broker/components/BrokerStatus';
import BrokerPropertyModal from '../features/broker/components/BrokerPropertyModal';
import Brokers from '../features/server/components/Brokers';
import ServiceDashboard from '../features/server/components/ServiceDashboard';

import CreateUserModal from '../features/user/components/CreateUserModal';
import DropUserModal from '../features/user/components/DropUserModal';
import MonitoringProvider from '../features/layout/components/MonitoringProvider';
import ImportExportHostModal from '../features/host/components/ImportExportHostModal';
import DatabasePropertyModal from '../features/database/components/DatabasePropertyModal';
import RenameDatabaseModal from '../features/database/components/RenameDatabaseModal';
import AddVolumeModal from '../features/database/components/AddVolumeModal';
import SuggestedHaNodesModal from '../features/host/components/SuggestedHaNodesModal';
import HaPeerMergeModal from '../features/host/components/HaPeerMergeModal';
import HaClusterLinkedModal from '../features/host/components/HaClusterLinkedModal';
import ReconnectHostModal from '../features/host/components/ReconnectHostModal';

import { Icon } from '../components/ds/foundation/Icon';
import { useCM } from '../constants/useCM';

function DashboardLayout() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { loading: dbCoreLoading } = useSelector((state) => state.database, shallowEqual);
  const { actionLoading: dbUILoading } = useSelector((state) => state.databaseUI, shallowEqual);
  const { operationLoading: dbOpLoading } = useSelector((state) => state.databaseOperation, shallowEqual);
  const dbActionLoading = dbCoreLoading || dbOpLoading || dbUILoading;
  const { theme, isSidebarCollapsed, isResizing, activeMainTab, openTabs, refreshCounter } = useSelector((state) => state.layout, shallowEqual);
  const [isFlashing, setIsFlashing] = useState(false);
  const { isAddHostModalOpen, hosts, isServiceOperating, serviceOperationType, serviceProgressMessage } = useSelector((state) => state.host, shallowEqual);
  // isAddDatabaseModalOpen removed
  const { isCreateUserModalOpen, createUserDbName, isEditUserModalOpen, editUserData, isDropUserModalOpen } = useSelector((state) => state.user, shallowEqual);
  const { 
    actionLoading: brokerActionLoading, 
    lastActionTarget: brokerActionName, 
    lastActionType: brokerActionType 
  } = useSelector((state) => state.broker, shallowEqual);

  useEffect(() => {
    if (refreshCounter > 0) {
      setIsFlashing(true);
      const timer = setTimeout(() => setIsFlashing(false), 400);
      return () => clearTimeout(timer);
    }
  }, [refreshCounter]);

  const tabLabels = openTabs.reduce((acc, tabId) => {
    if (tabId.startsWith('host:')) {
      const uid = tabId.split(':')[1];
      const host = hosts.find(h => h.uid === uid);
      acc[tabId] = host ? stripHaRoleTagFromAlias(host.alias || host.id) || host.id : CM.unknownHost;
    } else if (tabId.startsWith('db:')) {
      const parts = tabId.split(':');
      if (parts.length > 2) {
        const host = hosts.find(h => h.uid === parts[1]);
        const hostLabel = host ? stripHaRoleTagFromAlias(host.alias || host.id) || host.id : CM.unknownHost;
        acc[tabId] = `${parts[2]}(${hostLabel})`;
      } else {
        acc[tabId] = parts[1];
      }
    } else if (tabId.startsWith('edit_config:')) {
      acc[tabId] = CM.editConfigTab(tabId.split(':')[2]);
    } else if (tabId.startsWith('broker_config:')) {
      acc[tabId] = CM.brokerConfig;
    } else if (tabId.startsWith('log:')) {
      const parts = tabId.split(':');
      const path = parts[parts.length - 1];
      acc[tabId] = path.split('/').pop();
    } else if (tabId.startsWith('all_logs:')) {
      acc[tabId] = CM.allLogsTab(tabId.split(':')[2]);
    } else if (tabId.startsWith('all_db_logs:')) {
      acc[tabId] = CM.allServerLogsTab(tabId.split(':')[2]);
    } else if (tabId.startsWith('cms-access:')) {
      acc[tabId] = CM.managerAccess;
    } else if (tabId.startsWith('cms-error:')) {
      acc[tabId] = CM.managerError;
    } else if (tabId.startsWith('broker_status:')) {
      acc[tabId] = CM.statusTab(tabId.split(':')[2]);
    } else if (tabId.startsWith('brokers_status:')) {
      acc[tabId] = CM.brokerStatus;
    } else if (tabId.startsWith('db_space:')) {
      acc[tabId] = CM.spaceTab(tabId.split(':')[2]);
    } else if (tabId.startsWith('vol_info:')) {
      const fullPath = tabId.split(':')[3];
      acc[tabId] = CM.volumeTab(fullPath.split(/[\\/]/).pop());
    } else if (tabId.startsWith('vol_category:')) {
      const category = tabId.split(':')[3];
      acc[tabId] = CM.volumesTab(category);
    } else if (tabId === 'service_dashboard') {
      acc[tabId] = CM.serviceDashboard;
    }

    return acc;
  }, {});

  // Sync global selection with active tab
  useEffect(() => {
    if (activeMainTab) {
      if (activeMainTab.startsWith('host:')) {
        dispatch(setSelectedHost(activeMainTab.split(':')[1]));
      } else if (activeMainTab.startsWith('db:')) {
        const parts = activeMainTab.split(':');
        if (parts.length > 2) {
          dispatch(setSelectedHost(parts[1]));
          dispatch(setSelectedDatabase(parts[2]));
        } else {
          dispatch(setSelectedDatabase(parts[1]));
        }
      }
    }
  }, [activeMainTab, dispatch]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'))) {
        e.preventDefault();
        dispatch(triggerRefreshActiveTab());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);

  // Construct dynamic loading message
  const getLoadingSubtitle = () => {
    if (isServiceOperating) {
      return serviceProgressMessage || (serviceOperationType === 'start' ? CM.serviceStartWait : CM.serviceStopWait);
    }
    if (brokerActionLoading && brokerActionName) {
      return brokerActionType === 'start' ? CM.startBrokerLine(brokerActionName) : CM.stopBrokerLine(brokerActionName);
    }
    if (dbActionLoading) {
      return CM.processingDbRequest;
    }
    return CM.processingRequest;
  };

  return (
    <MonitoringProvider>
      <div className={`h-screen overflow-hidden ${isResizing ? 'select-none' : ''}`}>
        {/* Flash Overlay */}
        <div className={`fixed inset-0 bg-white/20 dark:bg-white/5 pointer-events-none z-[9999] transition-opacity duration-300 ${isFlashing ? 'opacity-100' : 'opacity-0'}`} />
        
        <SplitPane split="vertical" defaultSize={440} minSize={280} maxSize={640} className="h-full w-full">
          <Sidebar
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => dispatch(toggleSidebar())}
            onResizeChange={(val) => dispatch(setIsResizing(val))}
            onAddHost={() => dispatch(openAddHostModal())}
          />

          <main className="w-full h-full flex flex-col bg-background-light dark:bg-bk-main overflow-hidden">

            <Header theme={theme} toggleTheme={() => dispatch(toggleTheme())} />
          <div className="shrink-0 bg-slate-50 dark:bg-bk-main">

            <Breadcrumb
              activeTab={activeMainTab}
              openTabs={openTabs}
              labels={tabLabels}
              onTabChange={(tabId) => dispatch(setActiveMainTab(tabId))}
              onCloseTab={(tab) => dispatch(closeTab(tab))}
              onCloseOthers={(tabId) => dispatch(closeOtherTabs(tabId))}
              onCloseAll={() => dispatch(closeAllTabs())}
            />
          </div>


          {openTabs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden bg-white dark:bg-bk-main select-none">

              {/* Grid background */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)', backgroundSize: '32px 32px' }}
              />
              <div className="absolute inset-0 dark:block hidden pointer-events-none"
                style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '32px 32px' }}
              />

              {/* Glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-400/5 dark:bg-amber-500/8 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-col items-center gap-14 max-w-md mt-[-40px]">


                {/* Icon cluster */}
                <div className="relative flex items-center justify-center">
                  {/* Orbit ring 1 */}
                  <div className="absolute w-28 h-28 rounded-full border border-dashed border-amber-500/15 dark:border-amber-500/20 animate-[spin_18s_linear_infinite]" />
                  {/* Orbit ring 2 */}
                  <div className="absolute w-40 h-40 rounded-full border border-slate-200 dark:border-white/6 animate-[spin_30s_linear_infinite_reverse]" />

                  {/* Central badge */}
                  <div className="w-16 h-16 rounded-2xl bg-white dark:bg-white/4 border border-slate-200 dark:border-white/8 shadow-lg flex items-center justify-center">
                    <Icon name="database" weight={300} size="29px" className="text-amber-500" />
                  </div>

                  {/* Satellite dot – top right */}
                  <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-emerald-400/80 border-2 border-white dark:border-bk-main shadow-xs shadow-emerald-500/30" />
                  {/* Satellite dot – bottom left */}
                  <div className="absolute bottom-3 left-3 w-2 h-2 rounded-full bg-amber-500/50" />
                </div>

                {/* Text */}
                <div className="text-center space-y-2">
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 tracking-tight uppercase">
                    {CM.appName}
                  </h2>
                  <p className="text-14 text-slate-400 dark:text-slate-500 max-w-[260px] leading-relaxed">
                    {CM.selectHostHint}
                  </p>
                </div>

                {/* Feature pills */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {[
                    { icon: 'dns', label: CM.hostManagement },
                    { icon: 'storage', label: CM.volumeMonitor },
                    { icon: 'analytics', label: CM.performance },
                    { icon: 'lock', label: CM.lockInfo },
                  ].map(f => (
                    <div key={f.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-white/4 border border-slate-200 dark:border-white/6">
                      <Icon name={f.icon} size="14px" weight={300} className="text-slate-400 dark:text-slate-500" />
                      <span className="text-13 text-slate-500 dark:text-slate-400 font-medium">{f.label}</span>
                    </div>
                  ))}
                </div>

                {/* Status bar */}
                <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 dark:border-white/6 bg-slate-50 dark:bg-white/2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-12 text-slate-400 font-mono tracking-wider uppercase">{CM.systemReady}</span>
                </div>

              </div>
            </div>

          ) : (
            openTabs.map((tabId) => {
              const isActive = tabId === activeMainTab;
              const isHost = tabId.startsWith('host:');
              const isDb = tabId.startsWith('db:');
              const isEditConfig = tabId.startsWith('edit_config:');
              const isBrokerConfig = tabId.startsWith('broker_config:');
              const isLogViewer = tabId.startsWith('log:');
              const isAllLogs = tabId.startsWith('all_logs:');
              const isAllDbLogs = tabId.startsWith('all_db_logs:');
              const isCmsAccessLog = tabId.startsWith('cms-access:');
              const isCmsErrorLog = tabId.startsWith('cms-error:');
              const isBrokerStatus = tabId.startsWith('broker_status:');
              const isBrokersStatus = tabId.startsWith('brokers_status:');
              const isDbSpace = tabId.startsWith('db_space:');

              const resourceId = tabId.split(':')[1];

              return (
                <div key={tabId} className={`flex-1 flex flex-col overflow-hidden ${isActive ? '' : 'hidden'}`}>
                  {isHost && <ServerContent hostUid={resourceId} />}
                  {isDb && (
                    <DatabaseDashboard 
                      hostUid={tabId.split(':').length > 2 ? tabId.split(':')[1] : undefined}
                      dbname={tabId.split(':').length > 2 ? tabId.split(':')[2] : tabId.split(':')[1]} 
                    />
                  )}
                  {isDbSpace && (
                    <DatabaseSpaceMonitor 
                      hostUid={tabId.split(':')[1]} 
                      dbname={tabId.split(':')[2]} 
                    />
                  )}
                  {tabId.startsWith('vol_info:') && (
                    <VolumeInfoMonitor tabId={tabId} />
                  )}
                  {tabId.startsWith('vol_category:') && (
                    <VolumeCategoryMonitor 
                      hostUid={tabId.split(':')[1]}
                      dbname={tabId.split(':')[2]}
                      category={tabId.split(':')[3]}
                    />
                  )}
                  {isEditConfig && (
                    <CubridConfigEditor
                      hostUid={resourceId}
                      confname={tabId.split(':')[2]}
                    />
                  )}
                  {isBrokerConfig && (
                    <BrokerConfigEditor
                      hostUid={resourceId}
                    />
                  )}
                  {isLogViewer && (
                    <LogViewer
                      hostUid={tabId.split(':')[1]}
                      path={tabId.split(':').slice(2).join(':')}
                    />
                  )}
                  {isAllLogs && (
                    <AllLogsViewer
                      type="broker"
                      hostUid={tabId.split(':')[1]}
                      targetName={tabId.split(':')[2]}
                    />
                  )}
                  {isAllDbLogs && (
                    <AllLogsViewer
                      type="database"
                      hostUid={tabId.split(':')[1]}
                      targetName={tabId.split(':')[2]}
                    />
                  )}
                  {isCmsAccessLog && (
                    <CMSLogViewer
                      hostUid={tabId.split(':')[1]}
                      type="access"
                    />
                  )}
                  {isCmsErrorLog && (
                    <CMSLogViewer
                      hostUid={tabId.split(':')[1]}
                      type="error"
                    />
                  )}
                  {isBrokerStatus && (
                    <BrokerStatus
                      hostUid={tabId.split(':')[1]}
                      brokerName={tabId.split(':')[2]}
                    />
                  )}
                  {isBrokersStatus && (
                    <Brokers hostUid={tabId.split(':')[1]} />
                  )}
                  {tabId === 'service_dashboard' && <ServiceDashboard />}

                </div>
              );
            })
          )}

          <Footer />
          </main>
        </SplitPane>

        <SuggestedHaNodesModal />
        <HaPeerMergeModal />
        <HaClusterLinkedModal />

        <HostGroupNameModal />
        <AddHostModal
          isOpen={isAddHostModalOpen}
          onClose={() => dispatch(closeAddHostModal())}
        />
        <DeleteHostModal />
        <DeleteHostGroupModal />
        <ManageGroupMembersModal />
        <EditHostModal />
        <ChangeHostPasswordModal />
        <ServerVersionModal />
        <ImportExportHostModal />
        <ReconnectHostModal />

        <UnloadDatabaseModal />
        <LoadDatabaseModal />
        <DeleteDatabaseModal />
        <CheckDatabaseModal />
        <CompactDatabaseModal />
        <OptimizeDatabaseModal />
        <CopyDatabaseModal />
        <BackupDatabaseModal />
        <AddBackupPlanModal />
        <AutoBackupLogModal />
        <DeleteBackupPlanModal />
        <EditBackupPlanModal />
        <CreateDatabaseModal />
        <LoginDatabaseModal />
        <RestoreDatabaseModal />
        <SetAutomationVolumeModal />
        <AutoVolumeLogModal />
        <AddQueryPlanModal />
        <EditQueryPlanModal />
        <DeleteQueryPlanModal />
        <AutoQueryLogModal />
        {/* AddDatabaseModal was removed: Redundant with LoginDatabaseModal + Remember Me */}

        <LockInformationModal />
        <UnloadResultModal />
        <TransactionInfoModal />
        <KillTransactionModal />
        <CreateUserModal
          isOpen={isCreateUserModalOpen || isEditUserModalOpen}
          onClose={() => {
            dispatch(closeCreateUserModal());
            dispatch(closeEditUserModal());
          }}
          dbname={createUserDbName || editUserData?.dbname}
          editingUser={editUserData?.userName}
        />
        <DropUserModal />
        <DatabasePropertyModal />
        <DatabaseInfoModal />
        <DatabasePlanDumpModal />
        <RenameDatabaseModal />
        <BrokerPropertyModal />
        <AddVolumeModal />
        <StatusModal />

        <LoadingOverlay 
          isVisible={isServiceOperating || dbActionLoading || brokerActionLoading} 
          title={
            isServiceOperating 
              ? CM.service
              : (dbActionLoading ? CM.databaseAction : CM.brokerAction)
          }
          subtitle={getLoadingSubtitle()}
        />
      </div>
    </MonitoringProvider>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useSelector((state) => state.auth, shallowEqual);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function RootRedirect() {
  const { isAuthenticated } = useSelector((state) => state.auth, shallowEqual);
  return <Navigate to={isAuthenticated ? '/home' : '/login'} replace />;
}

function App() {
  const { theme } = useSelector((state) => state.layout, shallowEqual);

  useEffect(() => {
    if (window.desktopBridge?.onCloseActiveTab) {
      const unsubscribe = window.desktopBridge.onCloseActiveTab(() => {
        const event = new CustomEvent('in-app:close-active-tab', { cancelable: true });
        window.dispatchEvent(event);
        if (!event.defaultPrevented) {
          window.desktopBridge.closeWindow();
        }
      });
      return unsubscribe;
    }
  }, []);

  // Applied here (not inside DashboardLayout) so it runs on every route,
  // including pre-auth pages like /login that DashboardLayout never renders.
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/desktop/workspace" element={<DesktopWorkspaceSettingsPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
