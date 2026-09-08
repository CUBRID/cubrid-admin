import React, { useCallback, useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import {
  setSelectedDatabase,
  setSelectedDatabaseSubItem,
  fetchBackupSchedule,
  fetchQueryPlan,
  openLoginDatabaseModal,
  loginDatabase,
  fetchDatabaseSpaceInfo,
  openEditBackupPlanModal,
  setSelectedBackupId,
  openEditQueryPlanModal,
} from '../../../database/databaseSlice';
import { 
  fetchDatabaseParamDump, 
  fetchDatabasePlanDump, 
  fetchAutoVolumeConfig 
} from '../../../database/databaseConfigurationSlice';
import { fetchDatabaseUsers } from '../../../user/userSlice';
import { openTab } from '../../layoutSlice';
import { dbKey } from '../../../database/dbKey';
import { TreeNode } from '../../../../components/domain/tree/TreeNode';
import { Skeleton } from '../../../../components/ds/layout/Skeleton';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { Typography } from '../../../../components/ds/foundation/Typography';
import { Spinner } from '../../../../components/ds/foundation/Spinner';
import { useCM } from '../../../../constants/useCM';

// Granular selectors to avoid unnecessary re-renders when dashboard data or other slice state changes
const selectDatabases = (state) => state.database.databases || [];
const selectActiveDatabases = (state) => state.database.activeDatabases || [];
const selectLoading = (state) => state.database.loading;
const selectSelection = (state) => ({
  selectedDatabase: state.database.selectedDatabase,
  selectedDatabaseSubItem: state.database.selectedDatabaseSubItem
});
const selectStatusStates = (state) => ({
  loggedInDatabases: state.database.loggedInDatabases || [],
  loggingInDatabases: state.database.loggingInDatabases || {},
  backupSchedules: state.databaseOperation.backupSchedules,
  backupSchedulesLoading: state.databaseOperation.backupSchedulesLoading,
  queryPlans: state.databaseOperation.queryPlans,
  queryPlansLoading: state.databaseOperation.queryPlansLoading,
  spaceInfo: state.databaseMonitoring.spaceInfo,
  spaceInfoLoading: state.databaseMonitoring.spaceInfoLoading,
});


export default function DatabaseTree({ 
  onContextMenu, 
  onRootContextMenu, 
  onUsersContextMenu,
  onUserContextMenu,
  onBackupPlanContextMenu,
  onSpaceContextMenu,
  onQueryPlanContextMenu,
  onQueryItemContextMenu,
  onJobAutomationContextMenu,
  onBackupItemContextMenu
}) {
  const CM = useCM();
  const dispatch = useDispatch();
  const selectedHostUid = useSelector((state) => state.host.selectedHostUid);
  const { haInfo } = useSelector((state) => state.host, shallowEqual);
  const hostHaInfo = haInfo[selectedHostUid] || {};
  const isHostHA = hostHaInfo.isHA;

  const hostData = useSelector((state) => state.monitoring.hostsData[selectedHostUid] || {});
  const haHeartbeat = hostData?.haHeartbeat;
  const haDbs = useMemo(() => {
    const names = new Set();
    const raw = haHeartbeat?.hadbinfolist;
    if (!raw) return names;

    const ensureArray = (val) => {
      if (!val) return [];
      return Array.isArray(val) ? val : [val];
    };

    ensureArray(raw).forEach((entry) => {
      const servers = entry?.server;
      if (!servers) return;

      ensureArray(servers).forEach((server) => {
        if (!server) return;

        ensureArray(server.dbmode).forEach((row) => {
          if (row?.dbname) names.add(row.dbname);
        });

        ensureArray(server.dbprocinfo).forEach((row) => {
          if (row?.dbname) names.add(row.dbname);
        });

        ensureArray(server.applylogdb).forEach((block) => {
          if (block?.element) {
            ensureArray(block.element).forEach((el) => {
              if (el?.dbname) names.add(el.dbname);
            });
          }
        });

        ensureArray(server.copylogdb).forEach((block) => {
          if (block?.element) {
            ensureArray(block.element).forEach((el) => {
              if (el?.dbname) names.add(el.dbname);
            });
          }
        });
      });
    });

    return names;
  }, [haHeartbeat]);
  
  const databases = useSelector(selectDatabases, shallowEqual);
  const activeDatabases = useSelector(selectActiveDatabases, shallowEqual);
  const loading = useSelector(selectLoading);
  const { selectedDatabase, selectedDatabaseSubItem } = useSelector(selectSelection, shallowEqual);
  const { 
    loggedInDatabases, 
    backupSchedules, 
    backupSchedulesLoading, 
    queryPlans, 
    queryPlansLoading, 
    spaceInfo, 
    spaceInfoLoading,
    loggingInDatabases,
  } = useSelector(selectStatusStates, shallowEqual);
  
  const { databaseUsers, databaseUsersLoading, databaseUsersError } = useSelector((state) => state.user, shallowEqual, shallowEqual);

  // Expand/collapse only ever lazy-loads supplementary read-only data for an
  // already-logged-in database. It never attempts a login — that's a separate,
  // deliberate action (double-click) so browsing the tree structure never
  // silently triggers a connection attempt.
  const handleDbToggle = useCallback((db, isActive, isLoggedIn) => {
    if (!isActive || !isLoggedIn) return;

    // We use a small timeout to let the browser finish processing
    // click sequences (like double-clicks) before we trigger state-changing
    // dispatches that could cause a reset-rendering of the tree node.
    setTimeout(() => {
      // databaseUsersError is checked (not just Loading) because userinfo
      // re-logs into the target database on every call (see cm_ts_userinfo /
      // _op_db_login in the CMS source) instead of reading cached state. A
      // failed attempt against a database whose engine just went unreachable
      // leaves that CMS worker thread's error context uninitialized on a
      // known-buggy CUBRID build; an immediate second userinfo call on the
      // same (CMS is single-threaded) connection then crashes cub_manager
      // outright. Without this check, isActive/isLoggedIn being briefly
      // stale right after a stop is enough to fire that first failing call,
      // and any re-render (tree re-toggle, unrelated state update) would
      // otherwise retry it immediately and reproduce the crash.
      const key = dbKey(selectedHostUid, db.dbname);
      if (!databaseUsers[key] && !databaseUsersLoading[key] && !databaseUsersError[key]) {
        dispatch(fetchDatabaseUsers({ hostUid: selectedHostUid, dbname: db.dbname }));
      }
      if (!backupSchedules[key] && !backupSchedulesLoading[key]) {
        dispatch(fetchBackupSchedule({ hostUid: selectedHostUid, dbname: db.dbname }));
      }
      if (!queryPlans[key] && !queryPlansLoading[key]) {
        dispatch(fetchQueryPlan({ hostUid: selectedHostUid, dbname: db.dbname }));
      }
    }, 50);
  }, [selectedHostUid, databaseUsers, databaseUsersLoading, databaseUsersError, backupSchedules, backupSchedulesLoading, queryPlans, queryPlansLoading, dispatch]);

  // Double-click "activates" a database: log in if needed (or prompt for
  // credentials), then open its dashboard tab.
  const handleDbActivate = useCallback((db, isLoggedIn) => {
    if (!isLoggedIn) {
      if (db.isProfileExists) {
        dispatch(loginDatabase({ hostUid: selectedHostUid, dbname: db.dbname, isBackground: true })).unwrap()
          .then(() => {
            dispatch(fetchDatabaseUsers({ hostUid: selectedHostUid, dbname: db.dbname }));
            dispatch(fetchBackupSchedule({ hostUid: selectedHostUid, dbname: db.dbname }));
            dispatch(fetchQueryPlan({ hostUid: selectedHostUid, dbname: db.dbname }));
            dispatch(openTab(`db:${selectedHostUid}:${db.dbname}`));
          });
      } else {
        dispatch(openLoginDatabaseModal(db.dbname));
      }
    } else {
      dispatch(openTab(`db:${selectedHostUid}:${db.dbname}`));
    }
  }, [selectedHostUid, dispatch]);

  const handleSelectSubItem = useCallback((dbname, subId, onClick) => {
    dispatch(setSelectedDatabase(dbname));
    dispatch(setSelectedDatabaseSubItem(subId));
    if (onClick) onClick();
  }, [dispatch]);

  const handleTabOpen = useCallback((tabId) => {
    dispatch(openTab(tabId));
  }, [dispatch]);

  if (loading && (!databases || databases.length === 0)) {
    return (
      <div className="flex flex-col gap-4 px-2 py-2 animate-in fade-in duration-500">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
               <Skeleton variant="circular" width="16px" height="16px" className="opacity-40" />
               <Skeleton variant="text" width="85%" height="18px" className="rounded-md" />
            </div>
            <div className="flex items-center gap-2 ml-6 opacity-30">
               <Skeleton variant="text" width="60%" height="14px" className="rounded-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!databases || databases.length === 0) {
    return (
      <div className="px-6 py-12 flex flex-col items-center justify-center text-center space-y-3 opacity-40">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-2">
          <Icon name="database" size="md" className="text-slate-400" weight={100} />
        </div>
        <Typography variant="caption" className="text-slate-500 font-black uppercase tracking-widest text-12">
          No databases found
        </Typography>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 px-2 py-2" onContextMenu={(e) => onRootContextMenu(e)}>
      {databases.map((db) => {
        const isActive = activeDatabases.includes(db.dbname);
        const key = dbKey(selectedHostUid, db.dbname);
        const isLoggedIn = loggedInDatabases.includes(key);
        const isDbSelected = db.dbname === selectedDatabase && !selectedDatabaseSubItem;

        const isDbInHa = isHostHA && haDbs.has(db.dbname);
        const label = (
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="truncate">{db.dbname}</span>
            {isDbInHa && (
              <span className="px-0.5 py-[0.5px] text-9 font-black leading-none bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-sm scale-90 shrink-0 uppercase">
                HA
              </span>
            )}
            {db.isProfileExists && (
              <Icon
                name="key"
                size="11px"
                weight={400}
                className="text-slate-400 dark:text-slate-500 shrink-0"
                title={CM.databaseCredentialsSaved}
              />
            )}
            <Icon
              name={isLoggedIn ? 'lock_open' : 'lock'}
              size="11px"
              weight={isLoggedIn ? 500 : 400}
              className={`shrink-0 ${isLoggedIn ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-700'}`}
              title={isLoggedIn ? CM.databaseLoggedIn : CM.databaseNotLoggedIn}
            />
          </span>
        );

        return (
          <TreeNode
            key={db.dbname}
            id={db.dbname}
            label={label}
            icon="database"
            level={1}
            isActive={isDbSelected}
            hasChildren={true}
            isLoading={loggingInDatabases[key]}
            status={isActive ? 'on' : 'off'}
            onToggle={() => handleDbToggle(db, isActive, isLoggedIn)}
            onSelect={() => {
              dispatch(setSelectedDatabase(db.dbname));
              dispatch(setSelectedDatabaseSubItem(null));
            }}
            onDoubleClick={() => handleDbActivate(db, isLoggedIn)}
            onContextMenu={(e) => onContextMenu(e, db.dbname, isActive, isLoggedIn)}
          >
            {/* Level 2 items */}

            <UsersFolder
              db={db}
              isActive={isActive}
              isLoggedIn={isLoggedIn}
              selectedDatabase={selectedDatabase}
              selectedDatabaseSubItem={selectedDatabaseSubItem}
              users={databaseUsers[key]}
              isLoading={databaseUsersLoading[key]}
              error={databaseUsersError[key]}
              onUsersContextMenu={onUsersContextMenu}
              onUserContextMenu={onUserContextMenu}
              onSelect={handleSelectSubItem}
              selectedHostUid={selectedHostUid}
            />

            <JobAutomationFolder 
              db={db}
              isActive={isActive}
              isLoggedIn={isLoggedIn}
              selectedDatabase={selectedDatabase}
              selectedDatabaseSubItem={selectedDatabaseSubItem}
              backupSchedules={backupSchedules[key]}
              backupSchedulesLoading={backupSchedulesLoading[key]}
              queryPlans={queryPlans[key]}
              queryPlansLoading={queryPlansLoading[key]}
              onJobAutomationContextMenu={onJobAutomationContextMenu}
              onBackupPlanContextMenu={onBackupPlanContextMenu}
              onQueryPlanContextMenu={onQueryPlanContextMenu}
              onQueryItemContextMenu={onQueryItemContextMenu}
              onBackupItemContextMenu={onBackupItemContextMenu}
              onSelect={handleSelectSubItem}
              selectedHostUid={selectedHostUid}
            />

            <SpaceFolder 
              db={db}
              isActive={isActive}
              isLoggedIn={isLoggedIn}
              selectedDatabase={selectedDatabase}
              selectedDatabaseSubItem={selectedDatabaseSubItem}
              spaceInfo={spaceInfo[key]}
              spaceInfoLoading={spaceInfoLoading[key]}
              onSpaceContextMenu={onSpaceContextMenu}
              onSelect={handleSelectSubItem}
              onTabOpen={handleTabOpen}
              selectedHostUid={selectedHostUid}
            />
          </TreeNode>
        );
      })}
    </div>
  );
}

// Sub-components to isolate re-renders and logic
const UsersFolder = React.memo(({ db, isActive, isLoggedIn, selectedDatabase, selectedDatabaseSubItem, users, isLoading, error, onUsersContextMenu, onUserContextMenu, onSelect, selectedHostUid }) => {
  const CM = useCM();
  const dispatch = useDispatch();
  const isSelected = selectedDatabase === db.dbname && selectedDatabaseSubItem === 'Users';

  return (
    <TreeNode
      id="Users"
      label={CM.users}
      icon="group"
      level={2}
      isActive={isSelected}
      hasChildren={true}
      isLoading={isLoading}
      onToggle={() => {
        // isActive/isLoggedIn and !error mirror handleDbToggle's guard above
        // (see its comment) — userinfo re-connects to the database on every
        // call, and a failed attempt against an unreachable database can
        // crash CMS outright on a known-buggy CUBRID build if retried
        // immediately.
        if (selectedHostUid && isActive && isLoggedIn && !users && !isLoading && !error) {
          dispatch(fetchDatabaseUsers({ hostUid: selectedHostUid, dbname: db.dbname }));
        }
      }}
      onSelect={() => onSelect(db.dbname, 'Users')}
      onContextMenu={(e) => onUsersContextMenu(e, db.dbname, isActive, isLoggedIn)}
    >
      {!isLoading && users?.length === 0 ? (
        <div className="px-10 py-3 opacity-30 flex items-center gap-2">
           <Icon name="block" size="xs" weight={300} />
           <Typography variant="caption" className="italic font-bold uppercase tracking-widest text-10">{CM.emptyListLabel}</Typography>
        </div>
      ) : (
        (users || []).map(u => {
          const uName = typeof u === 'string' ? u : u.name;
          const isUSelected = selectedDatabase === db.dbname && selectedDatabaseSubItem === uName;
          return (
            <TreeNode
              key={uName}
              id={uName}
              label={uName}
              icon="person"
              level={3}
              isActive={isUSelected}
              onSelect={() => onSelect(db.dbname, uName)}
              onContextMenu={(e) => onUserContextMenu(e, db.dbname, uName, isActive, isLoggedIn)}
            />
          );
        })
      )}
    </TreeNode>
  );
});

const JobAutomationFolder = React.memo(({ db, isActive, isLoggedIn, selectedDatabase, selectedDatabaseSubItem, backupSchedules, backupSchedulesLoading, queryPlans, queryPlansLoading, onJobAutomationContextMenu, onBackupPlanContextMenu, onQueryPlanContextMenu, onQueryItemContextMenu, onBackupItemContextMenu, onSelect, selectedHostUid }) => {
  const CM = useCM();
  const dispatch = useDispatch();
  const isSelected = selectedDatabase === db.dbname && selectedDatabaseSubItem === 'Job automation';

  return (
    <TreeNode
      id="Job automation"
      label={CM.jobAutomation}
      icon="bolt"
      level={2}
      isActive={isSelected}
      hasChildren={true}
      onToggle={() => {
        // Same rule as UsersFolder's onToggle — never fetch per-db data
        // (backup schedules, query plans) before an actual dbmtuserlogin.
        if (selectedHostUid && isActive && isLoggedIn) {
          if (!backupSchedules && !backupSchedulesLoading) {
            dispatch(fetchBackupSchedule({ hostUid: selectedHostUid, dbname: db.dbname }));
          }
          if (!queryPlans && !queryPlansLoading) {
            dispatch(fetchQueryPlan({ hostUid: selectedHostUid, dbname: db.dbname }));
          }
        }
      }}
      onSelect={() => onSelect(db.dbname, 'Job automation')}
      onContextMenu={(e) => onJobAutomationContextMenu?.(e, db.dbname, isActive, isLoggedIn)}
    >
       <TreeNode
          id="Backup Plan"
          label={CM.backupPlan}
          icon="backup"
          level={3}
          isActive={selectedDatabase === db.dbname && selectedDatabaseSubItem === 'Backup Plan'}
          hasChildren={true}
          isLoading={backupSchedulesLoading}
          onSelect={() => onSelect(db.dbname, 'Backup Plan')}
          onContextMenu={(e) => onBackupPlanContextMenu(e, db.dbname, isActive, isLoggedIn)}
        >
          {backupSchedules?.map(plan => {
            const planId = plan.backupid;
            const isPlanSelected = selectedDatabase === db.dbname && selectedDatabaseSubItem === `backup:${planId}`;
            return (
              <TreeNode
                key={planId}
                id={planId}
                label={planId}
                icon="event_note"
                level={4}
                isActive={isPlanSelected}
                onSelect={() => onSelect(db.dbname, `backup:${planId}`)}
                onDoubleClick={() => {
                  dispatch(setSelectedDatabase(db.dbname));
                  dispatch(setSelectedBackupId(planId));
                  dispatch(openEditBackupPlanModal());
                }}
                onContextMenu={(e) => onBackupItemContextMenu(e, db.dbname, planId, isActive, isLoggedIn)}
              />
            );
          })}
        </TreeNode>

        <TreeNode
          id="Query Plan"
          label={CM.queryPlan}
          icon="schema"
          level={3}
          isActive={selectedDatabase === db.dbname && selectedDatabaseSubItem === 'Query Plan'}
          hasChildren={true}
          isLoading={queryPlansLoading}
          onSelect={() => onSelect(db.dbname, 'Query Plan')}
          onContextMenu={(e) => onQueryPlanContextMenu(e, db.dbname, isActive, isLoggedIn)}
        >
          {queryPlans?.map(plan => {
            const qId = plan.query_id;
            return (
              <TreeNode
                key={qId}
                id={qId}
                label={qId}
                icon="sticky_note_2"
                level={4}
                isActive={selectedDatabase === db.dbname && selectedDatabaseSubItem === `query:${qId}`}
                onSelect={() => onSelect(db.dbname, `query:${qId}`)}
                onDoubleClick={() => {
                  dispatch(setSelectedDatabase(db.dbname));
                  dispatch(openEditQueryPlanModal(qId));
                }}
                onContextMenu={(e) => onQueryItemContextMenu?.(e, db.dbname, qId, isActive, isLoggedIn)}
              />
            );
          })}
        </TreeNode>
    </TreeNode>
  );
});

const SpaceFolder = React.memo(({ db, isActive, isLoggedIn, selectedDatabase, selectedDatabaseSubItem, spaceInfo, spaceInfoLoading, onSpaceContextMenu, onSelect, onTabOpen, selectedHostUid }) => {
  const CM = useCM();
  const dispatch = useDispatch();
  const isSelected = selectedDatabase === db.dbname && selectedDatabaseSubItem === 'Space';

  const renderCategory = (id, label, icon, filterFn) => {
    const isCatSelected = selectedDatabase === db.dbname && selectedDatabaseSubItem === id;
    const volumes = spaceInfo?.volumes?.filter(filterFn) || [];

    return (
      <TreeNode
        id={id}
        label={label}
        icon={icon}
        level={3}
        isActive={isCatSelected}
        hasChildren={true}
        isLoading={spaceInfoLoading && !spaceInfo}
        onSelect={() => onSelect(db.dbname, id)}
        onDoubleClick={() => onTabOpen(`vol_category:${selectedHostUid}:${db.dbname}:${id}`)}
      >
        {volumes.map(vol => {
          const fileName = vol.spacename.split(/[\\/]/).pop();
          const subItemId = `vol:${vol.spacename}`;
          return (
            <TreeNode
              key={vol.spacename}
              id={vol.spacename}
              label={fileName}
              icon="description"
              level={4}
              isActive={selectedDatabase === db.dbname && selectedDatabaseSubItem === subItemId}
              onSelect={() => onSelect(db.dbname, subItemId)}
              onDoubleClick={() => onTabOpen(`vol_info:${selectedHostUid}:${db.dbname}:${vol.spacename}`)}
            />
          );
        })}
      </TreeNode>
    );
  };

  return (
    <TreeNode
      id="Space"
      label={CM.space}
      icon="donut_small"
      level={2}
      isActive={isSelected}
      hasChildren={true}
      onSelect={() => onSelect(db.dbname, 'Space')}
      onDoubleClick={() => onTabOpen(`db_space:${selectedHostUid}:${db.dbname}`)}
      onContextMenu={(e) => onSpaceContextMenu(e, db.dbname, isActive, isLoggedIn)}
      onToggle={() => {
        // Same rule as UsersFolder/JobAutomationFolder's onToggle — never
        // fetch per-db data (space info) before an actual dbmtuserlogin.
        if (selectedHostUid && isActive && isLoggedIn && !spaceInfoLoading && !spaceInfo) {
          dispatch(fetchDatabaseSpaceInfo({ hostUid: selectedHostUid, dbname: db.dbname }));
        }
      }}
    >
      {renderCategory('Permanent_PermanentData', 'Permanent Data', 'data_usage', v => v.type === 'PERMANENT' && (v.purpose === 'PERMANENT' || !v.purpose))}
      {renderCategory('Permanent_TemporaryData', CM.permanentTemp, 'layers', v => v.type === 'PERMANENT' && v.purpose === 'TEMPORARY')}
      {renderCategory('Temporary_TemporaryData', CM.temporary, 'auto_delete', v => v.type === 'TEMPORARY')}
      
      <TreeNode
        id="Log"
        label={CM.log}
        icon="history"
        level={3}
        isActive={selectedDatabase === db.dbname && selectedDatabaseSubItem === 'Log'}
        hasChildren={true}
      >
        {renderCategory('Active', CM.active, 'radio_button_checked', v => v.type === 'Active_log')}
        {renderCategory('Archive', 'Archive', 'inventory_2', v => v.type === 'Archive_log')}
      </TreeNode>
    </TreeNode>
  );
});
