import { RefreshingOverlay } from '../../../components/ds/feedback/RefreshingOverlay';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSelector, useDispatch , shallowEqual } from 'react-redux';
import {
  fetchHosts,
  setSelectedHost,
  loginHostsBatch,
  openDeleteHostModal,
  openEditHostModal,
  openChangePasswordModal,
  revokeHostLogin,
  openServerVersionModal,
  openCmsUserManagementModal,
  startService,
  stopService,
  moveHost,
  deleteHost,
  refreshServerList
} from '../../host/hostSlice';
import {
  fetchDatabaseStartInfo, startDatabase, stopDatabase, loginDatabase, logoutDatabase, registerDatabase, deleteDatabaseProfile,
  setSelectedDatabase, setSelectedDatabaseSubItem, clearDatabaseError, resetDatabaseState, clearDatabaseLoginsForHost
} from '../../database/databaseCoreSlice';
import { dbKey } from '../../database/dbKey';

import {
  fetchDatabaseVolumes, fetchDatabaseSpaceInfo, fetchDashboardVolumes, fetchDashboardLocks,
  fetchDashboardPerformance, fetchDashboardCAS, fetchDashboardData, clearMonitoringError
} from '../../database/databaseMonitoringSlice';

import {
  createDatabase, copyDatabase, deleteDatabase, renameDatabase, fetchCreateDatabaseInfo,
  addVolume, fetchBackupSchedule, addBackupSchedule,
  editBackupSchedule, deleteBackupSchedule, fetchBackupList, fetchBackupDbInfo,
  fetchAutoBackupLog, checkDatabase, compactDatabase, optimizeDatabase, loadDatabase,
  unloadDatabase, fetchQueryPlan, setAutoExecQuery, fetchQueryPlanLog, fetchLockInfo,
  fetchTransactionInfo, killTransaction, clearError
} from '../../database/databaseOperationSlice';

import {
  openUnloadDatabaseModal, closeUnloadDatabaseModal, openLoadDatabaseModal, closeLoadDatabaseModal,
  openCheckDatabaseModal, closeCheckDatabaseModal, openCompactDatabaseModal, closeCompactDatabaseModal,
  openCopyDatabaseModal, closeCopyDatabaseModal, openBackupDatabaseModal, closeBackupDatabaseModal,
  openRestoreDatabaseModal, closeRestoreDatabaseModal, openOptimizeDatabaseModal, closeOptimizeDatabaseModal,
  openAddBackupPlanModal, closeAddBackupPlanModal, openEditBackupPlanModal, closeEditBackupPlanModal,
  openDeleteBackupPlanModal, closeDeleteBackupPlanModal, openAutoBackupLogModal, closeAutoBackupLogModal,
  openLockInformationModal, closeLockInformationModal, openUnloadResultModal, closeUnloadResultModal,
  openTransactionInfoModal, closeTransactionInfoModal, openKillTransactionModal, closeKillTransactionModal,
  openDeleteDatabaseModal, closeDeleteDatabaseModal, openDatabasePropertyModal, closeDatabasePropertyModal,
  openRenameDatabaseModal, closeRenameDatabaseModal, openAddVolumeModal, closeAddVolumeModal,
  openDatabaseInfoModal, closeDatabaseInfoModal, openPlanDumpModal, closePlanDumpModal,
  openAddQueryPlanModal, closeAddQueryPlanModal, openAutoQueryLogModal, closeAutoQueryLogModal,
  openCreateDatabaseModal, closeCreateDatabaseModal, openSetAutomationVolumeModal, closeSetAutomationVolumeModal,
  openAutoVolumeLogModal, closeAutoVolumeLogModal, openLoginDatabaseModal, closeLoginDatabaseModal,
  openEditQueryPlanModal, closeEditQueryPlanModal, openDeleteQueryPlanModal, closeDeleteQueryPlanModal,
  setSelectedBackupId, clearSelectedBackupId, setSelectedQueryPlanId
} from '../../database/databaseUISlice';
import {
  fetchBrokerList,
  fetchBrokerLogs,
  fetchAdminLogs,
  fetchCMSLogs,
  fetchDatabaseLogs,
  startBroker,
  stopBroker,
  startAllBrokers,
  stopAllBrokers,
  openBrokerPropertyModal,
  resetBrokerState
} from '../../broker/brokerSlice';
import { setActiveMainTab, openTab, closeHostTabs, showStatusModal } from '../layoutSlice';
import { fetchDatabaseUsers, openCreateUserModal, openEditUserModal, openDropUserModal } from '../../user/userSlice';
import { clearHostSummary } from '../../server/globalMonitoringSlice';
import { MenuItem, MenuDivider, SubMenu } from '../../../components/common/DropdownMenu';
import ContextMenuWrapper from '../../../components/common/ContextMenuWrapper';
import { SplitPane } from '../../../components/ds/layout/SplitPane';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Spinner } from '../../../components/ds/foundation/Spinner';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import { ModalStatusError } from '../../../components/ds/feedback/ActionStatus';
import { Modal } from '../../../components/ds/layout/Modal';
import { ConfirmDialog } from '../../../components/ds/layout/ConfirmDialog';
import { Button } from '../../../components/ds/foundation/Button';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { useCM } from '../../../constants/useCM';
import { useCmsJobs } from '../../../infrastructure/context/CmsJobContext';
import { BackgroundJobsPanel } from '../../../infrastructure/cmsJob/BackgroundJobsPanel';

// Internal Sidebar Components
import SidebarHeader from '../sidebar/components/SidebarHeader';
import HostGroupTree from '../sidebar/components/HostGroupTree';
import TreeTabHeader from '../sidebar/components/TreeTabHeader';
import DatabaseTree from '../sidebar/components/DatabaseTree';
import BrokerTree from '../sidebar/components/BrokerTree';
import LogTree from '../sidebar/components/LogTree';
import SidebarEmptyState from '../sidebar/components/SidebarEmptyState';
import CMSUserManagementModal from '../../host/components/CMSUserManagementModal';
import EditCMSUserModal from '../../host/components/EditCMSUserModal';
import { openCreateGroupModal, openDeleteGroupModal, openRenameGroupModal, openAddHostModal, openManageGroupMembersModal } from '../../host/hostSlice';
import { getUnauthorizedHostUids, UNGROUPED_GROUP_ID, HOST_DRAG_MIME, orderedGroupEntries } from '../../host/hostGroupUtils';
import { useHostActivation } from '../../host/useHostActivation';

