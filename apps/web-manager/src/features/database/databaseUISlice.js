import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  isUnloadDatabaseModalOpen: false,
  isLoadDatabaseModalOpen: false,
  isCheckDatabaseModalOpen: false,
  isCompactDatabaseModalOpen: false,
  isCopyDatabaseModalOpen: false,
  isBackupDatabaseModalOpen: false,
  pendingBackupJob: null, // { jobId, dbname } — survives modal close for reconnect
  isRestoreDatabaseModalOpen: false,
  isOptimizeDatabaseModalOpen: false,
  isAddBackupPlanModalOpen: false,
  isEditBackupPlanModalOpen: false,
  isDeleteBackupPlanModalOpen: false,
  isAutoBackupLogModalOpen: false,
  isLockInformationModalOpen: false,
  isUnloadResultModalOpen: false,
  isTransactionInfoModalOpen: false,
  isKillTransactionModalOpen: false,
  isDeleteDatabaseModalOpen: false,
  isDatabasePropertyModalOpen: false,
  isRenameDatabaseModalOpen: false,
  isAddVolumeModalOpen: false,
  isDatabaseInfoModalOpen: false,
  isPlanDumpModalOpen: false,
  isAddQueryPlanModalOpen: false,
  isAutoQueryLogModalOpen: false,
  isCreateDatabaseModalOpen: false,
  isSetAutomationVolumeModalOpen: false,
  isAutoVolumeLogModalOpen: false,
  isLoginDatabaseModalOpen: false,
  isEditQueryPlanModalOpen: false,
  isDeleteQueryPlanModalOpen: false,
  // isAddDatabaseModalOpen removed (redundant)
  
  // Modal Data
  deleteDatabaseName: null,
  loginDatabaseName: null,
  unloadDatabaseName: null,
  loadDatabaseName: null,
  restoreDatabaseName: null,
  deleteBackupPlanData: null,
  editBackupPlanData: null,
  autoBackupLogData: null,
  unloadResultData: null,
  transactionInfoData: null,
  killTransactionData: null,

  selectedBackupId: null,
  selectedQueryPlanId: null,

  // Bumped whenever a transaction kill succeeds so TransactionInfoModal and
  // DBLockTransactionSection (which hold their own local/Redux data separate
  // from this slice) can react and refetch, since KillTransactionModal is a
  // single global instance with no direct reference back to its opener.
  transactionKillSignal: 0,
};

