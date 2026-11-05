import { RefreshingOverlay } from '../../../components/ds/feedback/RefreshingOverlay';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSelector, useDispatch , shallowEqual } from 'react-redux';
import {
  setSelectedHost,
  loginHostsBatch,
  openDeleteHostModal,
  openEditHostModal,
  openChangePasswordModal,
  revokeHostLogin,
  forgetHostSession,
  loadHosts,
  openServerVersionModal,
  openCmsUserManagementModal,
  startService,
  stopService,
  moveHost,
  deleteHost,
  refreshServerList
} from '../../host/hostSlice';
import {
  fetchDatabaseStartInfo, startDatabase, stopDatabase,
  loginDatabase, logoutDatabase, deleteDatabaseProfile,
  setSelectedDatabase, resetDatabaseState, clearDatabaseLoginsForHost
} from '../../database/databaseCoreSlice';
import { bulkResultStatusModal, runAllDatabasesAction, serviceSkippedTable } from '../../database/databaseBulkActions';
import { autoStartServers, haModeOn, loginSkipsOf, planLoginCheckedAction, readStartInfoDatabases, restartLoginSkips, runningDbNames, serviceDatabases, serviceStartTargets, serviceStopTargets, stoppedDbNames } from '../../database/loginSkips';
import { hostApi } from '../../host/hostApi';
import { MULTI_BROKER_ACTIONS, runMultiBrokerAction, splitBrokersByAction } from '../../broker/brokerMultiActions';
import { restartHostService } from '../../host/hostServiceRestart';
import {
  MULTI_DB_ACTIONS,
  MULTI_DB_ACTION_ICONS,
  databaseSelectionRows,
  runMultiDatabaseAction,
  splitByAction,
} from '../../database/databaseMultiActions';
import SelectDatabasesModal from '../../database/components/SelectDatabasesModal';
import { hostLoginResultStatusModal } from '../../host/hostLoginReport';
import { dbKey } from '../../database/dbKey';

import { fetchDatabaseSpaceInfo
} from '../../database/databaseMonitoringSlice';

import { fetchBackupSchedule, fetchQueryPlan
} from '../../database/databaseOperationSlice';

import { openUnloadDatabaseModal, openLoadDatabaseModal,
  openCheckDatabaseModal, openCompactDatabaseModal,
  openCopyDatabaseModal, openBackupDatabaseModal,
  openRestoreDatabaseModal, openOptimizeDatabaseModal,
  openAddBackupPlanModal, openEditBackupPlanModal,
  openDeleteBackupPlanModal, openAutoBackupLogModal,
  openLockInformationModal,
  openTransactionInfoModal,
  openDeleteDatabaseModal, openDatabasePropertyModal,
  openRenameDatabaseModal, openAddVolumeModal,
  openDatabaseInfoModal, openPlanDumpModal,
  openAddQueryPlanModal, openAutoQueryLogModal,
  openCreateDatabaseModal, openSetAutomationVolumeModal,
  openAutoVolumeLogModal, openLoginDatabaseModal,
  openEditQueryPlanModal, openDeleteQueryPlanModal,
  setSelectedBackupId
} from '../../database/databaseUISlice';
import { fetchBrokerList,
  fetchBrokerLogs,
  fetchAdminLogs,
  fetchCMSLogs,
  fetchDatabaseLogs,
  openBrokerPropertyModal,
  resetBrokerState
} from '../../broker/brokerSlice';
import {
  startBrokerAndRefresh,
  stopBrokerAndRefresh,
  startAllBrokersAndRefresh,
  stopAllBrokersAndRefresh,
  restartAllBrokersAndRefresh,
} from '../../broker/brokerSidebarActions';
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
import { useCmsJobs } from '../../../infrastructure/hooks/useCmsJobs';
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
import { useRefillNavigatorLists } from '../sidebar/useRefillNavigatorLists';
import { menuOffReason } from '../menuOffReason';