export default function Sidebar({ isCollapsed, onAddHost }) {
  const CM = useCM();
  const {
    jobs: backgroundJobs,
    activeCount: backgroundJobActiveCount,
    panelExpanded: backgroundJobsExpanded,
    setPanelExpanded: setBackgroundJobsExpanded,
    dismissJob: dismissBackgroundJob,
    clearCompleted: clearCompletedBackgroundJobs,
  } = useCmsJobs();
  const sidebarRef = useRef(null);
  const hostSectionRef = useRef(null);
  const [activeTab, setActiveTab] = useState('db');
  // Cmd/Ctrl+click and Shift+click multi-selection in the host tree — see
  // HostGroupTree/ServerListItem. Separate from selectedHostUid, which drives
  // which host's dashboard/tree content is shown.
  const [selectedHostUids, setSelectedHostUids] = useState(() => new Set());
  const [bulkHostContextMenu, setBulkHostContextMenu] = useState(null);
  const [bulkDeleteHostConfirm, setBulkDeleteHostConfirm] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [groupContextMenu, setGroupContextMenu] = useState(null);
  const [dbContextMenu, setDbContextMenu] = useState(null);
  const [brokerContextMenu, setBrokerContextMenu] = useState(null);
  const [usersContextMenu, setUsersContextMenu] = useState(null);
  const [userContextMenu, setUserContextMenu] = useState(null);
  const [backupPlanContextMenu, setBackupPlanContextMenu] = useState(null);
  const [dbRootContextMenu, setDbRootContextMenu] = useState(null);
  const [spaceContextMenu, setSpaceContextMenu] = useState(null);
  const [queryPlanContextMenu, setQueryPlanContextMenu] = useState(null);
  const [queryItemContextMenu, setQueryItemContextMenu] = useState(null);
  const [jobAutomationContextMenu, setJobAutomationContextMenu] = useState(null);
  const [brokerRootContextMenu, setBrokerRootContextMenu] = useState(null);

  const [backupItemContextMenu, setBackupItemContextMenu] = useState(null);
  const [sqlLogContextMenu, setSqlLogContextMenu] = useState(null);
  const [dbLogContextMenu, setDbLogContextMenu] = useState(null);
  const [brokerLogRootContextMenu, setBrokerLogRootContextMenu] = useState(null);
  const [brokerErrorLogContextMenu, setBrokerErrorLogContextMenu] = useState(null);
  const [adminLogContextMenu, setAdminLogContextMenu] = useState(null);
  const [managerLogContextMenu, setManagerLogContextMenu] = useState(null);
  const [serverLogRootContextMenu, setServerLogRootContextMenu] = useState(null);
  const [logTabContextMenu, setLogTabContextMenu] = useState(null);

  const dispatch = useDispatch();
  const { 
    startAction, 
    endError, 
    resetAction,
    isLoading: sidebarActionLoading,
    isError: isSidebarActionError,
    error: sidebarActionError
  } = useActionState();

  const [loadingText, setLoadingText] = useState(CM.processing);
  const [stopServiceConfirm, setStopServiceConfirm] = useState({
    isOpen: false,
    hostUid: null,
    serverName: '',
  });
  // Generic gate for a risky action (db/broker start/stop, single or bulk) —
  // set { title, description, confirmLabel, variant, run } to show the
  // dialog; onConfirm calls run() and clears this, onCancel just clears it.
  const [pendingActionConfirm, setPendingActionConfirm] = useState(null);
  const requestActionConfirm = (config) => setPendingActionConfirm(config);

  const { hosts, hostGroups, selectedHostUid, selectedGroupUid, loading: hostsLoading, authorizedHosts, isLoggingIntoHost, hostAuthErrors, haInfo } = useSelector((state) => state.host, shallowEqual);
  const { databases, activeDatabases, loggedInDatabases, haDbNames } = useSelector((state) => state.database, shallowEqual);
  const { brokers, logsLoading, adminLogsLoading, cmsLogsLoading, dbLogsLoading } = useSelector((state) => state.broker, shallowEqual);
  const isRefreshingLogs = logsLoading || adminLogsLoading || cmsLogsLoading || dbLogsLoading;
  // Some Manage Database operations are unsafe (or outright break HA
  // pairing) when run against a database that's a live HA member — block
  // them at the menu instead of letting master/slave silently diverge:
  //  - Load Database: loaddb always forces SA mode via CMS, which internally
  //    resets ha_mode to off for the duration of the load, so nothing it
  //    writes replicates to the HA peer (see known_issues.rst).
  //  - Rename Database: renamedb has no HA awareness at all — it only
  //    renames the local databases.txt entry + volume files, so afterward
  //    cubrid_ha.conf's ha_db_list (and the peer, whose db keeps the old
  //    name) no longer match the renamed local name, breaking HA pairing.
  //  - Delete Database: removes this node's copy of an HA-paired database
  //    outright — there is no way that leaves HA working correctly.
  //  - Restore Database: restoredb never touches the ha_apply_info catalog
  //    (the slave's replication-resume bookmark) — CUBRID ships a dedicated
  //    `restoreslave` utility that resets it to the restored LSA specifically
  //    because plain restoredb leaves it stale, which webmanager never uses.
  //
  // Gated on haDbNames (static cubrid_ha.conf ha_db_list membership, carried
  // on start-info — see StartInfoClientResponse), NOT live heartbeat
  // presence: a genuinely-disconnected/mid-recovery HA pair can report no
  // live heartbeat at all, which would wrongly read as "not HA" and silently
  // re-enable exactly the operations that are dangerous in that state.
  const isSelectedDbInHa = haDbNames.includes(dbContextMenu?.db);


  useEffect(() => {
    dispatch(fetchHosts());
  }, [dispatch]);

  const closeAllContextMenus = useCallback(() => {
    setContextMenu(null);
    setBulkHostContextMenu(null);
    setGroupContextMenu(null);
    setDbContextMenu(null);
    setBrokerContextMenu(null);
    setUsersContextMenu(null);
    setUserContextMenu(null);
    setBackupPlanContextMenu(null);
    setDbRootContextMenu(null);
    setSpaceContextMenu(null);
    setQueryPlanContextMenu(null);
    setQueryItemContextMenu(null);
    setJobAutomationContextMenu(null);
    setBrokerRootContextMenu(null);
    setBackupItemContextMenu(null);
    setSqlLogContextMenu(null);
    setDbLogContextMenu(null);
    setBrokerLogRootContextMenu(null);
    setBrokerErrorLogContextMenu(null);
    setAdminLogContextMenu(null);
    setManagerLogContextMenu(null);
    setServerLogRootContextMenu(null);
    setLogTabContextMenu(null);
  }, []);

  // Login (if needed) + open dashboard — only ever called from an explicit
  // "activate" gesture (double-click), never as a side effect of selection.
  const handleHostLogin = useHostActivation();

  const pendingLoginAllUids = getUnauthorizedHostUids(hostGroups, authorizedHosts, null);
  const pendingLoginCount = pendingLoginAllUids.length;

  const handleLoginAll = useCallback((groupId = null) => {
    const uids = getUnauthorizedHostUids(hostGroups, authorizedHosts, groupId);
    if (uids.length === 0) return;

    dispatch(loginHostsBatch(uids))
      .unwrap()
      .then(({ successCount, failed }) => {
        let message = CM.connectedHostsMsg(successCount);
        if (failed.length > 0) {
          message += CM.failedListSuffix(failed.map((f) => `${f.name} (${f.reason})`).join(', '));
        }
        dispatch(showStatusModal({
          type: failed.length > 0 && successCount === 0 ? 'error' : 'success',
          title: CM.loginAll,
          message,
        }));
      })
      .catch(() => {
        dispatch(showStatusModal({
          type: 'error',
          title: CM.loginAll,
          message: CM.loginToHostsFailedMsg,
        }));
      });
  }, [dispatch, hostGroups, authorizedHosts, CM.loginAll]);

  const handleServiceAction = async (hostUid, action) => {
    if (!hostUid) return;
    setLoadingText(action === 'start' ? CM.startingService : CM.stoppingService);
    startAction();
    try {
      if (action === 'start') {
        await dispatch(startService(hostUid)).unwrap();
      } else {
        await dispatch(stopService(hostUid)).unwrap();
      }
      resetAction();
    } catch (err) {
      endError(err);
    }
  };

  const closeStopServiceConfirm = () => {
    setStopServiceConfirm(prev => ({ ...prev, isOpen: false }));
  };

  const requestStopService = (hostUid, serverName) => {
    if (!hostUid) return;
    setStopServiceConfirm({
      isOpen: true,
      hostUid,
      serverName: serverName || hostUid,
    });
  };

  const handleContextMenu = (e, serverName, hostUid, alias) => {
    e.preventDefault();
    // Right-clicking a host that's part of the current multi-selection acts
    // on the whole selection; right-clicking outside it replaces the
    // selection with just this host and falls through to the normal menu.
    if (selectedHostUids.size > 1 && selectedHostUids.has(hostUid)) {
      closeAllContextMenus();
      setBulkHostContextMenu({ mouseX: e.clientX, mouseY: e.clientY, hostUids: Array.from(selectedHostUids) });
      return;
    }
    setSelectedHostUids(new Set());
    closeAllContextMenus();
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, server: serverName, hostUid, alias });
  };

  const handleBulkLoginSelected = () => {
    const uids = (bulkHostContextMenu?.hostUids || []).filter((uid) => !authorizedHosts.includes(uid));
    setBulkHostContextMenu(null);
    if (uids.length === 0) return;

    dispatch(loginHostsBatch(uids))
      .unwrap()
      .then(({ successCount, failed }) => {
        let message = CM.connectedHostsMsg(successCount);
        if (failed.length > 0) {
          message += CM.failedListSuffix(failed.map((f) => `${f.name} (${f.reason})`).join(', '));
        }
        dispatch(showStatusModal({
          type: failed.length > 0 && successCount === 0 ? 'error' : 'success',
          title: CM.loginSelectedHosts,
          message,
        }));
      })
      .catch(() => {
        dispatch(showStatusModal({
          type: 'error',
          title: CM.loginSelectedHosts,
          message: CM.loginToHostsFailedMsg,
        }));
      });
  };

  const handleBulkMoveSelected = async (targetGroupId) => {
    const uids = bulkHostContextMenu?.hostUids || [];
    setBulkHostContextMenu(null);
    setSelectedHostUids(new Set());
    // Sequential, not Promise.all: each move's response is a full host_groups
    // snapshot that overwrites Redux state, so parallel requests can resolve
    // out of order and have a stale (pre-other-move) snapshot clobber the
    // up-to-date one, making it look like only one host moved.
    for (const hostUid of uids) {
      await dispatch(moveHost({ hostUid, targetGroupId }));
    }
  };

  const handleBulkDeleteConfirm = async () => {
    const uids = bulkDeleteHostConfirm?.hostUids || [];
    setBulkDeleteHostConfirm(null);
    let successCount = 0;
    const failedUids = [];
    for (const hostUid of uids) {
      try {
        await dispatch(deleteHost(hostUid)).unwrap();
        dispatch(closeHostTabs(hostUid));
        dispatch(clearHostSummary(hostUid));
        dispatch(clearDatabaseLoginsForHost(hostUid));
        if (selectedHostUid === hostUid) {
          dispatch(setSelectedHost(null));
          dispatch(resetDatabaseState());
          dispatch(resetBrokerState());
        }
        successCount += 1;
      } catch {
        failedUids.push(hostUid);
      }
    }
    setSelectedHostUids(new Set());
    dispatch(showStatusModal({
      type: failedUids.length > 0 && successCount === 0 ? 'error' : 'success',
      title: CM.deleteSelectedHosts,
      message: failedUids.length > 0
        ? CM.bulkDeleteHostsPartialMsg(successCount, failedUids.length)
        : CM.bulkDeleteHostsSuccessMsg(successCount),
    }));
  };

  const handleGroupContextMenu = (e, groupId, groupName) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setGroupContextMenu({ mouseX: e.clientX, mouseY: e.clientY, groupId, groupName });
  };

  const handleHostRootContextMenu = (e) => {
    e.preventDefault();
    closeAllContextMenus();
    setGroupContextMenu({ mouseX: e.clientX, mouseY: e.clientY, groupId: null, groupName: CM.serverListHeader });
  };

  const handleDbContextMenu = (e, dbName, isActive, isLoggedIn) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setDbContextMenu({ mouseX: e.clientX, mouseY: e.clientY, db: dbName, isActive, isLoggedIn });
  };

  const handleDbRootContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setDbRootContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
  };

  const handleBrokerContextMenu = (e, brokerName, state) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setBrokerContextMenu({ mouseX: e.clientX, mouseY: e.clientY, broker: brokerName, state });
  };

  const handleSqlLogContextMenu = (e, brokerName) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setSqlLogContextMenu({ mouseX: e.clientX, mouseY: e.clientY, broker: brokerName });
  };

  const handleDbLogContextMenu = (e, dbName) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setDbLogContextMenu({ mouseX: e.clientX, mouseY: e.clientY, db: dbName });
  };

  const handleBrokerLogRootContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setBrokerLogRootContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
  };

  const handleLogTabContextMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setLogTabContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
  }, [closeAllContextMenus]);

  const handleRefreshAllLogs = useCallback(async () => {
    if (!selectedHostUid) return;
    try {
      const updatedBrokers = await dispatch(fetchBrokerList(selectedHostUid)).unwrap().catch(() => brokers);
      updatedBrokers.forEach(broker => {
        dispatch(fetchBrokerLogs({ hostUid: selectedHostUid, brokerName: broker.name }));
      });
      dispatch(fetchCMSLogs(selectedHostUid));
      dispatch(fetchAdminLogs(selectedHostUid));
      (databases || []).forEach(db => {
        dispatch(fetchDatabaseLogs({ hostUid: selectedHostUid, dbname: db.dbname }));
      });
    } catch (error) {
      console.error('Failed to refresh logs:', error);
    }
  }, [dispatch, selectedHostUid, brokers, databases]);

  const handleBrokerErrorLogContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setBrokerErrorLogContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
  };

  const handleAdminLogContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setAdminLogContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
  };

  const handleManagerLogContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setManagerLogContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
  };

  const handleServerLogRootContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setServerLogRootContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
  };

  const handleUsersContextMenu = (e, dbName, isActive, isLoggedIn) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setUsersContextMenu({ mouseX: e.clientX, mouseY: e.clientY, db: dbName, isActive, isLoggedIn });
  };

  const handleUserContextMenu = (e, dbName, userName, isActive, isLoggedIn) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setUserContextMenu({ mouseX: e.clientX, mouseY: e.clientY, db: dbName, user: userName, isActive, isLoggedIn });
  };

  const handleBackupPlanContextMenu = (e, dbName, isActive, isLoggedIn) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setBackupPlanContextMenu({ mouseX: e.clientX, mouseY: e.clientY, db: dbName, isActive, isLoggedIn });
  };

  const handleSpaceContextMenu = (e, dbName, isActive, isLoggedIn) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setSpaceContextMenu({ mouseX: e.clientX, mouseY: e.clientY, db: dbName, isActive, isLoggedIn });
  };

  const handleQueryPlanContextMenu = (e, dbname, isActive, isLoggedIn) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setQueryPlanContextMenu({ mouseX: e.clientX, mouseY: e.clientY, db: dbname, isActive, isLoggedIn });
  };

  const handleQueryItemContextMenu = (e, dbname, qId, isActive, isLoggedIn) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setQueryItemContextMenu({ mouseX: e.clientX, mouseY: e.clientY, db: dbname, qId, isActive, isLoggedIn });
  };

  const handleBrokerRootContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setBrokerRootContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
  };

  const handleBackupItemContextMenu = (e, dbName, planId, isActive, isLoggedIn) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    dispatch(setSelectedBackupId(planId));
    setBackupItemContextMenu({ mouseX: e.clientX, mouseY: e.clientY, db: dbName, planId, isActive, isLoggedIn });
  };


  useEffect(() => {
    const handleOutsideAction = (e) => {
      const isInsideMenu = e.target.closest('.context-menu-container');
      if (!isInsideMenu) {
        closeAllContextMenus();
      }
    };
    document.addEventListener('mousedown', handleOutsideAction, true);
    return () => {
      document.removeEventListener('mousedown', handleOutsideAction, true);
    };
  }, [closeAllContextMenus]);

  const [isServerListCollapsed, setIsServerListCollapsed] = useState(false);
  const [serverListSize, setServerListSize] = useState(380);
  const [prevServerListSize, setPrevServerListSize] = useState(380);
  const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);
  const [isServerListDropTarget, setIsServerListDropTarget] = useState(false);

  const toggleServerListCollapse = () => {
    setIsServerListCollapsed(!isServerListCollapsed);
    if (!isServerListCollapsed) {
      setPrevServerListSize(serverListSize);
      setServerListSize(40);
    } else {
      setServerListSize(prevServerListSize > 40 ? prevServerListSize : 260);
    }
  };

  const toggleTreeCollapse = () => {
    const nextState = !isTreeCollapsed;
    setIsTreeCollapsed(nextState);
  };

  return (
    <>
      <aside ref={sidebarRef} className={`w-full h-full bg-white dark:bg-bk-side flex flex-col ${isCollapsed ? 'hidden' : ''}`} id="sidebar">

        <SidebarHeader />

        <SplitPane
          split="horizontal"
          size={serverListSize}
          onSizeChange={setServerListSize}
          minSize={isServerListCollapsed ? 40 : 100}
          maxSize={800}

          className="flex-1 w-full flex flex-col overflow-hidden"
        >
          <div className="h-full flex flex-col overflow-hidden bg-white dark:bg-bk-side">
            <div
              className={`flex-none px-4 py-2 border-b border-slate-200 dark:border-white/5 flex items-center justify-between cursor-pointer transition-all duration-300 group/host-header
                ${!isServerListCollapsed
                  ? 'bg-white dark:bg-bk-side'
                  : 'bg-slate-50 dark:bg-white/2 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              onClick={toggleServerListCollapse}
            >
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all duration-200
                  ${!isServerListCollapsed ? 'text-amber-500' : 'text-slate-400 group-hover/host-header:text-amber-500'}`}>
                  <Icon
                    name="chevron_right"
                    size="xs"
                    className={`transition-transform duration-300 ${!isServerListCollapsed ? 'rotate-90' : ''}`}
                    weight={300}
                  />
                </div>
                <Typography variant="caption" className={`font-bold text-14 uppercase tracking-widest transition-colors
                  ${!isServerListCollapsed ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500 group-hover/host-header:text-amber-500'}`}>
                  {CM.serverListHeader}
                </Typography>
              </div>

              <div className="flex items-center gap-2">
                {isServerListCollapsed && (
                  <StatusBadge 
                    label={hosts.length.toString()} 
                    variant="amber" 
                    pulse={true} 
                    className="shadow-xs animate-in zoom-in-95 duration-200" 
                  />
                )}
                {!isServerListCollapsed && (
                  <button
                    data-testid="add-host-toolbar-btn"
                    onClick={(e) => { e.stopPropagation(); onAddHost(); }}
                    className="flex items-center gap-1 h-6 px-2 rounded-sm border border-slate-200 dark:border-white/10 bg-white dark:bg-white/4 text-slate-400 hover:text-amber-500 hover:border-amber-400/50 hover:bg-amber-500/5 dark:hover:bg-amber-500/10 transition-all active:scale-95 shadow-xs"
                    title={CM.addHost}
                  >
                    <Icon name="add" size="13px" weight={400} />
                    <span className="text-12 font-semibold tracking-wide">{CM.add}</span>
                  </button>
                )}
                {!isServerListCollapsed && (
                  <button
                    data-testid="new-group-toolbar-btn"
                    onClick={(e) => { e.stopPropagation(); dispatch(openCreateGroupModal()); }}
                    className="flex items-center gap-1 h-6 px-2 rounded-sm border border-slate-200 dark:border-white/10 bg-white dark:bg-white/4 text-slate-400 hover:text-amber-500 hover:border-amber-400/50 hover:bg-amber-500/5 dark:hover:bg-amber-500/10 transition-all active:scale-95 shadow-xs"
                    title={CM.newGroup}
                  >
                    <Icon name="create_new_folder" size="13px" weight={400} />
                    <span className="text-12 font-semibold tracking-wide">{CM.newGroup}</span>
                  </button>
                )}
                {!isServerListCollapsed && hosts.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (pendingLoginCount === 0) {
                        dispatch(showStatusModal({
                          type: 'info',
                          title: CM.loginAll,
                          message: CM.allHostsAlreadyConnectedMsg,
                        }));
                        return;
                      }
                      handleLoginAll(null);
                    }}
                    disabled={isLoggingIntoHost}
                    className="flex items-center gap-1 h-6 px-2 rounded-sm border border-slate-200 dark:border-white/10 bg-white dark:bg-white/4 text-slate-400 hover:text-amber-500 hover:border-amber-400/50 hover:bg-amber-500/5 dark:hover:bg-amber-500/10 transition-all active:scale-95 shadow-xs disabled:opacity-50 disabled:pointer-events-none"
                    title={CM.loginAll}
                  >
                    <Icon name="login" size="13px" weight={400} />
                    <span className="text-12 font-semibold tracking-wide">{CM.loginAll}</span>
                  </button>
                )}
                {!isServerListCollapsed && (
                  <button
                    data-testid="refresh-server-list-toolbar-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch(refreshServerList());
                    }}
                    disabled={hostsLoading}
                    className="flex items-center justify-center h-6 w-6 rounded-sm border border-slate-200 dark:border-white/10 bg-white dark:bg-white/4 text-slate-400 hover:text-amber-500 hover:border-amber-400/50 hover:bg-amber-500/5 dark:hover:bg-amber-500/10 transition-all active:scale-95 shadow-xs disabled:opacity-50 disabled:pointer-events-none"
                    title={CM.refresh}
                  >
                    <Icon name="refresh" size="13px" weight={400} className={hostsLoading ? 'animate-spin' : ''} />
                  </button>
                )}
              </div>


            </div>

            <div
              ref={hostSectionRef}
              className={`flex-1 overflow-y-auto py-1 bg-slate-50/50 dark:bg-black/20 transition-opacity duration-200 ${isServerListCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'} ${isServerListDropTarget ? 'bg-amber-500/8' : ''}`}
              id="host-section"
              onContextMenu={handleHostRootContextMenu}
              onClick={(e) => {
                // Clicking empty space (not bubbled from a host/group row)
                // clears a shift/cmd-click multi-selection, instead of
                // requiring each host to be cmd/ctrl-clicked off one by one.
                if (e.target === e.currentTarget && selectedHostUids.size > 0) {
                  setSelectedHostUids(new Set());
                }
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(HOST_DRAG_MIME)) return;
                e.preventDefault();
                setIsServerListDropTarget(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  setIsServerListDropTarget(false);
                }
              }}
              onDrop={async (e) => {
                e.preventDefault();
                setIsServerListDropTarget(false);
                const raw = e.dataTransfer.getData(HOST_DRAG_MIME);
                if (!raw) return;
                try {
                  const { hostUid } = JSON.parse(raw);
                  if (!hostUid) return;

                  // Dragging a host that's part of the current multi-selection
                  // ungroups every selected host, not just the one under the
                  // cursor — same rule as HostGroupTree's own drop zones.
                  const hostUidsToMove =
                    selectedHostUids?.size > 1 && selectedHostUids.has(hostUid)
                      ? [...selectedHostUids]
                      : [hostUid];

                  const currentGroupIdByHostUid = new Map();
                  for (const [gid, group] of Object.entries(hostGroups || {})) {
                    for (const uid of Object.keys(group.hosts || {})) {
                      currentGroupIdByHostUid.set(uid, gid);
                    }
                  }

                  const targets = hostUidsToMove.filter(
                    (uid) => currentGroupIdByHostUid.get(uid) !== UNGROUPED_GROUP_ID
                  );
                  for (const uid of targets) {
                    await dispatch(moveHost({ hostUid: uid, targetGroupId: UNGROUPED_GROUP_ID }));
                  }
                } catch {
                  // ignore malformed drag payload
                }
              }}
            >
              {!isServerListCollapsed && (
                Object.keys(hostGroups).length === 0 && !hostsLoading ? (
                  <button
                    onClick={onAddHost}
                    className="w-full mt-1 flex flex-col items-center justify-center gap-2 py-6 px-3 rounded-lg border border-dashed border-slate-300 dark:border-white/10 bg-white dark:bg-white/2 hover:border-amber-400/60 hover:bg-amber-500/5 dark:hover:bg-amber-500/10 transition-all group/add-host cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center group-hover/add-host:bg-amber-500/10 group-hover/add-host:border-amber-400/40 transition-all">
                      <Icon name="add" size="17px" weight={300} className="text-slate-400 group-hover/add-host:text-amber-500 transition-colors" />
                    </div>
                    <div className="text-center">
                      <p className="text-13 font-semibold text-slate-500 dark:text-slate-400 group-hover/add-host:text-slate-700 dark:group-hover/add-host:text-slate-300 transition-colors">{CM.addFirstHostTitle}</p>
                      <p className="text-12 text-slate-400 dark:text-slate-500 mt-0.5">{CM.addFirstHostMsg}</p>
                    </div>
                  </button>
                ) : (
                  <div className="relative">
                    {hostsLoading && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-black/20 rounded" />
                    )}
                    <HostGroupTree
                      hostGroups={hostGroups}
                      selectedGroupUid={selectedGroupUid}
                      selectedHostUid={selectedHostUid}
                      authorizedHosts={authorizedHosts}
                      haInfo={haInfo}
                      onContextMenu={handleContextMenu}
                      onGroupContextMenu={handleGroupContextMenu}
                      onHostActivate={handleHostLogin}
                      selectedHostUids={selectedHostUids}
                      onSelectedHostUidsChange={setSelectedHostUids}
                    />
                  </div>
                )
              )}
            </div>
          </div>

          <div className="h-full flex flex-col overflow-hidden" id="tree-section-container">
            {selectedHostUid ? (
              <>
                <div
                  className={`flex-none px-3 py-2 border-b border-t border-slate-200 dark:border-white/5 flex items-center justify-between cursor-pointer transition-all duration-300 group/tree-header
                    ${!isTreeCollapsed
                      ? 'bg-white dark:bg-bk-side'
                      : 'bg-slate-50 dark:bg-white/2 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  onClick={toggleTreeCollapse}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all duration-200
                      ${!isTreeCollapsed ? 'text-amber-500' : 'text-slate-400 group-hover/tree-header:text-amber-500'}`}>
                      <Icon
                        name="chevron_right"
                        size="xs"
                        className={`transition-transform duration-300 ${!isTreeCollapsed ? 'rotate-90' : ''}`}
                        weight={300}
                      />
                    </div>
                    <Typography variant="caption" className={`font-bold text-13 uppercase tracking-widest transition-colors
                      ${!isTreeCollapsed ? 'text-slate-600 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500 group-hover/tree-header:text-amber-500'}`}>
                      {CM.resourcesHeader}
                    </Typography>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isTreeCollapsed ? (
                      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-amber-500/10 border border-amber-500/20 animate-in fade-in zoom-in-95 duration-200">
                        <Icon
                          name={activeTab === 'db' ? 'database' : activeTab === 'broker' ? 'hub' : 'description'}
                          size="12px"
                          className="text-amber-500"
                          weight={400}
                        />
                        <span className="text-11 font-bold text-amber-600 dark:text-amber-500 uppercase tracking-tight">
                          {activeTab === 'db' ? 'DB' : activeTab === 'broker' ? CM.broker : CM.log}
                        </span>
                      </div>
                    ) : (
                      authorizedHosts.includes(selectedHostUid) && (
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse" />
                      )
                    )}
                  </div>
                </div>

                {!isTreeCollapsed && (
                  <>
                    <TreeTabHeader 
                      activeTab={activeTab} 
                      setActiveTab={setActiveTab} 
                      onDbTabContextMenu={handleDbRootContextMenu} 
                      onBrokerTabContextMenu={handleBrokerRootContextMenu}
                      onLogTabContextMenu={handleLogTabContextMenu}
                    />

                    <div
                      className="flex-1 overflow-y-auto px-4 pb-4 relative min-h-[200px]"
                      onContextMenu={(e) => {
                        // Tree rows stopPropagation() on their own context menu (see
                        // TreeNode.jsx), so this only ever fires for genuinely blank
                        // space — including below a short list, which the per-tree
                        // root handlers (wrapped tightly around their own content)
                        // never covered.
                        if (activeTab === 'db') handleDbRootContextMenu(e);
                        else if (activeTab === 'broker') handleBrokerRootContextMenu(e);
                        else if (activeTab === 'log') handleLogTabContextMenu(e);
                      }}
                    >
                      {/* States Overlay - Full screen fixed overlay directly handled by component */}
                      {sidebarActionLoading && (
                        <RefreshingOverlay 
                          show={true} 
                          title={loadingText} 
                          className="fixed"
                        />
                      )}
                      
                      {isLoggingIntoHost && (
                    <div className="absolute inset-0 bg-white/80 dark:bg-bk-side z-210 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
                      <div className="size-16 border-4 border-bk-yellow/10 border-t-bk-yellow rounded-full animate-spin mb-6 shadow-[0_0_15px_rgba(255,193,7,0.2)]"></div>
                      <Typography variant="p" className="text-sm font-bold text-slate-900 dark:text-bk-yellow tracking-wide">{CM.hostLoginTitle}</Typography>
                      <Typography variant="caption" className="text-slate-500 mt-1 dark:text-slate-400">{CM.establishingSession}</Typography>
                    </div>
                  )}

                  {!isLoggingIntoHost && hostAuthErrors[selectedHostUid] && (
                    <div className="absolute inset-0 bg-white dark:bg-bk-side z-210 flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 duration-200">
                      <div className="size-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
                        <Icon name="error" className="text-rose-500"  weight={300} />
                      </div>
                      <Typography variant="p" className="text-sm font-bold text-rose-500 mb-1">{CM.connectionFailed}</Typography>
                      <Typography variant="caption" className="text-slate-500 dark:text-slate-400 mb-6 px-4">{hostAuthErrors[selectedHostUid]}</Typography>
                      <Button variant="primary" size="sm" onClick={() => handleHostLogin(selectedHostUid)} className="px-8 h-9 shadow-[0_4px_12px_rgba(255,193,7,0.3)] text-15 font-medium">{CM.tryAgain}</Button>
                    </div>
                  )}


                  <div
                    className={`mt-2 ${(!authorizedHosts.includes(selectedHostUid) || isLoggingIntoHost) ? 'opacity-20 blur-[1px] pointer-events-none' : 'opacity-100'}`}
                    id="db-tree-container"
                    data-authorized={authorizedHosts.includes(selectedHostUid) && !isLoggingIntoHost}
                  >
                    <div className={activeTab !== 'db' ? 'hidden' : ''}>
                      <DatabaseTree
                        key={selectedHostUid}
                        onContextMenu={handleDbContextMenu}
                        onRootContextMenu={handleDbRootContextMenu}
                        onUsersContextMenu={handleUsersContextMenu}
                        onUserContextMenu={handleUserContextMenu}
                        onBackupPlanContextMenu={handleBackupPlanContextMenu}
                        onSpaceContextMenu={handleSpaceContextMenu}
                        onBackupItemContextMenu={handleBackupItemContextMenu}
                        onQueryPlanContextMenu={handleQueryPlanContextMenu}
                        onQueryItemContextMenu={handleQueryItemContextMenu}
                      />
                    </div>
                    <div id="broker-tree-container" className={activeTab !== 'broker' ? 'hidden' : ''}>
                      <BrokerTree
                        key={selectedHostUid}
                        hostUid={selectedHostUid}
                        onContextMenu={handleBrokerContextMenu}
                        onSqlLogContextMenu={handleSqlLogContextMenu}
                      />
                    </div>
                    <div className={activeTab !== 'log' ? 'hidden' : ''}>
                      <LogTree
                        key={selectedHostUid}
                        hostUid={selectedHostUid}
                        onDbLogContextMenu={handleDbLogContextMenu}
                        onBrokerLogRootContextMenu={handleBrokerLogRootContextMenu}
                        onBrokerErrorLogContextMenu={handleBrokerErrorLogContextMenu}
                        onAdminLogContextMenu={handleAdminLogContextMenu}
                        onManagerLogContextMenu={handleManagerLogContextMenu}
                        onServerLogRootContextMenu={handleServerLogRootContextMenu}
                      />
                    </div>
                  </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              <SidebarEmptyState />
            )}
          </div>
        </SplitPane>

        <BackgroundJobsPanel
          jobs={backgroundJobs}
          activeCount={backgroundJobActiveCount}
          expanded={backgroundJobsExpanded}
          onToggleExpanded={() => setBackgroundJobsExpanded((v) => !v)}
          onDismiss={dismissBackgroundJob}
          onClearCompleted={clearCompletedBackgroundJobs}
        />
      </aside>

      {/* Context Menus */}
      {contextMenu && (
        <ContextMenuWrapper x={contextMenu.mouseX} y={contextMenu.mouseY} onClose={() => setContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.server}: <span className="normal-case">{contextMenu.server}</span></Typography>
            <Icon name="dns" size="xs" className="opacity-30" weight={300} />
          </div>
          {authorizedHosts.includes(contextMenu.hostUid) ? (
            <MenuItem
              icon="power_settings_new" 
              label={CM.disconnect}
              onClick={() => {
                const hostUid = contextMenu.hostUid;
                const alias = contextMenu.alias;
                setContextMenu(null);
                requestActionConfirm({
                  title: CM.confirmDisconnectHostTitle,
                  description: CM.confirmDisconnectHostDesc(alias),
                  confirmLabel: CM.disconnect,
                  variant: 'danger',
                  run: () => {
                    dispatch(revokeHostLogin(hostUid));
                    dispatch(closeHostTabs(hostUid));
                    if (selectedHostUid === hostUid) {
                      dispatch(setSelectedHost(null));
                      dispatch(resetDatabaseState());
                      dispatch(resetBrokerState());
                    }
                    dispatch(clearHostSummary(hostUid));
                  },
                });
              }}
            />
          ) : (
            <MenuItem
              icon="login" 
              label={CM.connect}
              onClick={() => {
                const hostUid = contextMenu.hostUid;
                handleHostLogin(hostUid);
                setContextMenu(null);
              }}
            />
          )}
          <MenuItem
            icon="space_dashboard"
            label={CM.openDashboard}
            onClick={() => {
              const hostUid = contextMenu.hostUid;
              setContextMenu(null);
              handleHostLogin(hostUid);
            }}
          />
          <MenuDivider />
          <MenuItem
            icon="play_arrow"
            label={CM.startService}
            disabled={!authorizedHosts.includes(contextMenu.hostUid) || sidebarActionLoading}
            onClick={() => {
              const hostUid = contextMenu.hostUid;
              setContextMenu(null);
              handleServiceAction(hostUid, 'start');
            }}
          />
          <MenuItem
            icon="stop"
            label={CM.stopService}
            disabled={!authorizedHosts.includes(contextMenu.hostUid) || sidebarActionLoading}
            onClick={() => {
              const hostUid = contextMenu.hostUid;
              const serverName = contextMenu.alias || contextMenu.server || hostUid;
              setContextMenu(null);
              requestStopService(hostUid, serverName);
            }}
          />
          <MenuDivider />
          <MenuItem icon="add_box" label={CM.addHost} onClick={() => { onAddHost(); setContextMenu(null); }} />
          <MenuItem icon="edit" label={CM.editHost} onClick={() => { dispatch(openEditHostModal(contextMenu.hostUid)); setContextMenu(null); }} />
          <MenuItem icon="delete" label={CM.deleteHost} onClick={() => { dispatch(openDeleteHostModal({ hostUid: contextMenu.hostUid, alias: contextMenu.alias })); setContextMenu(null); }} />
          <MenuDivider />
          <MenuItem 
            icon="lock" 
            label={CM.changePassword} 
            disabled={!(selectedHostUid === contextMenu.hostUid && authorizedHosts.includes(contextMenu.hostUid))}
            onClick={() => { dispatch(openChangePasswordModal(contextMenu.hostUid)); setContextMenu(null); }} 
          />
          <MenuItem 
            icon="supervisor_account" 
            label={CM.userManagement} 
            disabled={!(selectedHostUid === contextMenu.hostUid && authorizedHosts.includes(contextMenu.hostUid))}
            onClick={() => { dispatch(openCmsUserManagementModal()); setContextMenu(null); }} 
          />
          <MenuItem icon="info" label={CM.serverVersion} onClick={() => { dispatch(openServerVersionModal(contextMenu.hostUid)); setContextMenu(null); }} />
        </ContextMenuWrapper>
      )}

      {bulkHostContextMenu && (
        <ContextMenuWrapper x={bulkHostContextMenu.mouseX} y={bulkHostContextMenu.mouseY} onClose={() => setBulkHostContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">
              {CM.selectedHostsCountLabel(bulkHostContextMenu.hostUids.length)}
            </Typography>
            <Icon name="dns" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem icon="login" label={CM.loginSelectedHosts} onClick={handleBulkLoginSelected} />
          <SubMenu icon="drive_file_move" label={CM.moveToGroupMenu}>
            <MenuItem icon="folder_off" label={CM.ungroupedHosts} onClick={() => handleBulkMoveSelected(UNGROUPED_GROUP_ID)} />
            {orderedGroupEntries(hostGroups)
              .filter(([groupId]) => groupId !== UNGROUPED_GROUP_ID)
              .map(([groupId, group]) => (
                <MenuItem key={groupId} icon="folder" label={group.name} onClick={() => handleBulkMoveSelected(groupId)} />
              ))}
          </SubMenu>
          <MenuDivider />
          <MenuItem
            icon="delete"
            label={CM.deleteSelectedHosts}
            onClick={() => {
              const uids = bulkHostContextMenu.hostUids;
              setBulkHostContextMenu(null);
              setBulkDeleteHostConfirm({ hostUids: uids });
            }}
          />
        </ContextMenuWrapper>
      )}

      {groupContextMenu && (
        <ContextMenuWrapper x={groupContextMenu.mouseX} y={groupContextMenu.mouseY} onClose={() => setGroupContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">
              {CM.groupColonLabel(groupContextMenu.groupName)}
            </Typography>
            <Icon name="folder" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            onClick={() => {
              dispatch(refreshServerList());
              setGroupContextMenu(null);
            }}
          />
          <MenuDivider />
          <MenuItem
            icon="create_new_folder"
            label={CM.newGroup}
            onClick={() => {
              dispatch(openCreateGroupModal());
              setGroupContextMenu(null);
            }}
          />
          {!groupContextMenu.groupId && (
            <>
            <MenuItem
              icon="add_link"
              label={CM.addNode}
              onClick={() => {
                dispatch(openAddHostModal({ groupId: '', alias: '', address: '', port: '8001', id: 'admin', password: '' }));
                setGroupContextMenu(null);
              }}
            />
            {hosts.length > 0 && (
              <MenuItem
                icon="login"
                label={CM.loginAll}
                disabled={isLoggingIntoHost || pendingLoginCount === 0}
                onClick={() => {
                  handleLoginAll(null);
                  setGroupContextMenu(null);
                }}
              />
            )}
            </>
          )}
          {groupContextMenu.groupId && (
            <>
            <MenuItem
              icon="add_link"
              label={CM.addNodeToGroup}
              onClick={() => {
                dispatch(openAddHostModal({ groupId: groupContextMenu.groupId, alias: '', address: '', port: '8001', id: 'admin', password: '' }));
                setGroupContextMenu(null);
              }}
            />
            <MenuItem
              icon="login"
              label={CM.loginAll}
              disabled={
                isLoggingIntoHost
                || getUnauthorizedHostUids(hostGroups, authorizedHosts, groupContextMenu.groupId).length === 0
              }
              onClick={() => {
                handleLoginAll(groupContextMenu.groupId);
                setGroupContextMenu(null);
              }}
            />
          <MenuDivider />
          {groupContextMenu.groupId !== UNGROUPED_GROUP_ID && (
            <>
          <MenuItem
            icon="group_work"
            label={CM.manageGroupMembers}
            onClick={() => {
              dispatch(openManageGroupMembersModal({ groupId: groupContextMenu.groupId, name: groupContextMenu.groupName }));
              setGroupContextMenu(null);
            }}
          />
          <MenuDivider />
          <MenuItem
            icon="edit"
            label={CM.renameGroup}
            onClick={() => {
              dispatch(openRenameGroupModal({ groupId: groupContextMenu.groupId, name: groupContextMenu.groupName }));
              setGroupContextMenu(null);
            }}
          />
          <MenuDivider />
          <MenuItem
            icon="delete"
            label={CM.deleteGroup}
            onClick={() => {
              dispatch(openDeleteGroupModal({ groupId: groupContextMenu.groupId, name: groupContextMenu.groupName }));
              setGroupContextMenu(null);
            }}
          />
            </>
          )}
            </>
          )}
        </ContextMenuWrapper>
      )}

      {dbContextMenu && (
        <ContextMenuWrapper x={dbContextMenu.mouseX} y={dbContextMenu.mouseY} onClose={() => setDbContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.database}: <span className="normal-case">{dbContextMenu.db}</span></Typography>
            <Icon name="database" size="xs" className="opacity-30" weight={300} />
          </div>
          {dbContextMenu.isActive ? (
            <MenuItem
              icon="stop"
              label={CM.stopDatabase}
              disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              onClick={() => {
                const dbName = dbContextMenu.db;
                setDbContextMenu(null);
                requestActionConfirm({
                  title: CM.confirmStopDatabaseTitle,
                  description: CM.confirmStopDatabaseDesc(dbName),
                  confirmLabel: CM.stopDatabase,
                  variant: 'danger',
                  run: async () => {
                    setLoadingText(`${CM.stoppingDbNamed(dbName)} ...`);
                    startAction();
                    try {
                      await dispatch(stopDatabase({ hostUid: selectedHostUid, dbname: dbName })).unwrap();
                      dispatch(fetchDatabaseStartInfo(selectedHostUid));
                      resetAction();
                    } catch (err) {
                      // CMS stopdb may time out even when DB has actually stopped.
                      // Always re-sync so the tree reflects the real state.
                      dispatch(fetchDatabaseStartInfo(selectedHostUid));
                      endError(err);
                    }
                  },
                });
              }}
            />
          ) : (
            <MenuItem
              icon="play_arrow"
              label={CM.startDatabase}
              disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              onClick={() => {
                const dbName = dbContextMenu.db;
                setDbContextMenu(null);
                requestActionConfirm({
                  title: CM.confirmStartDatabaseTitle,
                  description: CM.confirmStartDatabaseDesc(dbName),
                  confirmLabel: CM.startDatabase,
                  variant: 'primary',
                  run: async () => {
                    setLoadingText(`${CM.startingDbNamed(dbName)} ...`);
                    startAction();
                    try {
                      await dispatch(startDatabase({ hostUid: selectedHostUid, dbname: dbName })).unwrap();
                      dispatch(fetchDatabaseStartInfo(selectedHostUid));
                      resetAction();
                    } catch (err) {
                      endError(err);
                    }
                  },
                });
              }}
            />
          )}
          {!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db)) && (
            <MenuItem
              icon="login"
              label={CM.loginDatabase}
              onClick={() => {
                const dbname = dbContextMenu.db;
                setDbContextMenu(null);
                // Same rule DatabaseTree's double-click activation uses: a
                // saved profile logs in without asking for the password
                // again — but still visibly, with a loading state and a
                // completion confirmation, not silently in the background.
                // The modal (full manual entry) is only for when there's
                // nothing saved to log in with yet.
                if (databases.find((d) => d.dbname === dbname)?.isProfileExists) {
                  setLoadingText(`${CM.loggingInto(dbname)} ...`);
                  startAction();
                  dispatch(loginDatabase({ hostUid: selectedHostUid, dbname }))
                    .unwrap()
                    .then(() => {
                      resetAction();
                      dispatch(showStatusModal({
                        type: 'success',
                        title: CM.loginDatabase,
                        message: CM.connectionSuccessful,
                      }));
                    })
                    .catch((err) => endError(err));
                } else {
                  dispatch(setSelectedDatabase(dbname));
                  dispatch(openLoginDatabaseModal(dbname));
                }
              }}
            />
          )}
          {loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db)) && (
            <MenuItem
              icon="logout"
              label={CM.logoutDatabase}
              onClick={() => {
                const dbname = dbContextMenu.db;
                setDbContextMenu(null);
                requestActionConfirm({
                  title: CM.confirmLogoutDatabaseTitle,
                  description: CM.confirmLogoutDatabaseDesc(dbname),
                  confirmLabel: CM.logoutDatabase,
                  variant: 'primary',
                  run: async () => {
                    setLoadingText(CM.processing);
                    startAction();
                    try {
                      await dispatch(logoutDatabase({ hostUid: selectedHostUid, dbname })).unwrap();
                      resetAction();
                      dispatch(showStatusModal({
                        type: 'success',
                        title: CM.logoutDatabase,
                        message: CM.logoutDatabaseSuccessMsg(dbname),
                      }));
                    } catch (err) {
                      endError(err);
                    }
                  },
                });
              }}
            />
          )}
          {databases.find((d) => d.dbname === dbContextMenu.db)?.isProfileExists && (
            <>
              <MenuItem
                icon="key"
                label={CM.updateDatabaseCredentials}
                onClick={() => {
                  dispatch(setSelectedDatabase(dbContextMenu.db));
                  dispatch(openLoginDatabaseModal(dbContextMenu.db));
                  setDbContextMenu(null);
                }}
              />
              <MenuItem
                icon="key_off"
                label={CM.forgetDatabaseCredentials}
                onClick={() => {
                  const dbname = dbContextMenu.db;
                  setDbContextMenu(null);
                  requestActionConfirm({
                    title: CM.confirmForgetCredentialsTitle,
                    description: CM.confirmForgetCredentialsDesc(dbname),
                    confirmLabel: CM.forgetDatabaseCredentials,
                    variant: 'danger',
                    run: async () => {
                      setLoadingText(CM.processing);
                      startAction();
                      try {
                        await dispatch(deleteDatabaseProfile({ hostUid: selectedHostUid, dbname })).unwrap();
                        resetAction();
                      } catch (err) {
                        endError(err);
                      }
                    },
                  });
                }}
              />
            </>
          )}
          <MenuDivider />
          <SubMenu icon="settings" label={CM.manageDatabase}>
            <MenuItem
              icon="upload"
              label={CM.manageDatabaseMenu.unload}
              disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openUnloadDatabaseModal(dbContextMenu.db)); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="download"
              label={CM.manageDatabaseMenu.load}
              disabled={dbContextMenu.isActive || !loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db)) || isSelectedDbInHa}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openLoadDatabaseModal(dbContextMenu.db)); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="check_circle"
              label={CM.manageDatabaseMenu.check}
              disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openCheckDatabaseModal()); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="compress"
              label={CM.manageDatabaseMenu.compact}
              disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openCompactDatabaseModal()); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="add_to_drive"
              label={CM.manageDatabaseMenu.addVol}
              disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openAddVolumeModal()); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="auto_fix_high"
              label={CM.manageDatabaseMenu.optimize}
              disabled={dbContextMenu.isActive || !loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openOptimizeDatabaseModal()); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="content_copy"
              label={CM.manageDatabaseMenu.copy}
              disabled={dbContextMenu.isActive || !loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openCopyDatabaseModal()); setDbContextMenu(null); }}
            />
            <MenuDivider />
            <MenuItem
              icon="drive_file_rename_outline"
              label={CM.manageDatabaseMenu.rename}
              disabled={dbContextMenu.isActive || !loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db)) || isSelectedDbInHa}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openRenameDatabaseModal()); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="restore"
              label={CM.manageDatabaseMenu.restore}
              disabled={dbContextMenu.isActive || !loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db)) || isSelectedDbInHa}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openRestoreDatabaseModal()); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="backup"
              label={CM.manageDatabaseMenu.backup}
              disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openBackupDatabaseModal()); setDbContextMenu(null); }}
            />
            <MenuDivider />
            <MenuItem
              icon="delete"
              label={CM.manageDatabaseMenu.delete}
              disabled={dbContextMenu.isActive || !loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db)) || isSelectedDbInHa}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openDeleteDatabaseModal(dbContextMenu.db)); setDbContextMenu(null); }}
            />
          </SubMenu>

          <SubMenu icon="info" label={CM.databaseInfoMenu} width="w-52">
            <MenuItem
              icon="lock_open"
              label={`${CM.lockingInformation}...`}
              disabled={!dbContextMenu.isActive || !loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openLockInformationModal()); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="swap_horiz"
              label={`${CM.transactionInformation}...`}
              disabled={!dbContextMenu.isActive || !loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openTransactionInfoModal()); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="data_object"
              label={`${CM.paramDump}`}
              disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              onClick={() => {
                dispatch(setSelectedDatabase(dbContextMenu.db));
                dispatch(openDatabaseInfoModal());
                setDbContextMenu(null);
              }}
            />
            <MenuItem
              icon="schema"
              label={`${CM.planDump}`}
              disabled={!dbContextMenu.isActive || !loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              onClick={() => {
                dispatch(setSelectedDatabase(dbContextMenu.db));
                dispatch(openPlanDumpModal());
                setDbContextMenu(null);
              }}
            />
          </SubMenu>

          <MenuDivider />
          <MenuItem
            icon="tune"
            label={CM.properties}
            disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
            onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openDatabasePropertyModal()); setDbContextMenu(null); }}
          />
          <MenuDivider />
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            onClick={() => {
              dispatch(fetchDatabaseStartInfo(selectedHostUid));
              setDbContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}

      {dbRootContextMenu && (
        <ContextMenuWrapper x={dbRootContextMenu.mouseX} y={dbRootContextMenu.mouseY} onClose={() => setDbRootContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.allDatabases}</Typography>
            <Icon name="database" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="play_circle"
            label={CM.startAllDatabases}
            onClick={() => {
              setDbRootContextMenu(null);
              requestActionConfirm({
                title: CM.confirmStartAllDatabasesTitle,
                description: CM.confirmStartAllDatabasesDesc,
                confirmLabel: CM.startAllDatabases,
                variant: 'primary',
                run: async () => {
                  setLoadingText(CM.startingAllDatabasesMsg);
                  startAction();
                  try {
                    for (const db of databases) {
                      if (!activeDatabases.includes(db.dbname)) {
                        await dispatch(startDatabase({ hostUid: selectedHostUid, dbname: db.dbname })).unwrap();
                      }
                    }
                    dispatch(fetchDatabaseStartInfo(selectedHostUid));
                    resetAction();
                  } catch (err) {
                    endError(err);
                  }
                },
              });
            }}
          />
          <MenuItem
            icon="stop_circle"
            label={CM.stopAllDatabases}
            onClick={() => {
              setDbRootContextMenu(null);
              requestActionConfirm({
                title: CM.confirmStopAllDatabasesTitle,
                description: CM.confirmStopAllDatabasesDesc,
                confirmLabel: CM.stopAllDatabases,
                variant: 'danger',
                run: async () => {
                  setLoadingText(CM.stoppingAllDatabasesMsg);
                  startAction();
                  try {
                    for (const dbname of activeDatabases) {
                      await dispatch(stopDatabase({ hostUid: selectedHostUid, dbname })).unwrap();
                    }
                    dispatch(fetchDatabaseStartInfo(selectedHostUid));
                    resetAction();
                  } catch (err) {
                    endError(err);
                  }
                },
              });
            }}
          />
          <MenuItem
            icon="restart_alt"
            label={CM.restartAllDatabases}
            onClick={() => {
              setDbRootContextMenu(null);
              requestActionConfirm({
                title: CM.confirmRestartAllDatabasesTitle,
                description: CM.confirmRestartAllDatabasesDesc,
                confirmLabel: CM.restartAllDatabases,
                variant: 'danger',
                run: async () => {
                  setLoadingText(CM.restartingAllDatabasesMsg);
                  startAction();
                  try {
                    const currentActive = [...activeDatabases];
                    for (const dbname of currentActive) {
                      await dispatch(stopDatabase({ hostUid: selectedHostUid, dbname })).unwrap();
                    }
                    for (const dbname of currentActive) {
                      await dispatch(startDatabase({ hostUid: selectedHostUid, dbname })).unwrap();
                    }
                    dispatch(fetchDatabaseStartInfo(selectedHostUid));
                    resetAction();
                  } catch (err) {
                    endError(err);
                  }
                },
              });
            }}
          />
          <MenuDivider />
          <MenuItem
            icon="add_circle"
            label={CM.createDatabase}
            onClick={() => {
              setDbRootContextMenu(null);
              dispatch(openCreateDatabaseModal());
            }}
          />
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            onClick={() => {
              setDbRootContextMenu(null);
              dispatch(fetchDatabaseStartInfo(selectedHostUid));
            }}
          />
          <MenuDivider />
          <MenuItem icon="tune" label={CM.properties} onClick={() => { setDbRootContextMenu(null); dispatch(setSelectedDatabase(null)); dispatch(openDatabasePropertyModal()); }} />
        </ContextMenuWrapper>
      )}

      {brokerRootContextMenu && (
        <ContextMenuWrapper x={brokerRootContextMenu.mouseX} y={brokerRootContextMenu.mouseY} onClose={() => setBrokerRootContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.allBrokers}</Typography>
            <Icon name="hub" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="play_circle"
            label={CM.startAllBrokers}
            onClick={() => {
              setBrokerRootContextMenu(null);
              requestActionConfirm({
                title: CM.confirmStartAllBrokersTitle,
                description: CM.confirmStartAllBrokersDesc,
                confirmLabel: CM.startAllBrokers,
                variant: 'primary',
                run: async () => {
                  setLoadingText(CM.startingAllBrokersMsg);
                  startAction();
                  try {
                    await dispatch(startAllBrokers(selectedHostUid)).unwrap();
                    resetAction();
                  } catch (err) {
                    endError(err);
                  }
                },
              });
            }}
          />
          <MenuItem
            icon="stop_circle"
            label={CM.stopAllBrokers}
            onClick={() => {
              setBrokerRootContextMenu(null);
              requestActionConfirm({
                title: CM.confirmStopAllBrokersTitle,
                description: CM.confirmStopAllBrokersDesc,
                confirmLabel: CM.stopAllBrokers,
                variant: 'danger',
                run: async () => {
                  setLoadingText(CM.stoppingAllBrokersMsg);
                  startAction();
                  try {
                    await dispatch(stopAllBrokers(selectedHostUid)).unwrap();
                    resetAction();
                  } catch (err) {
                    endError(err);
                  }
                },
              });
            }}
          />
          <MenuItem
            icon="restart_alt"
            label={CM.restartAllBrokers}
            onClick={() => {
              setBrokerRootContextMenu(null);
              requestActionConfirm({
                title: CM.confirmRestartAllBrokersTitle,
                description: CM.confirmRestartAllBrokersDesc,
                confirmLabel: CM.restartAllBrokers,
                variant: 'danger',
                run: async () => {
                  setLoadingText(CM.restartingAllBrokersMsg);
                  startAction();
                  try {
                    await dispatch(stopAllBrokers(selectedHostUid)).unwrap();
                    await dispatch(startAllBrokers(selectedHostUid)).unwrap();
                    resetAction();
                  } catch (err) {
                    endError(err);
                  }
                },
              });
            }}
          />
          <MenuDivider />
          <MenuItem
            icon="settings"
            label={CM.editBrokerConfig}
            onClick={() => {
              setBrokerRootContextMenu(null);
              if (selectedHostUid) {
                dispatch(openTab(`broker_config:${selectedHostUid}`));
              }
            }}
          />
          <MenuItem
            icon="info"
            label={CM.showStatus}
            onClick={() => {
              setBrokerRootContextMenu(null);
              if (selectedHostUid) {
                dispatch(openTab(`brokers_status:${selectedHostUid}`));
              }
            }}
          />
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            onClick={async () => {
              setBrokerRootContextMenu(null);
              const updatedBrokers = await dispatch(fetchBrokerList(selectedHostUid)).unwrap().catch(() => brokers);
              updatedBrokers.forEach(broker => {
                dispatch(fetchBrokerLogs({ hostUid: selectedHostUid, brokerName: broker.name }));
              });
            }}
          />
        </ContextMenuWrapper>
      )}

      {brokerContextMenu && (
        <ContextMenuWrapper x={brokerContextMenu.mouseX} y={brokerContextMenu.mouseY} onClose={() => setBrokerContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.broker}: <span className="normal-case">{brokerContextMenu.broker}</span></Typography>
            <Icon name="hub" size="xs" className="opacity-30" weight={300} />
          </div>
          {brokerContextMenu.state === 'ON' ? (
            <MenuItem
              icon="stop"
              label={CM.stopBroker}
              onClick={() => {
                const bName = brokerContextMenu.broker;
                setBrokerContextMenu(null);
                requestActionConfirm({
                  title: CM.confirmStopBrokerTitle,
                  description: CM.confirmStopBrokerDesc(bName),
                  confirmLabel: CM.stopBroker,
                  variant: 'danger',
                  run: async () => {
                    setLoadingText(`${CM.stoppingBrokerNamed(bName)} ...`);
                    startAction();
                    try {
                      await dispatch(stopBroker({ hostUid: selectedHostUid, brokerName: bName })).unwrap();
                      dispatch(fetchBrokerList(selectedHostUid));
                      resetAction();
                    } catch (err) {
                      endError(err);
                    }
                  },
                });
              }}
            />
          ) : (
            <MenuItem
              icon="play_arrow"
              label={CM.startBroker}
              onClick={() => {
                const bName = brokerContextMenu.broker;
                setBrokerContextMenu(null);
                requestActionConfirm({
                  title: CM.confirmStartBrokerTitle,
                  description: CM.confirmStartBrokerDesc(bName),
                  confirmLabel: CM.startBroker,
                  variant: 'primary',
                  run: async () => {
                    setLoadingText(`${CM.startingBrokerNamed(bName)} ...`);
                    startAction();
                    try {
                      await dispatch(startBroker({ hostUid: selectedHostUid, brokerName: bName })).unwrap();
                      dispatch(fetchBrokerList(selectedHostUid));
                      resetAction();
                    } catch (err) {
                      endError(err);
                    }
                  },
                });
              }}
            />
          )}
          <MenuDivider />
          <MenuItem 
            icon="info" 
            label={CM.showStatus} 
            onClick={() => {
              if (selectedHostUid) {
                dispatch(setActiveMainTab(`broker_status:${selectedHostUid}:${brokerContextMenu.broker}`));
              }
              setBrokerContextMenu(null);
            }} 
          />
          <MenuItem
            icon="tune"
            label={CM.properties}
            onClick={() => {
                dispatch(openBrokerPropertyModal({ hostUid: selectedHostUid, brokerName: brokerContextMenu.broker }));
                setBrokerContextMenu(null);
            }}
          />
          <MenuDivider />
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            onClick={() => {
              const bName = brokerContextMenu.broker;
              setBrokerContextMenu(null);
              dispatch(fetchBrokerList(selectedHostUid));
              dispatch(fetchBrokerLogs({ hostUid: selectedHostUid, brokerName: bName }));
            }}
          />
        </ContextMenuWrapper>
      )}

      {sqlLogContextMenu && (
        <ContextMenuWrapper x={sqlLogContextMenu.mouseX} y={sqlLogContextMenu.mouseY} onClose={() => setSqlLogContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.sqlLogs}: <span className="normal-case">{sqlLogContextMenu.broker}</span></Typography>
            <Icon name="history_edu" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="visibility"
            label={CM.viewAllLogs}
            onClick={() => {
              if (selectedHostUid) {
                dispatch(openTab(`all_logs:${selectedHostUid}:${sqlLogContextMenu.broker}`));
              }
              setSqlLogContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}

      {dbLogContextMenu && (
        <ContextMenuWrapper x={dbLogContextMenu.mouseX} y={dbLogContextMenu.mouseY} onClose={() => setDbLogContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.serverLogs}: <span className="normal-case">{dbLogContextMenu.db}</span></Typography>
            <Icon name="dns" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="visibility"
            label={CM.viewAllLogs}
            onClick={() => {
              if (selectedHostUid) {
                dispatch(openTab(`all_db_logs:${selectedHostUid}:${dbLogContextMenu.db}`));
              }
              setDbLogContextMenu(null);
            }}
          />
          <MenuDivider />
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            onClick={() => {
              if (selectedHostUid) {
                dispatch(fetchDatabaseLogs({ hostUid: selectedHostUid, dbname: dbLogContextMenu.db }));
              }
              setDbLogContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}

      {brokerLogRootContextMenu && (
        <ContextMenuWrapper x={brokerLogRootContextMenu.mouseX} y={brokerLogRootContextMenu.mouseY} onClose={() => setBrokerLogRootContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.brokerLogs}</Typography>
            <Icon name="hub" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            onClick={async () => {
              setBrokerLogRootContextMenu(null);
              const updatedBrokers = await dispatch(fetchBrokerList(selectedHostUid)).unwrap().catch(() => brokers);
              updatedBrokers.forEach(broker => {
                dispatch(fetchBrokerLogs({ hostUid: selectedHostUid, brokerName: broker.name }));
              });
            }}
          />
        </ContextMenuWrapper>
      )}

      {brokerErrorLogContextMenu && (
        <ContextMenuWrapper x={brokerErrorLogContextMenu.mouseX} y={brokerErrorLogContextMenu.mouseY} onClose={() => setBrokerErrorLogContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.errorLogs}</Typography>
            <Icon name="report" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            onClick={() => {
              brokers.forEach(broker => {
                dispatch(fetchBrokerLogs({ hostUid: selectedHostUid, brokerName: broker.name }));
              });
              setBrokerErrorLogContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}

      {adminLogContextMenu && (
        <ContextMenuWrapper x={adminLogContextMenu.mouseX} y={adminLogContextMenu.mouseY} onClose={() => setAdminLogContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.adminLogs}</Typography>
            <Icon name="admin_panel_settings" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            onClick={() => {
              dispatch(fetchAdminLogs(selectedHostUid));
              setAdminLogContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}

      {managerLogContextMenu && (
        <ContextMenuWrapper x={managerLogContextMenu.mouseX} y={managerLogContextMenu.mouseY} onClose={() => setManagerLogContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.managerLogs}</Typography>
            <Icon name="manage_accounts" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            onClick={() => {
              dispatch(fetchCMSLogs(selectedHostUid));
              setManagerLogContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}

      {serverLogRootContextMenu && (
        <ContextMenuWrapper x={serverLogRootContextMenu.mouseX} y={serverLogRootContextMenu.mouseY} onClose={() => setServerLogRootContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.serverLogs}</Typography>
            <Icon name="dns" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            onClick={() => {
              (databases || []).forEach(db => {
                dispatch(fetchDatabaseLogs({ hostUid: selectedHostUid, dbname: db.dbname }));
              });
              setServerLogRootContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}

      {logTabContextMenu && (
        <ContextMenuWrapper x={logTabContextMenu.mouseX} y={logTabContextMenu.mouseY} onClose={() => setLogTabContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.log}</Typography>
            <Icon name="receipt_long" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            onClick={() => {
              handleRefreshAllLogs();
              setLogTabContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}


      {usersContextMenu && (
        <ContextMenuWrapper x={usersContextMenu.mouseX} y={usersContextMenu.mouseY} onClose={() => setUsersContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
             <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.users}: <span className="normal-case">{usersContextMenu.db}</span></Typography>
             <Icon name="groups" size="xs" className="opacity-30"  weight={300} />
          </div>
          <MenuItem
            icon="person_add"
            label={CM.addUser}
            disabled={!usersContextMenu.isActive || !usersContextMenu.isLoggedIn}
            onClick={() => {
              dispatch(openCreateUserModal(usersContextMenu.db));
              setUsersContextMenu(null);
            }}
          />
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            disabled={!usersContextMenu.isLoggedIn}
            onClick={() => {
              dispatch(fetchDatabaseUsers({ hostUid: selectedHostUid, dbname: usersContextMenu.db }));
              setUsersContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}

      {userContextMenu && (
        <ContextMenuWrapper x={userContextMenu.mouseX} y={userContextMenu.mouseY} onClose={() => setUserContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-bold text-slate-700 dark:text-slate-200 tracking-widest text-11">{userContextMenu.user}</Typography>
            <Icon name="person" size="xs" className="opacity-30"  weight={300} />
          </div>
          <MenuItem
            icon="edit"
            label={CM.editUser}
            disabled={!userContextMenu.isActive || !userContextMenu.isLoggedIn}
            onClick={() => {
              dispatch(openEditUserModal({ dbname: userContextMenu.db, userName: userContextMenu.user }));
              setUserContextMenu(null);
            }}
          />
          <MenuItem
            icon="person_remove"
            label={CM.deleteUser}
            disabled={!userContextMenu.isActive || !userContextMenu.isLoggedIn}
            onClick={() => {
              dispatch(openDropUserModal({ dbname: userContextMenu.db, userName: userContextMenu.user }));
              setUserContextMenu(null);
            }}
          />
          <MenuDivider />
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            disabled={!userContextMenu.isLoggedIn}
            onClick={() => {
              dispatch(fetchDatabaseUsers({ hostUid: selectedHostUid, dbname: userContextMenu.db }));
              setUserContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}
      {backupPlanContextMenu && (
        <ContextMenuWrapper x={backupPlanContextMenu.mouseX} y={backupPlanContextMenu.mouseY} onClose={() => setBackupPlanContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.backupPlanLabel}</Typography>
            <Icon name="backup" size="xs" className="opacity-30"  weight={300} />
          </div>
          <MenuItem
            icon="add_circle"
            label={CM.createBackupPlan}
            disabled={!backupPlanContextMenu.isLoggedIn}
            onClick={() => {
              dispatch(setSelectedDatabase(backupPlanContextMenu.db));
              dispatch(openAddBackupPlanModal());
              setBackupPlanContextMenu(null);
            }}
          />
          <MenuItem
            icon="history"
            label={CM.autoBackupLog}
            onClick={() => {
              dispatch(setSelectedDatabase(backupPlanContextMenu.db));
              dispatch(openAutoBackupLogModal());
              setBackupPlanContextMenu(null);
            }}
          />
          <MenuDivider />
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            disabled={!backupPlanContextMenu.isLoggedIn}
            onClick={() => {
              if (selectedHostUid) {
                dispatch(fetchBackupSchedule({ hostUid: selectedHostUid, dbname: backupPlanContextMenu.db }));
              }
              setBackupPlanContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}
      {spaceContextMenu && (
        <ContextMenuWrapper x={spaceContextMenu.mouseX} y={spaceContextMenu.mouseY} onClose={() => setSpaceContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.space}: <span className="normal-case">{spaceContextMenu.db}</span></Typography>
            <Icon name="donut_small" size="xs" className="opacity-30"  weight={300} />
          </div>
          <MenuItem
            icon="add_to_drive"
            label={CM.addVolume}
            disabled={!spaceContextMenu.isLoggedIn}
            onClick={() => {
              dispatch(setSelectedDatabase(spaceContextMenu.db));
              dispatch(openAddVolumeModal());
              setSpaceContextMenu(null);
            }}
          />
          <MenuItem
            icon="settings_suggest"
            label={CM.setAutomationVolume}
            disabled={!spaceContextMenu.isLoggedIn}
            onClick={() => {
              dispatch(setSelectedDatabase(spaceContextMenu.db));
              dispatch(openSetAutomationVolumeModal());
              setSpaceContextMenu(null);
            }}
          />
          <MenuItem
            icon="history_edu"
            label={CM.autoVolumeLog}
            onClick={() => {
              dispatch(setSelectedDatabase(spaceContextMenu.db));
              dispatch(openAutoVolumeLogModal());
              setSpaceContextMenu(null);
            }}
          />
          <MenuDivider />
          <MenuItem
            icon="visibility"
            label={CM.viewDatabase}
            onClick={() => {
              dispatch(setActiveMainTab(`db_space:${selectedHostUid}:${spaceContextMenu.db}`));
              setSpaceContextMenu(null);
            }}
          />
          <MenuDivider />
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            disabled={!spaceContextMenu.isLoggedIn}
            onClick={() => {
              dispatch(fetchDatabaseSpaceInfo({ hostUid: selectedHostUid, dbname: spaceContextMenu.db }));
              setSpaceContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}

      {backupItemContextMenu && (
        <ContextMenuWrapper x={backupItemContextMenu.mouseX} y={backupItemContextMenu.mouseY} onClose={() => setBackupItemContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.backup}: <span className="normal-case">{backupItemContextMenu.planId}</span></Typography>
            <Icon name="event_note" size="xs" className="opacity-30"  weight={300} />
          </div>

          <MenuItem
            icon="edit"
            label={CM.editBackupPlan}
            disabled={!backupItemContextMenu.isLoggedIn}
            onClick={() => {
              dispatch(setSelectedDatabase(backupItemContextMenu.db));
              dispatch(setSelectedBackupId(backupItemContextMenu.planId));
              dispatch(openEditBackupPlanModal());
              setBackupItemContextMenu(null);
            }}
          />
          <MenuItem
            icon="delete_forever"
            label={CM.remove}
            disabled={!backupItemContextMenu.isLoggedIn}
            onClick={() => {
              dispatch(setSelectedDatabase(backupItemContextMenu.db));
              dispatch(setSelectedBackupId(backupItemContextMenu.planId));
              dispatch(openDeleteBackupPlanModal());
              setBackupItemContextMenu(null);
            }}
          />
          <MenuDivider />
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            disabled={!backupItemContextMenu.isLoggedIn}
            onClick={() => {
              dispatch(fetchBackupSchedule({ hostUid: selectedHostUid, dbname: backupItemContextMenu.db }));
              setBackupItemContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}

      {queryPlanContextMenu && (
        <ContextMenuWrapper x={queryPlanContextMenu.mouseX} y={queryPlanContextMenu.mouseY} onClose={() => setQueryPlanContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.queryPlan}: <span className="normal-case">{queryPlanContextMenu.db}</span></Typography>
            <Icon name="bolt" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="add_circle"
            label={CM.addQueryPlan}
            disabled={!queryPlanContextMenu.isLoggedIn}
            onClick={() => {
              dispatch(setSelectedDatabase(queryPlanContextMenu.db));
              dispatch(openAddQueryPlanModal());
              setQueryPlanContextMenu(null);
            }}
          />
          <MenuItem
            icon="history"
            label={CM.autoQueryLog}
            onClick={() => {
              dispatch(setSelectedDatabase(queryPlanContextMenu.db));
              dispatch(openAutoQueryLogModal());
              setQueryPlanContextMenu(null);
            }}
          />
          <MenuDivider />
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            disabled={!queryPlanContextMenu.isLoggedIn}
            onClick={() => {
              if (selectedHostUid) {
                dispatch(fetchQueryPlan({ hostUid: selectedHostUid, dbname: queryPlanContextMenu.db }));
              }
              setQueryPlanContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}

      {queryItemContextMenu && (
        <ContextMenuWrapper x={queryItemContextMenu.mouseX} y={queryItemContextMenu.mouseY} onClose={() => setQueryItemContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.queryPlanItem}: <span className="normal-case">{queryItemContextMenu.qId}</span></Typography>
            <Icon name="bolt" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="edit"
            label={CM.editQueryPlan}
            disabled={!queryItemContextMenu.isLoggedIn}
            onClick={() => {
              dispatch(setSelectedDatabase(queryItemContextMenu.db));
              dispatch(openEditQueryPlanModal(queryItemContextMenu.qId));
              setQueryItemContextMenu(null);
            }}
          />
          <MenuItem
            icon="delete_forever"
            label={CM.remove}
            disabled={!queryItemContextMenu.isLoggedIn}
            onClick={() => {
              dispatch(setSelectedDatabase(queryItemContextMenu.db));
              dispatch(openDeleteQueryPlanModal(queryItemContextMenu.qId));
              setQueryItemContextMenu(null);
            }}
          />
          <MenuDivider />
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            disabled={!queryItemContextMenu.isLoggedIn}
            onClick={() => {
              if (selectedHostUid) {
                dispatch(fetchQueryPlan({ hostUid: selectedHostUid, dbname: queryItemContextMenu.db }));
              }
              setQueryItemContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}

      <CMSUserManagementModal />
      <EditCMSUserModal />
      <ConfirmDialog
        isOpen={stopServiceConfirm.isOpen}
        title={CM.stopServicesConfirmTitle}
        description={CM.stopServicesConfirmDesc(stopServiceConfirm.serverName)}
        confirmLabel={CM.stopAllServices}
        variant="danger"
        onConfirm={() => {
          const { hostUid } = stopServiceConfirm;
          closeStopServiceConfirm();
          handleServiceAction(hostUid, 'stop');
        }}
        onCancel={closeStopServiceConfirm}
      />
      <ConfirmDialog
        isOpen={!!bulkDeleteHostConfirm}
        title={CM.bulkDeleteHostsConfirmTitle}
        description={CM.bulkDeleteHostsConfirmDesc(bulkDeleteHostConfirm?.hostUids?.length || 0)}
        confirmLabel={CM.deleteSelectedHosts}
        variant="danger"
        onConfirm={handleBulkDeleteConfirm}
        onCancel={() => setBulkDeleteHostConfirm(null)}
      />
      <ConfirmDialog
        isOpen={!!pendingActionConfirm}
        title={pendingActionConfirm?.title}
        description={pendingActionConfirm?.description}
        confirmLabel={pendingActionConfirm?.confirmLabel || CM.confirm}
        variant={pendingActionConfirm?.variant || 'danger'}
        onConfirm={() => {
          const run = pendingActionConfirm?.run;
          setPendingActionConfirm(null);
          run?.();
        }}
        onCancel={() => setPendingActionConfirm(null)}
      />
      {isSidebarActionError && (
        <Modal isOpen title={CM.actionFailed} icon="error" iconVariant="danger" onClose={resetAction} maxWidth="400px">
          <ModalStatusError
            title={CM.updateInterrupted}
            error={sidebarActionError}
            onCancel={resetAction}
          />
        </Modal>
      )}
    </>
  );
}
