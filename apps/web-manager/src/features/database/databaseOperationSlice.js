import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { databaseApi } from './databaseApi';
import { fetchDatabaseStartInfo } from './databaseCoreSlice';
import { isAmbiguousFailure } from '../../api/isAmbiguousFailure';
import { dbKey } from './dbKey';

// Lifecycle Operations
export const createDatabase = createAsyncThunk(
  'database/createDatabase',
  async ({ hostUid, payload }, { rejectWithValue, dispatch }) => {
    try {
      const response = await databaseApi.createDatabase(hostUid, payload);
      return response;
    } catch (err) {
      if (isAmbiguousFailure(err)) dispatch(fetchDatabaseStartInfo(hostUid));
      return rejectWithValue(err.response?.data?.message || 'Failed to create database');
    }
  }
);

export const copyDatabase = createAsyncThunk(
  'database/copyDatabase',
  async ({ hostUid, payload }, { rejectWithValue, dispatch }) => {
    try {
      const response = await databaseApi.copyDatabase(hostUid, payload);
      return response;
    } catch (err) {
      if (isAmbiguousFailure(err)) dispatch(fetchDatabaseStartInfo(hostUid));
      return rejectWithValue(err.response?.data?.message || 'Failed to copy database');
    }
  }
);

export const deleteDatabase = createAsyncThunk(
  'database/deleteDatabase',
  async ({ hostUid, dbname, payload }, { rejectWithValue, dispatch }) => {
    try {
      const response = await databaseApi.deleteDatabase(hostUid, dbname, payload);
      return { dbname, response };
    } catch (err) {
      if (isAmbiguousFailure(err)) dispatch(fetchDatabaseStartInfo(hostUid));
      return rejectWithValue(err.response?.data?.message || `Failed to delete database ${dbname}`);
    }
  }
);

export const renameDatabase = createAsyncThunk(
  'database/renameDatabase',
  async ({ hostUid, dbname, payload }, { rejectWithValue, dispatch }) => {
    try {
      const response = await databaseApi.renameDatabase(hostUid, dbname, payload);
      return { dbname, newName: payload.newName, response };
    } catch (err) {
      if (isAmbiguousFailure(err)) dispatch(fetchDatabaseStartInfo(hostUid));
      return rejectWithValue(err.response?.data?.message || `Failed to rename database ${dbname}`);
    }
  }
);

export const fetchCreateDatabaseInfo = createAsyncThunk(
  'database/fetchCreateDatabaseInfo',
  async ({ hostUid }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getCreateDatabaseInfo(hostUid);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch database creation info');
    }
  }
);

// Volume Management
export const addVolume = createAsyncThunk(
  'database/addVolume',
  async ({ hostUid, dbname, payload }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.addVolume(hostUid, dbname, payload);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to add volume to ${dbname}`);
    }
  }
);

// Backup & Restore
// restoreDatabase moved to the CMS job queue (databaseJobApi.submitRestore +
// useCmsJob) — restoredb is long-running, see RestoreDatabaseModal.jsx.

export const fetchBackupSchedule = createAsyncThunk(
  'database/fetchBackupSchedule',
  async ({ hostUid, dbname }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getBackupSchedule(hostUid, dbname);
      return { dbname, schedules: response.backups || [] };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to fetch backup schedules for ${dbname}`);
    }
  }
);

export const addBackupSchedule = createAsyncThunk(
  'database/addBackupSchedule',
  async ({ hostUid, dbname, payload }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.addBackupSchedule(hostUid, dbname, payload);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to add backup schedule for ${dbname}`);
    }
  }
);

export const editBackupSchedule = createAsyncThunk(
  'database/editBackupSchedule',
  async ({ hostUid, dbname, payload }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.editBackupSchedule(hostUid, dbname, payload);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to update backup schedule for ${dbname}`);
    }
  }
);