// A selection updater keeping only the names in `namesText` (newline-joined).
const keepOnly = (namesText) => (prev) => {
  const names = new Set(namesText.split('\n'));
  const next = new Set([...prev].filter((name) => names.has(name)));
  return next.size === prev.size ? prev : next;
};

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
  const [serverToolbarMenu, setServerToolbarMenu] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [groupContextMenu, setGroupContextMenu] = useState(null);
  const [dbContextMenu, setDbContextMenu] = useState(null);
  // Ctrl/Shift multi-selection in the database tree, and its context menu.
  const [selectedDbNames, setSelectedDbNames] = useState(() => new Set());
  const [dbMultiContextMenu, setDbMultiContextMenu] = useState(null);
  const [selectedBrokerNames, setSelectedBrokerNames] = useState(() => new Set());
  const [brokerMultiContextMenu, setBrokerMultiContextMenu] = useState(null);
  const [brokerContextMenu, setBrokerContextMenu] = useState(null);
  const [usersContextMenu, setUsersContextMenu] = useState(null);
  const [userContextMenu, setUserContextMenu] = useState(null);
  const [backupPlanContextMenu, setBackupPlanContextMenu] = useState(null);
  const [dbRootContextMenu, setDbRootContextMenu] = useState(null);
  const [spaceContextMenu, setSpaceContextMenu] = useState(null);
  const [queryPlanContextMenu, setQueryPlanContextMenu] = useState(null);
  const [queryItemContextMenu, setQueryItemContextMenu] = useState(null);
  const [, setJobAutomationContextMenu] = useState(null);
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
  const withLoginSkipWarning = (description, skips) => (skips.count > 0 ? (
    <>
      {description}
      <span className="block mt-2 text-amber-600 dark:text-amber-400">{CM.loginSkipWarning(skips.loggedOut, skips.notLoggedIn)}</span>
    </>
  ) : description);
  // A service action on an HA host takes the HA databases down and up with
  // one node-wide ha_stop/ha_start, whatever the logins; its confirm dialog
  // says so, and what that can do to the node.
  const withHaServiceNotes = (description, hasHa, { starts }) => (hasHa ? (
    <>
      {description}
      {[CM.serviceHaNoteLogin, CM.serviceHaNoteRole, ...(starts ? [CM.serviceHaNoteStartFail] : [])].map((note) => (
        <span key={note} className="block mt-1 text-slate-500 dark:text-slate-400">{note}</span>
      ))}
    </>
  ) : description);
  // Confirms a bulk or service action after naming the databases it will
  // skip because the user isn't logged in to them, from a start-info read
  // made as the dialog opens (the server skips them too). `config.run` gets
  // the targets picked from that read. Without a read, or with nothing to
  // run, no dialog opens; a notice says why instead.
  const confirmWithLoginSkips = async (hostUid, pickTargets, config, options) => {
    const plan = await dispatch(planLoginCheckedAction(hostUid, pickTargets, options));
    const notice = {
      readFailed: { type: 'error', message: CM.databaseListReadFailedMsg },
      noTargets: { type: 'info', message: CM.noTargetDatabasesMsg },
      allSkipped: { type: 'info', message: CM.noDatabasesToRunMsg },
    }[plan.outcome];
    if (notice) {
      dispatch(showStatusModal({ ...notice, title: config.confirmLabel }));
      return;
    }
    requestActionConfirm({
      ...config,
      description: withLoginSkipWarning(config.description, plan.skips),
      run: () => config.run(plan.targets),
    });
  };
  // { initialSelected: dbname[] } while the database selection modal is open.
  const [selectDatabasesModal, setSelectDatabasesModal] = useState(null);

  const { hosts, hostGroups, selectedHostUid, selectedGroupUid, loading: hostsLoading, authorizedHosts, isLoggingIntoHost, hostAuthErrors, haInfo } = useSelector((state) => state.host, shallowEqual);
  const { databasesByHost, loggedInDatabases, haDbNamesByHost, navigatorDatabasesByHost, navigatorActiveDatabasesByHost } = useSelector((state) => state.database, shallowEqual);
  const { brokersByHost, navigatorBrokersByHost } = useSelector((state) => state.broker, shallowEqual);
  // The lists the trees show; a multi-selection is kept within them.
  const navigatorDbNames = useSelector(
    (state) => (state.database.navigatorDatabasesByHost?.[state.host.selectedHostUid] || []).map((db) => db.dbname).join('\n')
  );
  const navigatorBrokerNames = useSelector(
    (state) => (state.broker.navigatorBrokersByHost?.[state.host.selectedHostUid] || []).map((b) => b.name).join('\n')
  );
  // Sidebar's BrokerTree/DatabaseTree are keyed by selectedHostUid (fully
  // remounted on host switch) and every list here is scoped to whichever
  // host is currently selected — read straight out of the per-host maps so
  // a still in-flight response for a host the user has since switched away
  // from can never be mistaken for this host's own data.
  const databases = databasesByHost[selectedHostUid] || [];
  // A deleted (or renamed) database or broker leaves the selection, so it
  // can't be acted on unseen, or come back selected under a reused name.
  useEffect(() => {
    setSelectedDbNames(keepOnly(navigatorDbNames));
  }, [navigatorDbNames]);
  useEffect(() => {
    setSelectedBrokerNames(keepOnly(navigatorBrokerNames));
  }, [navigatorBrokerNames]);

  // The database tree remounts per host; its multi-selection starts empty too.
  useEffect(() => {
    setSelectedDbNames(new Set());
    setDbMultiContextMenu(null);
    setSelectedBrokerNames(new Set());
    setBrokerMultiContextMenu(null);
  }, [selectedHostUid]);

  // One action on several selected brokers, one broker at a time.
  const handleMultiBrokerAction = (action, brokers) => {
    const hostUid = selectedHostUid;
    const { targets, skipped: notApplicable } = splitBrokersByAction(action, brokers);
    if (targets.length === 0) return;
    const label = CM.multiDbActions[action];
    requestActionConfirm({
      title: CM.multiBrokerConfirmTitle(label),
      description: CM.multiDbConfirmDesc(label, targets.map((broker) => broker.name)),
      confirmLabel: label,
      variant: action === 'start' ? 'primary' : 'danger',
      run: async () => {
        setLoadingText(CM.processing);
        startAction();
        try {
          const result = await runMultiBrokerAction(dispatch, { hostUid, action, names: targets.map((broker) => broker.name) });
          resetAction();
          const report = bulkResultStatusModal(CM, {
            title: label,
            failedMsg: (count) => CM.multiBrokerFailedMsg(action, count),
            failed: result.failed,
            skipped: notApplicable.map((broker) => ({ dbname: broker.name, reason: CM.multiBrokerNotApplicableReason })),
            showPhase: action === 'restart',
            nameLabel: CM.broker,
            skippedMsg: CM.someBrokersSkippedMsg,
          });
          dispatch(showStatusModal(report || { type: 'success', title: label, message: CM.multiBrokerDoneMsg(action, result.succeeded.length) }));
        } catch (err) {
          endError(err);
        }
      },
    });
  };

  // One action on several selected databases (selection modal or a tree
  // selection): confirm with the HA warning, run, then refresh and report.
  const handleMultiDatabaseAction = (action, rows, credentials) => {
    const hostUid = selectedHostUid;
    const { targets, skipped: notApplicable } = splitByAction(action, rows);
    if (targets.length === 0) return;
    const label = CM.multiDbActions[action];
    const haCount = ['start', 'stop', 'restart'].includes(action) ? targets.filter((row) => row.isHa).length : 0;
    // Start/stop/restart skip the selected databases the user isn't logged in to.
    const confirm = ['start', 'stop', 'restart'].includes(action)
      ? (config) => confirmWithLoginSkips(hostUid, () => targets.map((row) => row.dbname), config)
      : requestActionConfirm;
    confirm({
      title: CM.multiDbConfirmTitle(label),
      description: [
        CM.multiDbConfirmDesc(label, targets.map((row) => row.dbname)),
        haCount > 0 ? CM.multiDbHaWarning(haCount) : '',
      ].filter(Boolean).join(' '),
      confirmLabel: label,
      variant: ['stop', 'restart', 'forgetCredentials'].includes(action) ? 'danger' : 'primary',
      run: async () => {
        setLoadingText(CM.processing);
        startAction();
        try {
          const result = await runMultiDatabaseAction(dispatch, CM, { hostUid, action, rows: targets, credentials });
          dispatch(fetchDatabaseStartInfo(hostUid));
          resetAction();
          const skipped = [
            ...result.skipped,
            ...notApplicable.map((row) => ({ dbname: row.dbname, reason: CM.multiDbNotApplicableReason })),
          ];
          const report = bulkResultStatusModal(CM, {
            title: label, failedMsg: (count) => CM.multiDbFailedMsg(action, count), failed: result.failed, skipped, showPhase: action === 'restart',
          });
          dispatch(showStatusModal(report || { type: 'success', title: label, message: CM.multiDbDoneMsg(action, result.succeeded.length) }));
        } catch (err) {
          dispatch(fetchDatabaseStartInfo(hostUid));
          endError(err);
        }
      },
    });
  };
  const haDbNames = haDbNamesByHost[selectedHostUid] || [];
  const brokers = brokersByHost[selectedHostUid] || [];

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
  // Why a menu item is off, shown on hover (menuOffReason).
  const hostOffReason = (hostUid) => menuOffReason(CM, { hostConnected: authorizedHosts.includes(hostUid) });
  const dbOffReason = (db, { ha = false } = {}) => menuOffReason(CM, {
    dbLoggedIn: loggedInDatabases.includes(dbKey(selectedHostUid, db)),
    haBlocked: ha && isSelectedDbInHa,
  });
  const loginOffReason = (isLoggedIn) => menuOffReason(CM, { dbLoggedIn: isLoggedIn });


  useEffect(() => {
    dispatch(loadHosts());
  }, [dispatch]);

  useRefillNavigatorLists();

  const closeAllContextMenus = useCallback(() => {
    setContextMenu(null);
    setServerToolbarMenu(null);
    setBulkHostContextMenu(null);
    setGroupContextMenu(null);
    setDbContextMenu(null);
    setDbMultiContextMenu(null);
    setBrokerMultiContextMenu(null);
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
      .then((batch) => {
        const report = hostLoginResultStatusModal(CM, { title: CM.loginAll, batch });
        if (report) dispatch(showStatusModal(report));
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
      const { problem, skipped, haNodeFailed } = await dispatch(action === 'start' ? startService(hostUid) : stopService(hostUid)).unwrap();
      resetAction();
      if (problem || skipped.length > 0) {
        dispatch(showStatusModal({
          type: problem ? 'error' : 'info',
          title: action === 'start' ? CM.startService : CM.stopService,
          message: [
            problem,
            action === 'start' && haNodeFailed ? CM.haNodeStartFailedMsg : '',
            skipped.length > 0 ? CM.someDatabasesSkippedMsg(skipped.length) : '',
          ].filter(Boolean).join('\n'),
          tables: skipped.length > 0 ? [serviceSkippedTable(CM, skipped, action)] : [],
        }));
      }
    } catch (err) {
      endError(err);
    }
  };

  // The cubrid.conf parts a service action follows: the autostart list, and
  // whether the host is an HA node (ha_mode). Unreadable: no autostart list,
  // and HA node, so the HA notes still show.
  const readServiceConf = (hostUid) => hostApi.getHostConfig(hostUid, 'cubridconf')
    .then((response) => {
      const lines = response?.conflist?.[0]?.confdata;
      return { autoStart: new Set(autoStartServers(lines)), haNode: haModeOn(lines) };
    })
    .catch(() => ({ autoStart: new Set(), haNode: true }));
  // start-info databases and the service conf, read as a service dialog opens.
  const readServiceState = async (hostUid) => {
    const [databases, { autoStart, haNode }] = await Promise.all([dispatch(readStartInfoDatabases(hostUid)), readServiceConf(hostUid)]);
    return { databases: serviceDatabases(databases, haNode), autoStart };
  };
  // Service start brings up the autostart list and, on an HA host, the HA
  // databases with one node-wide ha_start. The autostart ones not running
  // and not logged in are named before it runs, with the HA notes.
  const requestStartService = async (hostUid) => {
    if (!hostUid) return;
    const { databases, autoStart } = await readServiceState(hostUid);
    const targets = serviceStartTargets(databases, autoStart);
    const skips = loginSkipsOf(databases, targets);
    const hasHa = databases.some((db) => db.isHa);
    if (skips.count === 0 && !hasHa) {
      handleServiceAction(hostUid, 'start');
      return;
    }
    requestActionConfirm({
      title: CM.startService,
      description: withHaServiceNotes(withLoginSkipWarning(null, skips), hasHa, { starts: true }),
      confirmLabel: CM.startService,
      variant: 'primary',
      run: () => handleServiceAction(hostUid, 'start'),
    });
  };

  // Service restart skips the databases the user isn't logged in to at each
  // step: running ones are not stopped and keep running, stopped ones the
  // start would bring up stay stopped. Both are named before it runs.
  const requestRestartService = async (hostUid, serverName) => {
    if (!hostUid) return;
    const { databases, autoStart } = await readServiceState(hostUid);
    const { keepsRunning, notStarted } = restartLoginSkips(databases, autoStart);
    const hasHa = databases.some((db) => db.isHa);
    const description = withHaServiceNotes(keepsRunning.length + notStarted.length === 0 ? CM.confirmRestartServiceDesc(serverName) : (
      <>
        {CM.confirmRestartServiceDesc(serverName)}
        {keepsRunning.length > 0 && <span className="block mt-2 text-amber-600 dark:text-amber-400">{CM.restartSkipKeepsRunningMsg(keepsRunning)}</span>}
        {notStarted.length > 0 && <span className="block mt-1 text-amber-600 dark:text-amber-400">{CM.restartSkipNotStartedMsg(notStarted)}</span>}
      </>
    ), hasHa, { starts: true });
    requestActionConfirm({
      title: CM.confirmRestartServiceTitle,
      description,
      confirmLabel: CM.restartService,
      variant: 'danger',
      run: async () => {
        setLoadingText(CM.restartingService);
        startAction();
        const { problems, skipped, leftStopped, haNodeFailed } = await dispatch(restartHostService(hostUid));
        resetAction();
        const tables = skipped.length > 0 ? [serviceSkippedTable(CM, skipped, 'restart')] : [];
        const notes = [
          haNodeFailed ? CM.haNodeStartFailedMsg : '',
          skipped.length > 0 ? CM.someDatabasesSkippedMsg(skipped.length) : '',
          leftStopped.length > 0 ? CM.serviceRestartLeftStoppedMsg(leftStopped) : '',
        ].filter(Boolean);
        dispatch(showStatusModal(problems.length > 0
          ? { type: 'error', title: CM.restartService, message: [...problems, ...notes].join('\n'), tables }
          : notes.length > 0
            ? { type: 'info', title: CM.restartService, message: [CM.serviceRestartedMsg, ...notes].join('\n'), tables }
            : { type: 'success', title: CM.restartService, message: CM.serviceRestartedMsg }));
      },
    });
  };

  const closeStopServiceConfirm = () => {
    setStopServiceConfirm(prev => ({ ...prev, isOpen: false }));
  };

  const requestStopService = async (hostUid, serverName) => {
    if (!hostUid) return;
    const { databases } = await readServiceState(hostUid);
    setStopServiceConfirm({
      isOpen: true,
      hostUid,
      serverName: serverName || hostUid,
      // Running non-HA databases not logged in are skipped and keep running;
      // HA ones go down with the node-wide ha_stop.
      skips: loginSkipsOf(databases, serviceStopTargets(databases)),
      hasHa: databases.some((db) => db.isHa),
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
      .then((batch) => {
        const report = hostLoginResultStatusModal(CM, { title: CM.loginSelectedHosts, batch });
        if (report) dispatch(showStatusModal(report));
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
          dispatch(resetDatabaseState(hostUid));
          dispatch(resetBrokerState(hostUid));
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
    if (selectedDbNames.size > 1 && selectedDbNames.has(dbName)) {
      setDbMultiContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
      return;
    }
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
    if (selectedBrokerNames.size > 1 && selectedBrokerNames.has(brokerName)) {
      setBrokerMultiContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
      return;
    }
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
      // A database's log list is a per-db request: logged-in ones only.
      (databases || []).forEach(db => {
        if (!loggedInDatabases.includes(dbKey(selectedHostUid, db.dbname))) return;
        dispatch(fetchDatabaseLogs({ hostUid: selectedHostUid, dbname: db.dbname }));
      });
    } catch (error) {
      console.error('Failed to refresh logs:', error);
    }
  }, [dispatch, selectedHostUid, brokers, databases, loggedInDatabases]);

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
      const isInsideMenu = e.target.closest('.context-menu-container, .context-menu-trigger');
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
      <aside ref={sidebarRef} className={`sidebar-responsive-container w-full h-full bg-white dark:bg-bk-side flex flex-col ${isCollapsed ? 'hidden' : ''}`} id="sidebar">

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
              className={`server-list-header flex-none px-4 py-2 border-b border-slate-200 dark:border-white/5 flex items-center justify-between gap-2 cursor-pointer transition-all duration-300 group/host-header
                ${!isServerListCollapsed
                  ? 'bg-white dark:bg-bk-side'
                  : 'bg-slate-50 dark:bg-white/2 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              onClick={toggleServerListCollapse}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all duration-200
                  ${!isServerListCollapsed ? 'text-amber-500' : 'text-slate-400 group-hover/host-header:text-amber-500'}`}>
                  <Icon
                    name="chevron_right"
                    size="xs"
                    className={`transition-transform duration-300 ${!isServerListCollapsed ? 'rotate-90' : ''}`}
                    weight={300}
                  />
                </div>
                <Typography variant="caption" className={`server-list-header-title whitespace-nowrap font-bold text-14 uppercase tracking-widest transition-colors
                  ${!isServerListCollapsed ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500 group-hover/host-header:text-amber-500'}`}>
                  {CM.serverListHeader}
                </Typography>
              </div>

              <div className="server-list-header-actions flex items-center gap-2 shrink-0">
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
                    type="button"
                    data-testid="add-host-toolbar-btn"
                    onClick={(e) => { e.stopPropagation(); onAddHost(); }}
                    className="server-toolbar-action flex items-center justify-center gap-1 h-7 px-2 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/4 text-slate-400 hover:text-amber-500 hover:border-amber-400/50 hover:bg-amber-500/5 dark:hover:bg-amber-500/10 transition-all active:scale-95 shadow-xs"
                    title={CM.addHost}
                    aria-label={CM.addHost}
                  >
                    <Icon name="add" size="13px" weight={400} />
                    <span className="server-toolbar-label text-12 font-semibold tracking-wide whitespace-nowrap">{CM.add}</span>
                  </button>
                )}
                {!isServerListCollapsed && (
                  <button
                    type="button"
                    data-testid="new-group-toolbar-btn"
                    onClick={(e) => { e.stopPropagation(); dispatch(openCreateGroupModal()); }}
                    className="server-toolbar-action server-toolbar-secondary-action flex items-center justify-center gap-1 h-7 px-2 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/4 text-slate-400 hover:text-amber-500 hover:border-amber-400/50 hover:bg-amber-500/5 dark:hover:bg-amber-500/10 transition-all active:scale-95 shadow-xs"
                    title={CM.newGroup}
                    aria-label={CM.newGroup}
                  >
                    <Icon name="create_new_folder" size="13px" weight={400} />
                    <span className="server-toolbar-label text-12 font-semibold tracking-wide whitespace-nowrap">{CM.newGroup}</span>
                  </button>
                )}
                {!isServerListCollapsed && hosts.length > 0 && (
                  <button
                    type="button"
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
                    className="server-toolbar-action server-toolbar-login-action flex items-center justify-center gap-1 h-7 px-2 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/4 text-slate-400 hover:text-amber-500 hover:border-amber-400/50 hover:bg-amber-500/5 dark:hover:bg-amber-500/10 transition-all active:scale-95 shadow-xs disabled:opacity-50 disabled:pointer-events-none"
                    title={CM.loginAll}
                    aria-label={CM.loginAll}
                  >
                    <Icon name="login" size="13px" weight={400} />
                    <span className="server-toolbar-label text-12 font-semibold tracking-wide whitespace-nowrap">{CM.loginAll}</span>
                  </button>
                )}
                {!isServerListCollapsed && (
                  <button
                    type="button"
                    data-testid="refresh-server-list-toolbar-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch(refreshServerList());
                    }}
                    disabled={hostsLoading}
                    className="server-toolbar-action flex items-center justify-center h-7 w-7 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/4 text-slate-400 hover:text-amber-500 hover:border-amber-400/50 hover:bg-amber-500/5 dark:hover:bg-amber-500/10 transition-all active:scale-95 shadow-xs disabled:opacity-50 disabled:pointer-events-none"
                    title={CM.refresh}
                    aria-label={CM.refresh}
                  >
                    <Icon name="refresh" size="13px" weight={400} className={hostsLoading ? 'animate-spin' : ''} />
                  </button>
                )}
                {!isServerListCollapsed && (
                  <button
                    type="button"
                    data-testid="server-toolbar-more-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (serverToolbarMenu) {
                        setServerToolbarMenu(null);
                        return;
                      }
                      const rect = e.currentTarget.getBoundingClientRect();
                      closeAllContextMenus();
                      setServerToolbarMenu({ mouseX: rect.right, mouseY: rect.bottom + 4 });
                    }}
                    className="context-menu-trigger server-toolbar-action server-toolbar-overflow-action items-center justify-center h-7 w-7 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/4 text-slate-400 hover:text-amber-500 hover:border-amber-400/50 hover:bg-amber-500/5 dark:hover:bg-amber-500/10 transition-all active:scale-95 shadow-xs"
                    title={CM.moreActions}
                    aria-label={CM.moreActions}
                    aria-haspopup="menu"
                    aria-expanded={Boolean(serverToolbarMenu)}
                  >
                    <Icon name="more_horiz" size="14px" weight={400} />
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
                        selectedDbNames={selectedDbNames}
                        onSelectedDbNamesChange={setSelectedDbNames}
                      />
                    </div>
                    <div id="broker-tree-container" className={activeTab !== 'broker' ? 'hidden' : ''}>
                      <BrokerTree
                        key={selectedHostUid}
                        hostUid={selectedHostUid}
                        onContextMenu={handleBrokerContextMenu}
                        onSqlLogContextMenu={handleSqlLogContextMenu}
                        selectedBrokerNames={selectedBrokerNames}
                        onSelectedBrokerNamesChange={setSelectedBrokerNames}
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
      {serverToolbarMenu && (
        <ContextMenuWrapper
          x={serverToolbarMenu.mouseX}
          y={serverToolbarMenu.mouseY}
          onClose={() => setServerToolbarMenu(null)}
          minWidth="min-w-48"
        >
          <MenuItem
            icon="create_new_folder"
            label={CM.newGroup}
            onClick={() => {
              dispatch(openCreateGroupModal());
              setServerToolbarMenu(null);
            }}
          />
          {hosts.length > 0 && (
            <MenuItem
              icon="login"
              label={CM.loginAll}
              disabled={isLoggingIntoHost || pendingLoginCount === 0}
              onClick={() => {
                handleLoginAll(null);
                setServerToolbarMenu(null);
              }}
            />
          )}
        </ContextMenuWrapper>
      )}

      {contextMenu && (
        <ContextMenuWrapper x={contextMenu.mouseX} y={contextMenu.mouseY} onClose={() => setContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
            <Typography variant="caption" title={contextMenu.server} className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11 block truncate min-w-0">{CM.server}: <span className="normal-case">{contextMenu.server}</span></Typography>
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
                    dispatch(forgetHostSession(hostUid));
                    dispatch(closeHostTabs(hostUid));
                    if (selectedHostUid === hostUid) {
                      dispatch(setSelectedHost(null));
                      dispatch(resetDatabaseState(hostUid));
                      dispatch(resetBrokerState(hostUid));
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
            title={hostOffReason(contextMenu.hostUid)}
            onClick={() => {
              const hostUid = contextMenu.hostUid;
              setContextMenu(null);
              requestStartService(hostUid);
            }}
          />
          <MenuItem
            icon="stop"
            label={CM.stopService}
            disabled={!authorizedHosts.includes(contextMenu.hostUid) || sidebarActionLoading}
            title={hostOffReason(contextMenu.hostUid)}
            onClick={() => {
              const hostUid = contextMenu.hostUid;
              const serverName = contextMenu.alias || contextMenu.server || hostUid;
              setContextMenu(null);
              requestStopService(hostUid, serverName);
            }}
          />
          <MenuItem
            icon="restart_alt"
            label={CM.restartService}
            disabled={!authorizedHosts.includes(contextMenu.hostUid) || sidebarActionLoading}
            title={hostOffReason(contextMenu.hostUid)}
            onClick={() => {
              const hostUid = contextMenu.hostUid;
              const serverName = contextMenu.alias || contextMenu.server || hostUid;
              setContextMenu(null);
              requestRestartService(hostUid, serverName);
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
            disabled={!authorizedHosts.includes(contextMenu.hostUid)}
            title={hostOffReason(contextMenu.hostUid)}
            onClick={() => { dispatch(openChangePasswordModal(contextMenu.hostUid)); setContextMenu(null); }} 
          />
          <MenuItem 
            icon="supervisor_account" 
            label={CM.userManagement} 
            disabled={!authorizedHosts.includes(contextMenu.hostUid)}
            title={hostOffReason(contextMenu.hostUid)}
            onClick={() => { dispatch(openCmsUserManagementModal(contextMenu.hostUid)); setContextMenu(null); }} 
          />
          <MenuItem icon="info" label={CM.serverVersion} onClick={() => { dispatch(openServerVersionModal(contextMenu.hostUid)); setContextMenu(null); }} />
        </ContextMenuWrapper>
      )}

      {bulkHostContextMenu && (
        <ContextMenuWrapper x={bulkHostContextMenu.mouseX} y={bulkHostContextMenu.mouseY} onClose={() => setBulkHostContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
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
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11 block min-w-0">
              {/* The host-list root reuses this menu but is not a group, so no "Group:" prefix. */}
              <span title={groupContextMenu.groupName} className="block truncate">
                {groupContextMenu.groupId ? CM.groupColonLabel(groupContextMenu.groupName) : groupContextMenu.groupName}
              </span>
            </Typography>
            <Icon name={groupContextMenu.groupId ? 'folder' : 'dns'} size="xs" className="opacity-30" weight={300} />
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
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
            <Typography variant="caption" title={dbContextMenu.db} className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11 block truncate min-w-0">{CM.database}: <span className="normal-case">{dbContextMenu.db}</span></Typography>
            <Icon name="database" size="xs" className="opacity-30" weight={300} />
          </div>
          {dbContextMenu.isActive ? (
            <MenuItem
              icon="stop"
              label={CM.stopDatabase}
              disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              title={dbOffReason(dbContextMenu.db)}
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
              title={dbOffReason(dbContextMenu.db)}
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
          {dbContextMenu.isActive && (
            <MenuItem
              icon="restart_alt"
              label={CM.restartDatabase}
              disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              title={dbOffReason(dbContextMenu.db)}
              onClick={() => {
                const dbname = dbContextMenu.db;
                setDbContextMenu(null);
                const row = databaseSelectionRows(
                  { database: { navigatorDatabasesByHost, navigatorActiveDatabasesByHost, haDbNamesByHost, loggedInDatabases } },
                  selectedHostUid
                ).find((r) => r.dbname === dbname);
                if (row) handleMultiDatabaseAction('restart', [row]);
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
              title={dbOffReason(dbContextMenu.db)}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openUnloadDatabaseModal(dbContextMenu.db)); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="download"
              label={CM.manageDatabaseMenu.load}
              disabled={dbContextMenu.isActive || !loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db)) || isSelectedDbInHa}
              title={dbOffReason(dbContextMenu.db, { ha: true })}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openLoadDatabaseModal(dbContextMenu.db)); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="check_circle"
              label={CM.manageDatabaseMenu.check}
              disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              title={dbOffReason(dbContextMenu.db)}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openCheckDatabaseModal()); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="compress"
              label={CM.manageDatabaseMenu.compact}
              disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              title={dbOffReason(dbContextMenu.db)}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openCompactDatabaseModal()); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="add_to_drive"
              label={CM.manageDatabaseMenu.addVol}
              disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              title={dbOffReason(dbContextMenu.db)}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openAddVolumeModal()); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="auto_fix_high"
              label={CM.manageDatabaseMenu.optimize}
              disabled={dbContextMenu.isActive || !loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              title={dbOffReason(dbContextMenu.db)}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openOptimizeDatabaseModal()); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="content_copy"
              label={CM.manageDatabaseMenu.copy}
              disabled={dbContextMenu.isActive || !loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              title={dbOffReason(dbContextMenu.db)}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openCopyDatabaseModal()); setDbContextMenu(null); }}
            />
            <MenuDivider />
            <MenuItem
              icon="drive_file_rename_outline"
              label={CM.manageDatabaseMenu.rename}
              disabled={dbContextMenu.isActive || !loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db)) || isSelectedDbInHa}
              title={dbOffReason(dbContextMenu.db, { ha: true })}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openRenameDatabaseModal()); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="restore"
              label={CM.manageDatabaseMenu.restore}
              disabled={dbContextMenu.isActive || !loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db)) || isSelectedDbInHa}
              title={dbOffReason(dbContextMenu.db, { ha: true })}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openRestoreDatabaseModal()); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="backup"
              label={CM.manageDatabaseMenu.backup}
              disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              title={dbOffReason(dbContextMenu.db)}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openBackupDatabaseModal()); setDbContextMenu(null); }}
            />
            <MenuDivider />
            <MenuItem
              icon="delete"
              label={CM.manageDatabaseMenu.delete}
              disabled={dbContextMenu.isActive || !loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db)) || isSelectedDbInHa}
              title={dbOffReason(dbContextMenu.db, { ha: true })}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openDeleteDatabaseModal(dbContextMenu.db)); setDbContextMenu(null); }}
            />
          </SubMenu>

          <SubMenu icon="info" label={CM.databaseInfoMenu} minWidth="min-w-52">
            <MenuItem
              icon="lock_open"
              label={`${CM.lockingInformation}...`}
              disabled={!dbContextMenu.isActive || !loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              title={dbOffReason(dbContextMenu.db)}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openLockInformationModal()); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="swap_horiz"
              label={`${CM.transactionInformation}...`}
              disabled={!dbContextMenu.isActive || !loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              title={dbOffReason(dbContextMenu.db)}
              onClick={() => { dispatch(setSelectedDatabase(dbContextMenu.db)); dispatch(openTransactionInfoModal()); setDbContextMenu(null); }}
            />
            <MenuItem
              icon="data_object"
              label={`${CM.paramDump}`}
              disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
              title={dbOffReason(dbContextMenu.db)}
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
              title={dbOffReason(dbContextMenu.db)}
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
            label={CM.editInstanceProperties}
            disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbContextMenu.db))}
            title={dbOffReason(dbContextMenu.db)}
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

      {dbMultiContextMenu && (() => {
        const rows = databaseSelectionRows(
          { database: { navigatorDatabasesByHost, navigatorActiveDatabasesByHost, haDbNamesByHost, loggedInDatabases } },
          selectedHostUid
        ).filter((row) => selectedDbNames.has(row.dbname));
        const close = () => setDbMultiContextMenu(null);
        return (
          <ContextMenuWrapper x={dbMultiContextMenu.mouseX} y={dbMultiContextMenu.mouseY} onClose={close}>
            <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
              <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">
                {CM.multiDbSelectedCount(rows.length)}
              </Typography>
              <Icon name="checklist" size="xs" className="opacity-30" weight={300} />
            </div>
            {MULTI_DB_ACTIONS.map((action) => {
              const { targets } = splitByAction(action, rows);
              return (
                <MenuItem
                  key={action}
                  icon={MULTI_DB_ACTION_ICONS[action]}
                  label={`${CM.multiDbActions[action]} (${targets.length})`}
                  disabled={targets.length === 0}
                  onClick={() => {
                    close();
                    // Databases without saved credentials need a user and
                    // password, which the selection window asks for.
                    if (action === 'login' && targets.some((row) => !row.hasProfile)) {
                      setSelectDatabasesModal({ initialSelected: rows.map((row) => row.dbname) });
                      return;
                    }
                    handleMultiDatabaseAction(action, rows);
                  }}
                />
              );
            })}
            <MenuDivider />
            <MenuItem
              icon="checklist"
              label={CM.selectDatabasesMenu}
              onClick={() => {
                close();
                setSelectDatabasesModal({ initialSelected: rows.map((row) => row.dbname) });
              }}
            />
          </ContextMenuWrapper>
        );
      })()}

      {brokerMultiContextMenu && (() => {
        const selectedBrokers = (navigatorBrokersByHost?.[selectedHostUid] || [])
          .filter((broker) => selectedBrokerNames.has(broker.name))
          .map((broker) => ({ name: broker.name, state: broker.state }));
        const close = () => setBrokerMultiContextMenu(null);
        return (
          <ContextMenuWrapper x={brokerMultiContextMenu.mouseX} y={brokerMultiContextMenu.mouseY} onClose={close}>
            <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
              <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">
                {CM.multiDbSelectedCount(selectedBrokers.length)}
              </Typography>
              <Icon name="hub" size="xs" className="opacity-30" weight={300} />
            </div>
            {MULTI_BROKER_ACTIONS.map((action) => {
              const { targets } = splitBrokersByAction(action, selectedBrokers);
              return (
                <MenuItem
                  key={action}
                  icon={MULTI_DB_ACTION_ICONS[action]}
                  label={`${CM.multiDbActions[action]} (${targets.length})`}
                  disabled={targets.length === 0}
                  onClick={() => {
                    close();
                    handleMultiBrokerAction(action, selectedBrokers);
                  }}
                />
              );
            })}
          </ContextMenuWrapper>
        );
      })()}

      {dbRootContextMenu && (
        <ContextMenuWrapper x={dbRootContextMenu.mouseX} y={dbRootContextMenu.mouseY} onClose={() => setDbRootContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.allDatabases}</Typography>
            <Icon name="database" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="play_circle"
            label={CM.startAllDatabases}
            onClick={() => {
              setDbRootContextMenu(null);
              confirmWithLoginSkips(selectedHostUid, stoppedDbNames, {
                title: CM.confirmStartAllDatabasesTitle,
                description: CM.confirmStartAllDatabasesDesc,
                confirmLabel: CM.startAllDatabases,
                variant: 'primary',
                run: async (dbnames) => {
                  setLoadingText(CM.startingAllDatabasesMsg);
                  startAction();
                  try {
                    const result = await runAllDatabasesAction(dispatch, selectedHostUid, 'start', dbnames);
                    dispatch(fetchDatabaseStartInfo(selectedHostUid));
                    resetAction();
                    const report = bulkResultStatusModal(CM, {
                      title: CM.startAllDatabases, failedMsg: CM.someDatabasesFailedToStartMsg, failed: result.failed, skipped: result.skipped,
                    });
                    if (report) dispatch(showStatusModal(report));
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
              confirmWithLoginSkips(selectedHostUid, runningDbNames, {
                title: CM.confirmStopAllDatabasesTitle,
                description: CM.confirmStopAllDatabasesDesc,
                confirmLabel: CM.stopAllDatabases,
                variant: 'danger',
                run: async (dbnames) => {
                  setLoadingText(CM.stoppingAllDatabasesMsg);
                  startAction();
                  try {
                    const result = await runAllDatabasesAction(dispatch, selectedHostUid, 'stop', dbnames);
                    dispatch(fetchDatabaseStartInfo(selectedHostUid));
                    resetAction();
                    const report = bulkResultStatusModal(CM, {
                      title: CM.stopAllDatabases, failedMsg: CM.someDatabasesFailedToStopMsg, failed: result.failed, skipped: result.skipped,
                    });
                    if (report) dispatch(showStatusModal(report));
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
              confirmWithLoginSkips(selectedHostUid, runningDbNames, {
                title: CM.confirmRestartAllDatabasesTitle,
                description: CM.confirmRestartAllDatabasesDesc,
                confirmLabel: CM.restartAllDatabases,
                variant: 'danger',
                run: async (dbnames) => {
                  setLoadingText(CM.restartingAllDatabasesMsg);
                  startAction();
                  try {
                    const { failed, skipped } = await runAllDatabasesAction(dispatch, selectedHostUid, 'restart', dbnames);
                    dispatch(fetchDatabaseStartInfo(selectedHostUid));
                    resetAction();
                    const report = bulkResultStatusModal(CM, {
                      title: CM.restartAllDatabases, failedMsg: CM.someDatabasesFailedToRestartMsg,
                      failed, skipped, showPhase: true,
                    });
                    if (report) dispatch(showStatusModal(report));
                  } catch (err) {
                    dispatch(fetchDatabaseStartInfo(selectedHostUid));
                    endError(err);
                  }
                },
              });
            }}
          />
          {(() => {
            const allRows = databaseSelectionRows(
              { database: { navigatorDatabasesByHost, navigatorActiveDatabasesByHost, haDbNamesByHost, loggedInDatabases } },
              selectedHostUid
            );
            const loginTargets = splitByAction('login', allRows).targets;
            const logoutTargets = splitByAction('logout', allRows).targets;
            return (
              <>
                <MenuItem
                  icon="login"
                  label={CM.loginAllDatabases}
                  disabled={loginTargets.length === 0}
                  onClick={() => {
                    setDbRootContextMenu(null);
                    // Databases without saved credentials need a user and password.
                    if (loginTargets.some((row) => !row.hasProfile)) {
                      setSelectDatabasesModal({ initialSelected: loginTargets.map((row) => row.dbname) });
                      return;
                    }
                    handleMultiDatabaseAction('login', loginTargets);
                  }}
                />
                <MenuItem
                  icon="logout"
                  label={CM.logoutAllDatabases}
                  disabled={logoutTargets.length === 0}
                  onClick={() => {
                    setDbRootContextMenu(null);
                    handleMultiDatabaseAction('logout', logoutTargets);
                  }}
                />
              </>
            );
          })()}
          <MenuItem
            icon="checklist"
            label={CM.selectDatabasesMenu}
            onClick={() => {
              setDbRootContextMenu(null);
              setSelectDatabasesModal({ initialSelected: [] });
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
          <MenuItem icon="tune" label={CM.editCommonProperties} onClick={() => { setDbRootContextMenu(null); dispatch(setSelectedDatabase(null)); dispatch(openDatabasePropertyModal()); }} />
        </ContextMenuWrapper>
      )}

      {brokerRootContextMenu && (
        <ContextMenuWrapper x={brokerRootContextMenu.mouseX} y={brokerRootContextMenu.mouseY} onClose={() => setBrokerRootContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
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
                    await dispatch(startAllBrokersAndRefresh(selectedHostUid));
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
                    await dispatch(stopAllBrokersAndRefresh(selectedHostUid));
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
                    await dispatch(restartAllBrokersAndRefresh(selectedHostUid));
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
          <MenuDivider />
          <MenuItem
            icon="tune"
            label={CM.editCommonProperties}
            onClick={() => {
              setBrokerRootContextMenu(null);
              dispatch(openBrokerPropertyModal({ hostUid: selectedHostUid, brokerName: null }));
            }}
          />
        </ContextMenuWrapper>
      )}

      {brokerContextMenu && (
        <ContextMenuWrapper x={brokerContextMenu.mouseX} y={brokerContextMenu.mouseY} onClose={() => setBrokerContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
            <Typography variant="caption" title={brokerContextMenu.broker} className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11 block truncate min-w-0">{CM.broker}: <span className="normal-case">{brokerContextMenu.broker}</span></Typography>
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
                      await dispatch(stopBrokerAndRefresh({ hostUid: selectedHostUid, brokerName: bName }));
                      resetAction();
                    } catch (err) {
                      endError(err);
                    }
                  },
                });
              }}
            />
          ) : null}
          {brokerContextMenu.state === 'ON' && (
            <MenuItem
              icon="restart_alt"
              label={CM.restartBroker}
              onClick={() => {
                const bName = brokerContextMenu.broker;
                setBrokerContextMenu(null);
                handleMultiBrokerAction('restart', [{ name: bName, state: 'ON' }]);
              }}
            />
          )}
          {brokerContextMenu.state !== 'ON' && (
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
                      await dispatch(startBrokerAndRefresh({ hostUid: selectedHostUid, brokerName: bName }));
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
            label={CM.editInstanceProperties}
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
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
            <Typography variant="caption" title={sqlLogContextMenu.broker} className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11 block truncate min-w-0">{CM.sqlLogs}: <span className="normal-case">{sqlLogContextMenu.broker}</span></Typography>
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
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
            <Typography variant="caption" title={dbLogContextMenu.db} className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11 block truncate min-w-0">{CM.serverLogs}: <span className="normal-case">{dbLogContextMenu.db}</span></Typography>
            <Icon name="dns" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="visibility"
            label={CM.viewAllLogs}
            disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbLogContextMenu.db))}
            title={dbOffReason(dbLogContextMenu.db)}
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
            disabled={!loggedInDatabases.includes(dbKey(selectedHostUid, dbLogContextMenu.db))}
            title={dbOffReason(dbLogContextMenu.db)}
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
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
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
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
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
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
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
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
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
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.serverLogs}</Typography>
            <Icon name="dns" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            onClick={() => {
              (databases || []).forEach(db => {
                if (!loggedInDatabases.includes(dbKey(selectedHostUid, db.dbname))) return;
                dispatch(fetchDatabaseLogs({ hostUid: selectedHostUid, dbname: db.dbname }));
              });
              setServerLogRootContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}

      {logTabContextMenu && (
        <ContextMenuWrapper x={logTabContextMenu.mouseX} y={logTabContextMenu.mouseY} onClose={() => setLogTabContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
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
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
             <Typography variant="caption" title={usersContextMenu.db} className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11 block truncate min-w-0">{CM.users}: <span className="normal-case">{usersContextMenu.db}</span></Typography>
             <Icon name="groups" size="xs" className="opacity-30"  weight={300} />
          </div>
          <MenuItem
            icon="person_add"
            label={CM.addUser}
            disabled={!usersContextMenu.isActive || !usersContextMenu.isLoggedIn}
            title={loginOffReason(usersContextMenu.isLoggedIn)}
            onClick={() => {
              dispatch(openCreateUserModal(usersContextMenu.db));
              setUsersContextMenu(null);
            }}
          />
          <MenuItem
            icon="refresh"
            label={CM.refresh}
            disabled={!usersContextMenu.isLoggedIn}
            title={loginOffReason(usersContextMenu.isLoggedIn)}
            onClick={() => {
              dispatch(fetchDatabaseUsers({ hostUid: selectedHostUid, dbname: usersContextMenu.db }));
              setUsersContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}

      {userContextMenu && (
        <ContextMenuWrapper x={userContextMenu.mouseX} y={userContextMenu.mouseY} onClose={() => setUserContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
            <Typography variant="caption" title={userContextMenu.user} className="font-bold text-slate-700 dark:text-slate-200 tracking-widest text-11 block truncate min-w-0">{userContextMenu.user}</Typography>
            <Icon name="person" size="xs" className="opacity-30"  weight={300} />
          </div>
          <MenuItem
            icon="edit"
            label={CM.editUser}
            disabled={!userContextMenu.isActive || !userContextMenu.isLoggedIn}
            title={loginOffReason(userContextMenu.isLoggedIn)}
            onClick={() => {
              dispatch(openEditUserModal({ dbname: userContextMenu.db, userName: userContextMenu.user }));
              setUserContextMenu(null);
            }}
          />
          <MenuItem
            icon="person_remove"
            label={CM.deleteUser}
            disabled={!userContextMenu.isActive || !userContextMenu.isLoggedIn}
            title={loginOffReason(userContextMenu.isLoggedIn)}
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
            title={loginOffReason(userContextMenu.isLoggedIn)}
            onClick={() => {
              dispatch(fetchDatabaseUsers({ hostUid: selectedHostUid, dbname: userContextMenu.db }));
              setUserContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}
      {backupPlanContextMenu && (
        <ContextMenuWrapper x={backupPlanContextMenu.mouseX} y={backupPlanContextMenu.mouseY} onClose={() => setBackupPlanContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
            <Typography variant="caption" className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11">{CM.backupPlanLabel}</Typography>
            <Icon name="backup" size="xs" className="opacity-30"  weight={300} />
          </div>
          <MenuItem
            icon="add_circle"
            label={CM.createBackupPlan}
            disabled={!backupPlanContextMenu.isLoggedIn}
            title={loginOffReason(backupPlanContextMenu.isLoggedIn)}
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
            title={loginOffReason(backupPlanContextMenu.isLoggedIn)}
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
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
            <Typography variant="caption" title={spaceContextMenu.db} className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11 block truncate min-w-0">{CM.space}: <span className="normal-case">{spaceContextMenu.db}</span></Typography>
            <Icon name="donut_small" size="xs" className="opacity-30"  weight={300} />
          </div>
          <MenuItem
            icon="add_to_drive"
            label={CM.addVolume}
            disabled={!spaceContextMenu.isLoggedIn}
            title={loginOffReason(spaceContextMenu.isLoggedIn)}
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
            title={loginOffReason(spaceContextMenu.isLoggedIn)}
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
            disabled={!spaceContextMenu.isLoggedIn}
            title={loginOffReason(spaceContextMenu.isLoggedIn)}
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
            title={loginOffReason(spaceContextMenu.isLoggedIn)}
            onClick={() => {
              dispatch(fetchDatabaseSpaceInfo({ hostUid: selectedHostUid, dbname: spaceContextMenu.db }));
              setSpaceContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}

      {backupItemContextMenu && (
        <ContextMenuWrapper x={backupItemContextMenu.mouseX} y={backupItemContextMenu.mouseY} onClose={() => setBackupItemContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
            <Typography variant="caption" title={backupItemContextMenu.planId} className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11 block truncate min-w-0">{CM.backup}: <span className="normal-case">{backupItemContextMenu.planId}</span></Typography>
            <Icon name="event_note" size="xs" className="opacity-30"  weight={300} />
          </div>

          <MenuItem
            icon="edit"
            label={CM.editBackupPlan}
            disabled={!backupItemContextMenu.isLoggedIn}
            title={loginOffReason(backupItemContextMenu.isLoggedIn)}
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
            title={loginOffReason(backupItemContextMenu.isLoggedIn)}
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
            title={loginOffReason(backupItemContextMenu.isLoggedIn)}
            onClick={() => {
              dispatch(fetchBackupSchedule({ hostUid: selectedHostUid, dbname: backupItemContextMenu.db }));
              setBackupItemContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}

      {queryPlanContextMenu && (
        <ContextMenuWrapper x={queryPlanContextMenu.mouseX} y={queryPlanContextMenu.mouseY} onClose={() => setQueryPlanContextMenu(null)}>
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
            <Typography variant="caption" title={queryPlanContextMenu.db} className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11 block truncate min-w-0">{CM.queryPlan}: <span className="normal-case">{queryPlanContextMenu.db}</span></Typography>
            <Icon name="bolt" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="add_circle"
            label={CM.addQueryPlan}
            disabled={!queryPlanContextMenu.isLoggedIn}
            title={loginOffReason(queryPlanContextMenu.isLoggedIn)}
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
            title={loginOffReason(queryPlanContextMenu.isLoggedIn)}
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
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between gap-2 min-w-0">
            <Typography variant="caption" title={queryItemContextMenu.qId} className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-11 block truncate min-w-0">{CM.queryPlanItem}: <span className="normal-case">{queryItemContextMenu.qId}</span></Typography>
            <Icon name="bolt" size="xs" className="opacity-30" weight={300} />
          </div>
          <MenuItem
            icon="edit"
            label={CM.editQueryPlan}
            disabled={!queryItemContextMenu.isLoggedIn}
            title={loginOffReason(queryItemContextMenu.isLoggedIn)}
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
            title={loginOffReason(queryItemContextMenu.isLoggedIn)}
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
            title={loginOffReason(queryItemContextMenu.isLoggedIn)}
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
      <SelectDatabasesModal
        isOpen={!!selectDatabasesModal}
        hostUid={selectedHostUid}
        initialSelected={selectDatabasesModal?.initialSelected}
        onClose={() => setSelectDatabasesModal(null)}
        onAction={(action, rows, credentials) => {
          setSelectDatabasesModal(null);
          handleMultiDatabaseAction(action, rows, credentials);
        }}
      />
      <ConfirmDialog
        isOpen={stopServiceConfirm.isOpen}
        title={CM.stopServicesConfirmTitle}
        description={withHaServiceNotes(
          withLoginSkipWarning(CM.stopServicesConfirmDesc(stopServiceConfirm.serverName), stopServiceConfirm.skips || { count: 0 }),
          stopServiceConfirm.hasHa,
          { starts: false }
        )}
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