const databaseUISlice = createSlice({
  name: 'databaseUI',
  initialState,
  reducers: {
    openUnloadDatabaseModal: (state, action) => { 
      state.isUnloadDatabaseModalOpen = true; 
      state.unloadDatabaseName = action.payload;
    },
    closeUnloadDatabaseModal: (state) => { state.isUnloadDatabaseModalOpen = false; },
    
    openLoadDatabaseModal: (state, action) => { 
      state.isLoadDatabaseModalOpen = true; 
      state.loadDatabaseName = action.payload;
    },
    closeLoadDatabaseModal: (state) => { state.isLoadDatabaseModalOpen = false; },
    
    openCheckDatabaseModal: (state) => { state.isCheckDatabaseModalOpen = true; },
    closeCheckDatabaseModal: (state) => { state.isCheckDatabaseModalOpen = false; },
    
    openCompactDatabaseModal: (state) => { state.isCompactDatabaseModalOpen = true; },
    closeCompactDatabaseModal: (state) => { state.isCompactDatabaseModalOpen = false; },
    
    openCopyDatabaseModal: (state) => { state.isCopyDatabaseModalOpen = true; },
    closeCopyDatabaseModal: (state) => { state.isCopyDatabaseModalOpen = false; },
    
    openBackupDatabaseModal: (state) => { state.isBackupDatabaseModalOpen = true; },
    closeBackupDatabaseModal: (state) => { state.isBackupDatabaseModalOpen = false; },
    setPendingBackupJob: (state, action) => { state.pendingBackupJob = action.payload; },
    clearPendingBackupJob: (state) => { state.pendingBackupJob = null; },
    
    openRestoreDatabaseModal: (state, action) => { 
      state.isRestoreDatabaseModalOpen = true; 
      state.restoreDatabaseName = action.payload;
    },
    closeRestoreDatabaseModal: (state) => { state.isRestoreDatabaseModalOpen = false; },
    
    openOptimizeDatabaseModal: (state) => { state.isOptimizeDatabaseModalOpen = true; },
    closeOptimizeDatabaseModal: (state) => { state.isOptimizeDatabaseModalOpen = false; },
    
    openAddBackupPlanModal: (state) => { state.isAddBackupPlanModalOpen = true; },
    closeAddBackupPlanModal: (state) => { state.isAddBackupPlanModalOpen = false; },
    
    openEditBackupPlanModal: (state, action) => { 
      state.isEditBackupPlanModalOpen = true; 
      state.editBackupPlanData = action.payload;
    },
    closeEditBackupPlanModal: (state) => { state.isEditBackupPlanModalOpen = false; },
    
    openDeleteBackupPlanModal: (state, action) => { 
      state.isDeleteBackupPlanModalOpen = true; 
      state.deleteBackupPlanData = action.payload;
    },
    closeDeleteBackupPlanModal: (state) => { state.isDeleteBackupPlanModalOpen = false; },
    
    openAutoBackupLogModal: (state, action) => { 
      state.isAutoBackupLogModalOpen = true; 
      state.autoBackupLogData = action.payload;
    },
    closeAutoBackupLogModal: (state) => { state.isAutoBackupLogModalOpen = false; },
    
    openLockInformationModal: (state) => { state.isLockInformationModalOpen = true; },
    closeLockInformationModal: (state) => { state.isLockInformationModalOpen = false; },
    
    openUnloadResultModal: (state, action) => { 
      state.isUnloadResultModalOpen = true; 
      state.unloadResultData = action.payload;
    },
    closeUnloadResultModal: (state) => { state.isUnloadResultModalOpen = false; },
    
    openTransactionInfoModal: (state, action) => { 
      state.isTransactionInfoModalOpen = true; 
      state.transactionInfoData = action.payload;
    },
    closeTransactionInfoModal: (state) => { state.isTransactionInfoModalOpen = false; },
    
    openKillTransactionModal: (state, action) => { 
      state.isKillTransactionModalOpen = true; 
      state.killTransactionData = action.payload;
    },
    closeKillTransactionModal: (state) => {
      state.isKillTransactionModalOpen = false;
      state.killTransactionData = null;
    },
    notifyTransactionKilled: (state) => {
      state.transactionKillSignal += 1;
    },
    
    openDeleteDatabaseModal: (state, action) => { 
      state.isDeleteDatabaseModalOpen = true; 
      state.deleteDatabaseName = action.payload;
    },
    closeDeleteDatabaseModal: (state) => { state.isDeleteDatabaseModalOpen = false; },
    
    openDatabasePropertyModal: (state) => { state.isDatabasePropertyModalOpen = true; },
    closeDatabasePropertyModal: (state) => { state.isDatabasePropertyModalOpen = false; },
    
    openRenameDatabaseModal: (state) => { state.isRenameDatabaseModalOpen = true; },
    closeRenameDatabaseModal: (state) => { state.isRenameDatabaseModalOpen = false; },
    
    openAddVolumeModal: (state) => { state.isAddVolumeModalOpen = true; },
    closeAddVolumeModal: (state) => { state.isAddVolumeModalOpen = false; },
    
    openDatabaseInfoModal: (state) => { state.isDatabaseInfoModalOpen = true; },
    closeDatabaseInfoModal: (state) => { state.isDatabaseInfoModalOpen = false; },
    
    openPlanDumpModal: (state) => { state.isPlanDumpModalOpen = true; },
    closePlanDumpModal: (state) => { state.isPlanDumpModalOpen = false; },
    
    openAddQueryPlanModal: (state) => { state.isAddQueryPlanModalOpen = true; },
    closeAddQueryPlanModal: (state) => { state.isAddQueryPlanModalOpen = false; },
    
    openAutoQueryLogModal: (state) => { state.isAutoQueryLogModalOpen = true; },
    closeAutoQueryLogModal: (state) => { state.isAutoQueryLogModalOpen = false; },
    
    openCreateDatabaseModal: (state) => { state.isCreateDatabaseModalOpen = true; },
    closeCreateDatabaseModal: (state) => { state.isCreateDatabaseModalOpen = false; },
    
    openSetAutomationVolumeModal: (state) => { state.isSetAutomationVolumeModalOpen = true; },
    closeSetAutomationVolumeModal: (state) => { state.isSetAutomationVolumeModalOpen = false; },
    
    openAutoVolumeLogModal: (state) => { state.isAutoVolumeLogModalOpen = true; },
    closeAutoVolumeLogModal: (state) => { state.isAutoVolumeLogModalOpen = false; },
    
    openEditQueryPlanModal: (state, action) => { 
      state.isEditQueryPlanModalOpen = true; 
      state.selectedQueryPlanId = action.payload;
    },
    closeEditQueryPlanModal: (state) => { state.isEditQueryPlanModalOpen = false; },

    openDeleteQueryPlanModal: (state, action) => { 
      state.isDeleteQueryPlanModalOpen = true; 
      state.selectedQueryPlanId = action.payload;
    },
    closeDeleteQueryPlanModal: (state) => { state.isDeleteQueryPlanModalOpen = false; },
    
    openLoginDatabaseModal: (state, action) => { 
      state.isLoginDatabaseModalOpen = true; 
      state.loginDatabaseName = action.payload;
    },
    closeLoginDatabaseModal: (state) => { state.isLoginDatabaseModalOpen = false; },
    
    setSelectedBackupId: (state, action) => { state.selectedBackupId = action.payload; },
    clearSelectedBackupId: (state) => { state.selectedBackupId = null; },
    setSelectedQueryPlanId: (state, action) => { state.selectedQueryPlanId = action.payload; },
  }
});