export const deleteBackupSchedule = createAsyncThunk(
  'database/deleteBackupSchedule',
  async ({ hostUid, dbname, payload }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.deleteBackupSchedule(hostUid, dbname, payload);
      return { dbname, backupid: payload?.backupid, response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to delete backup schedule ${payload?.backupid}`);
    }
  }
);

export const fetchBackupList = createAsyncThunk(
  'database/fetchBackupList',
  async ({ hostUid, dbname }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getBackupList(hostUid, dbname);
      return { dbname, backups: response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to fetch backup list for ${dbname}`);
    }
  }
);

export const fetchBackupDbInfo = createAsyncThunk(
  'database/fetchBackupDbInfo',
  async ({ hostUid, dbname }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getBackupDbInfo(hostUid, dbname);
      return { dbname, info: response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to fetch backup info for ${dbname}`);
    }
  }
);

export const fetchAutoBackupLog = createAsyncThunk(
  'database/fetchAutoBackupLog',
  async ({ hostUid }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getAutoBackupLog(hostUid);
      return response.error || [];
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch auto backup log');
    }
  }
);

// Maintenance
export const checkDatabase = createAsyncThunk(
  'database/checkDatabase',
  async ({ hostUid, dbname, payload }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.checkDatabase(hostUid, dbname, payload);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to check database ${dbname}`);
    }
  }
);

export const compactDatabase = createAsyncThunk(
  'database/compactDatabase',
  async ({ hostUid, dbname, payload }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.compactDatabase(hostUid, dbname, payload);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to compact database ${dbname}`);
    }
  }
);

export const optimizeDatabase = createAsyncThunk(
  'database/optimizeDatabase',
  async ({ hostUid, dbname, payload }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.optimizeDatabase(hostUid, dbname, payload);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to optimize database ${dbname}`);
    }
  }
);

// Data Transfers
export const loadDatabase = createAsyncThunk(
  'database/loadDatabase',
  async ({ hostUid, dbname, payload }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.loadDatabase(hostUid, dbname, payload);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to load database ${dbname}`);
    }
  }
);

export const unloadDatabase = createAsyncThunk(
  'database/unloadDatabase',
  async ({ hostUid, dbname, payload }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.unloadDatabase(hostUid, dbname, payload);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to unload database ${dbname}`);
    }
  }
);

// Query Plan Operations
export const fetchQueryPlan = createAsyncThunk(
  'database/fetchQueryPlan',
  async ({ hostUid, dbname }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getQueryPlan(hostUid, dbname);
      // The backend returns { planlist: [ { dbname, queryplan: [] } ] }
      const dbEntry = response.planlist?.find(p => p.dbname === dbname);
      return { dbname, plan: dbEntry?.queryplan || [] };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to fetch query plans for ${dbname}`);
    }
  }
);

export const setAutoExecQuery = createAsyncThunk(
  'database/setAutoExecQuery',
  async ({ hostUid, dbname, payload }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.setAutoExecQuery(hostUid, dbname, payload);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to set auto exec query for ${dbname}`);
    }
  }
);

export const appendAutoExecQueryPlan = createAsyncThunk(
  'database/appendAutoExecQueryPlan',
  async ({ hostUid, dbname, plan }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.appendAutoExecQueryPlan(hostUid, dbname, plan);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to add query plan for ${dbname}`);
    }
  }
);

export const updateAutoExecQueryPlan = createAsyncThunk(
  'database/updateAutoExecQueryPlan',
  async ({ hostUid, dbname, plan }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.updateAutoExecQueryPlan(hostUid, dbname, plan);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to update query plan for ${dbname}`);
    }
  }
);

