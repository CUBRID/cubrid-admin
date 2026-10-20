/**
 * DEPRECATED: This monolithic file has been split into:
 * - databaseCoreSlice.js (Registry, Start/Stop, Auth)
 * - databaseMonitoringSlice.js (Dashboard, Space, Volumes)
 * - databaseOperationSlice.js (Backup, Restore, Maintenance)
 * - databaseUISlice.js (Modal states)
 * 
 * Existing components still import thunks and actions from here to minimize breaking changes.
 * Please update store.js to use the new reducers.
 */

// Re-export all thunks and actions from new modular slices explicitly
export {
  fetchDatabaseStartInfo, startDatabase, stopDatabase, loginDatabase, logoutDatabase, registerDatabase,
  deleteDatabaseProfile,
  setSelectedDatabase, setSelectedDatabaseSubItem, clearDatabaseError
} from './databaseCoreSlice';

export {
  fetchDatabaseVolumes, fetchDatabaseSpaceInfo, fetchDashboardVolumes, fetchDashboardLocks,
  fetchDashboardPerformance, fetchDashboardCAS, fetchDashboardData, clearMonitoringError
} from './databaseMonitoringSlice';

export {
  createDatabase, copyDatabase, deleteDatabase, renameDatabase, fetchCreateDatabaseInfo,
  addVolume, fetchBackupSchedule, addBackupSchedule,
  editBackupSchedule, deleteBackupSchedule, fetchBackupList, fetchBackupDbInfo,
  fetchAutoBackupLog, checkDatabase, compactDatabase, optimizeDatabase, loadDatabase,
  unloadDatabase, fetchQueryPlan, setAutoExecQuery, appendAutoExecQueryPlan, updateAutoExecQueryPlan, removeAutoExecQueryPlan, fetchQueryPlanLog, fetchLockInfo,
  fetchTransactionInfo, killTransaction, clearError
} from './databaseOperationSlice';

export {
  openUnloadDatabaseModal, closeUnloadDatabaseModal, openLoadDatabaseModal, closeLoadDatabaseModal,
  openCheckDatabaseModal, closeCheckDatabaseModal, openCompactDatabaseModal, closeCompactDatabaseModal,
  openCopyDatabaseModal, closeCopyDatabaseModal, openBackupDatabaseModal, closeBackupDatabaseModal, setPendingBackupJob, clearPendingBackupJob,
  openRestoreDatabaseModal, closeRestoreDatabaseModal, openOptimizeDatabaseModal, closeOptimizeDatabaseModal,
  openAddBackupPlanModal, closeAddBackupPlanModal, openEditBackupPlanModal, closeEditBackupPlanModal,
  openDeleteBackupPlanModal, closeDeleteBackupPlanModal, openAutoBackupLogModal, closeAutoBackupLogModal,
  openLockInformationModal, closeLockInformationModal, openUnloadResultModal, closeUnloadResultModal,
  openTransactionInfoModal, closeTransactionInfoModal, openKillTransactionModal, closeKillTransactionModal, notifyTransactionKilled,
  openDeleteDatabaseModal, closeDeleteDatabaseModal, openDatabasePropertyModal, closeDatabasePropertyModal,
  openRenameDatabaseModal, closeRenameDatabaseModal, openAddVolumeModal, closeAddVolumeModal,
  openDatabaseInfoModal, closeDatabaseInfoModal, openPlanDumpModal, closePlanDumpModal,
  openAddQueryPlanModal, closeAddQueryPlanModal, openAutoQueryLogModal, closeAutoQueryLogModal,
  openCreateDatabaseModal, closeCreateDatabaseModal, openSetAutomationVolumeModal, closeSetAutomationVolumeModal,
  openAutoVolumeLogModal, closeAutoVolumeLogModal, openLoginDatabaseModal, closeLoginDatabaseModal,
  openEditQueryPlanModal, closeEditQueryPlanModal, openDeleteQueryPlanModal, closeDeleteQueryPlanModal,
  setSelectedBackupId, clearSelectedBackupId, setSelectedQueryPlanId
} from './databaseUISlice';

export {
  fetchDatabaseParamDump, fetchDatabasePlanDump, fetchDatabaseClasses, fetchAutoVolumeConfig,
  updateAutoVolumeConfig, fetchAutoVolumeLog, resetPlanDumpState
} from './databaseConfigurationSlice';

// If any component still needs the single reducer, we combine them (not used by store.js anymore)
import { combineReducers } from '@reduxjs/toolkit';
import coreReducer from './databaseCoreSlice';
import monitoringReducer from './databaseMonitoringSlice';
import operationReducer from './databaseOperationSlice';
import uiReducer from './databaseUISlice';
import configurationReducer from './databaseConfigurationSlice';

const databaseReducer = combineReducers({
  core: coreReducer,
  monitoring: monitoringReducer,
  operation: operationReducer,
  ui: uiReducer,
  configuration: configurationReducer
});

export default databaseReducer;