export const {
  openUnloadDatabaseModal, closeUnloadDatabaseModal,
  openLoadDatabaseModal, closeLoadDatabaseModal,
  openCheckDatabaseModal, closeCheckDatabaseModal,
  openCompactDatabaseModal, closeCompactDatabaseModal,
  openCopyDatabaseModal, closeCopyDatabaseModal,
  openBackupDatabaseModal, closeBackupDatabaseModal, setPendingBackupJob, clearPendingBackupJob,
  openRestoreDatabaseModal, closeRestoreDatabaseModal,
  openOptimizeDatabaseModal, closeOptimizeDatabaseModal,
  openAddBackupPlanModal, closeAddBackupPlanModal,
  openEditBackupPlanModal, closeEditBackupPlanModal,
  openDeleteBackupPlanModal, closeDeleteBackupPlanModal,
  openAutoBackupLogModal, closeAutoBackupLogModal,
  openLockInformationModal, closeLockInformationModal,
  openUnloadResultModal, closeUnloadResultModal,
  openTransactionInfoModal, closeTransactionInfoModal,
  openKillTransactionModal, closeKillTransactionModal, notifyTransactionKilled,
  openDeleteDatabaseModal, closeDeleteDatabaseModal,
  openDatabasePropertyModal, closeDatabasePropertyModal,
  openRenameDatabaseModal, closeRenameDatabaseModal,
  openAddVolumeModal, closeAddVolumeModal,
  openDatabaseInfoModal, closeDatabaseInfoModal,
  openPlanDumpModal, closePlanDumpModal,
  openAddQueryPlanModal, closeAddQueryPlanModal,
  openAutoQueryLogModal, closeAutoQueryLogModal,
  openCreateDatabaseModal, closeCreateDatabaseModal,
  openSetAutomationVolumeModal, closeSetAutomationVolumeModal,
  openAutoVolumeLogModal, closeAutoVolumeLogModal,
  openLoginDatabaseModal, closeLoginDatabaseModal,
  openEditQueryPlanModal, closeEditQueryPlanModal,
  openDeleteQueryPlanModal, closeDeleteQueryPlanModal,
  setSelectedBackupId, clearSelectedBackupId, setSelectedQueryPlanId
} = databaseUISlice.actions;



export default databaseUISlice.reducer;