export const removeAutoExecQueryPlan = createAsyncThunk(
  'database/removeAutoExecQueryPlan',
  async ({ hostUid, dbname, queryId }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.removeAutoExecQueryPlan(hostUid, dbname, queryId);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to remove query plan for ${dbname}`);
    }
  }
);

export const fetchQueryPlanLog = createAsyncThunk(
  'database/fetchQueryPlanLog',
  async ({ hostUid }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getQueryPlanLog(hostUid);
      // Fallback: handle if response is the log array itself or if it has a 'log', 'error', 'caslog', 'plan_log', or 'logs' key
      if (Array.isArray(response)) return response;
      if (response && typeof response === 'object') {
        const payload = response.data || response.log || response.error || response.caslog || response.plan_log || response.logs;
        if (Array.isArray(payload)) return payload;
        // If response has non-array 'error' key (like error message), ignore it and check next
        if (typeof response.error === 'string') return [];
      }
      return Array.isArray(response) ? response : [];
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch query plan log');
    }
  }
);

// Locks & Transactions
export const fetchLockInfo = createAsyncThunk(
  'database/fetchLockInfo',
  async ({ hostUid, dbname }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getLockInfo(hostUid, dbname);
      return { dbname, info: response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to fetch lock info for ${dbname}`);
    }
  }
);

export const fetchTransactionInfo = createAsyncThunk(
  'database/fetchTransactionInfo',
  async ({ hostUid, dbname, payload }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getTransactionInfo(hostUid, dbname, payload);
      return { dbname, info: response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to fetch transaction info for ${dbname}`);
    }
  }
);

export const killTransaction = createAsyncThunk(
  'database/killTransaction',
  async ({ hostUid, dbname, payload }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.killTransaction(hostUid, dbname, payload);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to kill transaction in ${dbname}`);
    }
  }
);

const initialState = {
  createDatabaseInfo: null,
  createDatabaseInfoLoading: false,
  backupSchedules: {},
  backupSchedulesLoading: {},
  databaseBackups: {},
  databaseBackupsLoading: {},
  backupDbInfo: {},
  backupDbInfoLoading: {},
  autoBackupLogs: [],
  logsLoading: false,
  logsError: null,
  queryPlans: {},
  queryPlansLoading: {},
  queryPlanLogs: [],
  lockInfo: {},
  transactionInfo: {},
  operationLoading: false,
  actionLoading: false,
  error: null,
};

const databaseOperationSlice = createSlice({
  name: 'databaseOperation',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(createDatabase.pending, (state) => { state.operationLoading = true; })
      .addCase(createDatabase.fulfilled, (state) => { state.operationLoading = false; })
      .addCase(createDatabase.rejected, (state, action) => { state.operationLoading = false; state.error = action.payload; })
      
      .addCase(fetchCreateDatabaseInfo.pending, (state) => {
        state.createDatabaseInfoLoading = true;
      })
      .addCase(fetchCreateDatabaseInfo.fulfilled, (state, action) => {
        state.createDatabaseInfoLoading = false;
        state.createDatabaseInfo = action.payload;
      })

      .addCase(addVolume.pending, (state) => { state.actionLoading = true; state.error = null; })
      .addCase(addVolume.fulfilled, (state) => { state.actionLoading = false; })
      .addCase(addVolume.rejected, (state, action) => { state.actionLoading = false; state.error = action.payload; })

      .addCase(fetchBackupSchedule.pending, (state, action) => {
        const { hostUid, dbname } = action.meta.arg;
        state.backupSchedulesLoading[dbKey(hostUid, dbname)] = true;
      })
      .addCase(fetchBackupSchedule.fulfilled, (state, action) => {
        const { hostUid } = action.meta.arg;
        const { dbname, schedules } = action.payload;
        const key = dbKey(hostUid, dbname);
        state.backupSchedulesLoading[key] = false;
        state.backupSchedules[key] = schedules;
      })

      .addCase(fetchBackupList.pending, (state, action) => {
        const { hostUid, dbname } = action.meta.arg;
        state.databaseBackupsLoading[dbKey(hostUid, dbname)] = true;
      })
      .addCase(fetchBackupList.fulfilled, (state, action) => {
        const { hostUid } = action.meta.arg;
        const { dbname, backups } = action.payload;
        const key = dbKey(hostUid, dbname);
        state.databaseBackupsLoading[key] = false;
        state.databaseBackups[key] = backups;
      })

      .addCase(fetchBackupDbInfo.pending, (state, action) => {
        const { hostUid, dbname } = action.meta.arg;
        state.backupDbInfoLoading[dbKey(hostUid, dbname)] = true;
      })
      .addCase(fetchBackupDbInfo.fulfilled, (state, action) => {
        const { hostUid } = action.meta.arg;
        const { dbname, info } = action.payload;
        const key = dbKey(hostUid, dbname);
        state.backupDbInfoLoading[key] = false;
        state.backupDbInfo[key] = info;
      })

      .addCase(fetchAutoBackupLog.pending, (state) => {
        state.logsLoading = true;
        state.logsError = null;
      })
      .addCase(fetchAutoBackupLog.fulfilled, (state, action) => {
        state.logsLoading = false;
        state.autoBackupLogs = action.payload;
      })
      .addCase(fetchAutoBackupLog.rejected, (state, action) => {
        state.logsLoading = false;
        state.logsError = action.payload;
      })

      .addCase(fetchQueryPlan.pending, (state, action) => {
        const { hostUid, dbname } = action.meta.arg;
        state.queryPlansLoading[dbKey(hostUid, dbname)] = true;
      })
      .addCase(fetchQueryPlan.fulfilled, (state, action) => {
        const { hostUid } = action.meta.arg;
        const { dbname, plan } = action.payload;
        const key = dbKey(hostUid, dbname);
        state.queryPlansLoading[key] = false;
        state.queryPlans[key] = plan;
      })
      .addCase(fetchLockInfo.fulfilled, (state, action) => {
        const { dbname, info } = action.payload;
        state.lockInfo[dbname] = info;
      })
      .addCase(fetchTransactionInfo.fulfilled, (state, action) => {
        const { dbname, info } = action.payload;
        state.transactionInfo[dbname] = info;
      })
      
      // Backup Schedule cases
      .addCase(addBackupSchedule.pending, (state) => { 
        state.operationLoading = true; 
        state.error = null; 
      })
      .addCase(addBackupSchedule.fulfilled, (state) => { state.operationLoading = false; })
      .addCase(addBackupSchedule.rejected, (state, action) => { 
        state.operationLoading = false; 
        state.error = action.payload; 
      })

      .addCase(editBackupSchedule.pending, (state) => { 
        state.actionLoading = true; 
        state.error = null; 
      })
      .addCase(editBackupSchedule.fulfilled, (state) => { state.actionLoading = false; })
      .addCase(editBackupSchedule.rejected, (state, action) => { 
        state.actionLoading = false; 
        state.error = action.payload; 
      })

      
      .addCase(fetchQueryPlan.rejected, (state, action) => {
        const { hostUid, dbname } = action.meta.arg;
        state.queryPlansLoading[dbKey(hostUid, dbname)] = false;
        state.error = action.payload;
      })
      
      .addCase(fetchQueryPlanLog.pending, (state) => {
        state.logsLoading = true;
        state.logsError = null;
      })
      .addCase(fetchQueryPlanLog.fulfilled, (state, action) => {
        state.logsLoading = false;
        state.queryPlanLogs = action.payload || [];
      })
      .addCase(fetchQueryPlanLog.rejected, (state, action) => {
        state.logsLoading = false;
        state.logsError = action.payload;
      })
      // Drop cached backup schedules/query plans once a database's dbmt
      // login is gone (explicit logout or forgetting its saved credentials)
      // — otherwise the stale list from the old login stays visible.
      .addMatcher(
        (action) => action.type === 'database/logoutDatabase/fulfilled' || action.type === 'database/deleteDatabaseProfile/fulfilled',
        (state, action) => {
          const { hostUid, dbname } = action.meta.arg;
          const key = dbKey(hostUid, dbname);
          delete state.backupSchedules[key];
          delete state.backupSchedulesLoading[key];
          delete state.queryPlans[key];
          delete state.queryPlansLoading[key];
        }
      );
  }
});

export const { clearError } = databaseOperationSlice.actions;
export default databaseOperationSlice.reducer;
