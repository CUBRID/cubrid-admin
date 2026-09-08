import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { brokerApi } from './brokerApi';
import { isAmbiguousFailure } from '../../api/isAmbiguousFailure';
import { createRateTracker } from './rateTracker';

const generateId = () => Math.random().toString(36).substring(2, 6);

// Module-level so the previous-sample baseline survives across polls and
// across every host/broker tab, keyed by hostUid+brokerName below.
const brokerRateTracker = createRateTracker();

export const fetchBrokerList = createAsyncThunk(
  'broker/fetchBrokerList',
  async (arg, { rejectWithValue }) => {
    const hostUid = typeof arg === 'string' ? arg : arg.hostUid;
    try {
      const response = await brokerApi.getBrokerList(hostUid);
      const brokerList = response.result || (Array.isArray(response) ? response[0]?.broker : []);
      
      if (!brokerList) return [];

      const formattedBrokers = brokerList.map(item => ({
        ...item,
        name: item.name,
        state: item.state || item.status,
        pid: item.pid,
        port: item.port,
        as: item.as,
        jq: item.jq,
        req: item.req,
        long_tran: item.long_tran || '0',
        long_tran_time: item.long_tran_time || '0',
        long_query: item.long_query || '0',
        long_query_time: item.long_query_time || '0',
        error_query: item.error_query || '0',
      }));

      const responses = await Promise.all(
        formattedBrokers.map(async (b) => {
          try {
            const statusRes = await brokerApi.getBrokerStatus(hostUid, b.name);
            return { b, statusRes, success: true };
          } catch (err) {
            return { b, success: false };
          }
        })
      );

      const dataSource = responses.map((r) => {
        if (!r.success) return null;
        const asList = r.statusRes?.asinfo;
        if (!asList?.length) return r.b;

        // as_num_query/as_num_tran are per-AS lifetime totals — sum across
        // every AS process for this broker, then convert to a rate below.
        const totalQuery = asList.reduce((sum, as) => sum + (Number(as.as_num_query) || 0), 0);
        const totalTran = asList.reduce((sum, as) => sum + (Number(as.as_num_tran) || 0), 0);
        const trackerKey = `${hostUid}:${r.b.name}`;
        const qps = brokerRateTracker(`${trackerKey}:qps`, totalQuery);
        const tps = brokerRateTracker(`${trackerKey}:tps`, totalTran);

        return {
          ...r.b,
          key: r.b.name,
          qps: qps === null ? null : qps.toFixed(1),
          tps: tps === null ? null : tps.toFixed(1),
        };
      }).filter(Boolean);

      return dataSource;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch broker list');
    }
  }
);

export const fetchDetailedBrokerStatus = createAsyncThunk(
  'broker/fetchDetailedBrokerStatus',
  async ({ hostUid, brokerName }, { rejectWithValue }) => {
    try {
      const response = await brokerApi.getBrokerStatus(hostUid, brokerName);
      return { brokerName, data: response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to fetch status for broker ${brokerName}`);
    }
  }
);

export const startBroker = createAsyncThunk(
  'broker/startBroker',
  async ({ hostUid, brokerName }, { dispatch, rejectWithValue }) => {
    try {
      await brokerApi.startBroker(hostUid, brokerName);
      dispatch(fetchBrokerList(hostUid));
      return { brokerName, success: true };
    } catch (err) {
      if (isAmbiguousFailure(err)) dispatch(fetchBrokerList(hostUid));
      return rejectWithValue(err.response?.data?.message || 'Failed to start broker');
    }
  }
);

export const stopBroker = createAsyncThunk(
  'broker/stopBroker',
  async ({ hostUid, brokerName }, { dispatch, rejectWithValue }) => {
    try {
      await brokerApi.stopBroker(hostUid, brokerName);
      dispatch(fetchBrokerList(hostUid));
      return { brokerName, success: true };
    } catch (err) {
      if (isAmbiguousFailure(err)) dispatch(fetchBrokerList(hostUid));
      return rejectWithValue(err.response?.data?.message || 'Failed to stop broker');
    }
  }
);

export const startAllBrokers = createAsyncThunk(
  'broker/startAllBrokers',
  async (hostUid, { dispatch, rejectWithValue }) => {
    try {
      await brokerApi.startAllBrokers(hostUid);
      dispatch(fetchBrokerList(hostUid));
      return { success: true };
    } catch (err) {
      if (isAmbiguousFailure(err)) dispatch(fetchBrokerList(hostUid));
      return rejectWithValue(err.response?.data?.message || 'Failed to start all brokers');
    }
  }
);

export const stopAllBrokers = createAsyncThunk(
  'broker/stopAllBrokers',
  async (hostUid, { dispatch, rejectWithValue }) => {
    try {
      await brokerApi.stopAllBrokers(hostUid);
      dispatch(fetchBrokerList(hostUid));
      return { success: true };
    } catch (err) {
      if (isAmbiguousFailure(err)) dispatch(fetchBrokerList(hostUid));
      return rejectWithValue(err.response?.data?.message || 'Failed to stop all brokers');
    }
  }
);

export const fetchBrokerLogs = createAsyncThunk(
  'broker/fetchBrokerLogs',
  async ({ hostUid, brokerName }, { rejectWithValue }) => {
    try {
      const response = await brokerApi.getBrokerLogs(hostUid, brokerName);
      const logs = response.logfileinfo?.[0]?.logfile || [];
      return { brokerName, logs };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch broker logs');
    }
  }
);

export const fetchLogContent = createAsyncThunk(
  'broker/fetchLogContent',
  async ({ hostUid, path, start = '1', end = '100' }, { rejectWithValue }) => {
    try {
      const response = await brokerApi.viewLog(hostUid, { path, start, end });
      return { path, data: response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch log content');
    }
  }
);

export const fetchAdminLogs = createAsyncThunk(
  'broker/fetchAdminLogs',
  async (hostUid, { rejectWithValue }) => {
    try {
      const response = await brokerApi.getAdminLogs(hostUid);
      return { hostUid, logs: response.adminloginfo || [] };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch admin logs');
    }
  }
);

export const fetchCMSLogs = createAsyncThunk(
  'broker/fetchCMSLogs',
  async (hostUid, { rejectWithValue }) => {
    try {
      const response = await brokerApi.getCMSLogs(hostUid);
      return { hostUid, logs: response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch CMS logs');
    }
  }
);

export const fetchDatabaseLogs = createAsyncThunk(
  'broker/fetchDatabaseLogs',
  async ({ hostUid, dbname }, { rejectWithValue }) => {
    try {
      const response = await brokerApi.getDatabaseLogs(hostUid, dbname);
      return { dbname, logs: response.loginfo?.[0]?.log || [] };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to fetch logs for database ${dbname}`);
    }
  }
);

export const fetchBrokerConfig = createAsyncThunk(
  'broker/fetchBrokerConfig',
  async ({ hostUid }, { rejectWithValue }) => {
    try {
      const response = await brokerApi.getBrokerConfig(hostUid);
      return { hostUid, data: response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch broker configuration');
    }
  }
);

export const updateBrokerConfig = createAsyncThunk(
  'broker/updateBrokerConfig',
  async ({ hostUid, confdata }, { dispatch, rejectWithValue }) => {
    try {
      await brokerApi.updateBrokerConfig(hostUid, confdata);
      dispatch(fetchBrokerConfig({ hostUid }));
      return { success: true };
    } catch (err) {
      if (isAmbiguousFailure(err)) dispatch(fetchBrokerConfig({ hostUid }));
      return rejectWithValue(err.response?.data?.message || 'Failed to update broker configuration');
    }
  }
);

const initialState = {
  brokers: [],
  selectedBroker: null,
  selectedBrokerSubItem: null,
  detailedStatus: {}, // { brokerName: { data: {}, loading: false, error: null } }
  logsByBroker: {}, // { brokerName: [logs] }
  viewingLogs: {}, // { path: { data: {}, loading: false, error: null } }
  adminLogsByHost: {}, // { hostUid: [logs] }
  loading: false,
  actionLoading: false,
  lastActionTarget: null, // Track broker name
  lastActionType: null,   // Track 'start' or 'stop'
  logsLoadingCount: 0,
  logsLoading: false,
  adminLogsLoading: false,
  cmsLogsByHost: {}, // { hostUid: { accesslog: [], errorlog: [] } }
  cmsLogsLoading: false,
  dbLogsByDbName: {}, // { dbname: [logs] }
  dbLogsLoading: false,
  brokerConfig: {}, // { hostUid: { data: {}, loading: false, error: null } }
  latestBrokerListRequestId: null,
  propertyModal: {
    isOpen: false,
    brokerName: null,
    hostUid: null
  },
  error: null,
};

const brokerSlice = createSlice({
  name: 'broker',
  initialState,
  reducers: {
    setSelectedBroker: (state, action) => {
      state.selectedBroker = action.payload;
    },
    setSelectedBrokerSubItem: (state, action) => {
      state.selectedBrokerSubItem = action.payload;
    },
    openBrokerPropertyModal: (state, action) => {
      state.propertyModal = {
        isOpen: true,
        brokerName: action.payload.brokerName,
        hostUid: action.payload.hostUid
      };
    },
    closeBrokerPropertyModal: (state) => {
      state.propertyModal.isOpen = false;
    },
    resetBrokerState: (state) => {
      state.brokers = [];
      state.selectedBroker = null;
      state.selectedBrokerSubItem = null;
      state.detailedStatus = {};
      state.logsByBroker = {};
      state.dbLogsByDbName = {};
      state.viewingLogs = {};
      state.adminLogsByHost = {};
      state.cmsLogsByHost = {};
      state.brokerConfig = {};
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBrokerList.pending, (state, action) => {
        // Per-broker status calls inside this thunk mean a host with many
        // brokers can take a while — track the latest requestId so a slower
        // earlier fetch (e.g. a previous host's, still in flight when the
        // user switches focus again) can't resolve after this one and
        // clobber its fresher data.
        state.latestBrokerListRequestId = action.meta.requestId;
        if (!action.meta.arg?.isBackground) {
          state.loading = true;
        }
        state.error = null;
      })
      .addCase(fetchBrokerList.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.latestBrokerListRequestId) return;
        state.loading = false;
        const newBrokers = action.payload;
        if (JSON.stringify(state.brokers) !== JSON.stringify(newBrokers)) {
          state.brokers = newBrokers;
        }
        const exists = state.brokers.find(b => b.name === state.selectedBroker);
        if (!exists) state.selectedBroker = null;
      })
      .addCase(fetchBrokerList.rejected, (state, action) => {
        if (action.meta.requestId !== state.latestBrokerListRequestId) return;
        state.loading = false;
        state.error = action.payload;
        state.brokers = [];
      })
      .addCase(fetchDetailedBrokerStatus.pending, (state, action) => {
        const { brokerName } = action.meta.arg;
        if (!state.detailedStatus[brokerName]) {
          state.detailedStatus[brokerName] = { data: {}, loading: true, error: null };
        }
        state.detailedStatus[brokerName].loading = true;
        state.detailedStatus[brokerName].error = null;
      })
      .addCase(fetchDetailedBrokerStatus.fulfilled, (state, action) => {
        const { brokerName, data } = action.payload;
        state.detailedStatus[brokerName].loading = false;
        state.detailedStatus[brokerName].data = data;
      })
      .addCase(fetchDetailedBrokerStatus.rejected, (state, action) => {
        const { brokerName } = action.meta.arg;
        state.detailedStatus[brokerName].loading = false;
        state.detailedStatus[brokerName].error = action.payload;
      })
      .addCase(startBroker.pending, (state, action) => {
        state.actionLoading = true;
        state.lastActionTarget = action.meta.arg?.brokerName;
        state.lastActionType = 'start';
      })
      .addCase(startBroker.fulfilled, (state) => {
        state.actionLoading = false;
        state.lastActionTarget = null;
        state.lastActionType = null;
      })
      .addCase(startBroker.rejected, (state) => {
        state.actionLoading = false;
        state.lastActionTarget = null;
        state.lastActionType = null;
      })
      .addCase(stopBroker.pending, (state, action) => {
        state.actionLoading = true;
        state.lastActionTarget = action.meta.arg?.brokerName;
        state.lastActionType = 'stop';
      })
      .addCase(stopBroker.fulfilled, (state) => {
        state.actionLoading = false;
        state.lastActionTarget = null;
        state.lastActionType = null;
      })
      .addCase(stopBroker.rejected, (state) => {
        state.actionLoading = false;
        state.lastActionTarget = null;
        state.lastActionType = null;
      })
      .addCase(startAllBrokers.pending, (state) => {
        state.actionLoading = true;
        state.lastActionTarget = null;
        state.lastActionType = 'start-all';
      })
      .addCase(startAllBrokers.fulfilled, (state) => {
        state.actionLoading = false;
        state.lastActionTarget = null;
        state.lastActionType = null;
      })
      .addCase(startAllBrokers.rejected, (state) => {
        state.actionLoading = false;
        state.lastActionTarget = null;
        state.lastActionType = null;
      })
      .addCase(stopAllBrokers.pending, (state) => {
        state.actionLoading = true;
        state.lastActionTarget = null;
        state.lastActionType = 'stop-all';
      })
      .addCase(stopAllBrokers.fulfilled, (state) => {
        state.actionLoading = false;
        state.lastActionTarget = null;
        state.lastActionType = null;
      })
      .addCase(stopAllBrokers.rejected, (state) => {
        state.actionLoading = false;
        state.lastActionTarget = null;
        state.lastActionType = null;
      })
      .addCase(fetchBrokerLogs.pending, (state) => {
        state.logsLoadingCount += 1;
        state.logsLoading = true;
      })
      .addCase(fetchBrokerLogs.fulfilled, (state, action) => {
        state.logsLoadingCount = Math.max(0, state.logsLoadingCount - 1);
        state.logsLoading = state.logsLoadingCount > 0;
        state.logsByBroker[action.payload.brokerName] = action.payload.logs;
      })
      .addCase(fetchBrokerLogs.rejected, (state) => {
        state.logsLoadingCount = Math.max(0, state.logsLoadingCount - 1);
        state.logsLoading = state.logsLoadingCount > 0;
      })
      .addCase(fetchLogContent.pending, (state, action) => {
        const path = action.meta.arg.path;
        if (!state.viewingLogs[path]) state.viewingLogs[path] = {};
        state.viewingLogs[path].loading = true;
        state.viewingLogs[path].error = null;
      })
      .addCase(fetchLogContent.fulfilled, (state, action) => {
        const { path, data } = action.payload;
        state.viewingLogs[path].loading = false;
        state.viewingLogs[path].data = data;
      })
      .addCase(fetchLogContent.rejected, (state, action) => {
        const path = action.meta.arg.path;
        state.viewingLogs[path].loading = false;
        state.viewingLogs[path].error = action.payload;
      })
      .addCase(fetchAdminLogs.pending, (state) => {
        state.adminLogsLoading = true;
      })
      .addCase(fetchAdminLogs.fulfilled, (state, action) => {
        state.adminLogsLoading = false;
        state.adminLogsByHost[action.payload.hostUid] = action.payload.logs;
      })
      .addCase(fetchAdminLogs.rejected, (state) => {
        state.adminLogsLoading = false;
      })
      .addCase(fetchCMSLogs.pending, (state) => {
        state.cmsLogsLoading = true;
      })
      .addCase(fetchCMSLogs.fulfilled, (state, action) => {
        state.cmsLogsLoading = false;
        state.cmsLogsByHost[action.payload.hostUid] = action.payload.logs;
      })
      .addCase(fetchCMSLogs.rejected, (state) => {
        state.cmsLogsLoading = false;
      })
      .addCase(fetchDatabaseLogs.pending, (state) => {
        state.dbLogsLoading = true;
      })
      .addCase(fetchDatabaseLogs.fulfilled, (state, action) => {
        state.dbLogsLoading = false;
        state.dbLogsByDbName[action.payload.dbname] = action.payload.logs;
      })
      .addCase(fetchDatabaseLogs.rejected, (state) => {
        state.dbLogsLoading = false;
      })
      .addCase(fetchBrokerConfig.pending, (state, action) => {
        const { hostUid } = action.meta.arg;
        if (!state.brokerConfig[hostUid]) {
          state.brokerConfig[hostUid] = { data: {}, loading: true, error: null };
        } else {
          state.brokerConfig[hostUid].loading = true;
          state.brokerConfig[hostUid].error = null;
        }
      })
      .addCase(fetchBrokerConfig.fulfilled, (state, action) => {
        const { hostUid, data } = action.payload;
        state.brokerConfig[hostUid].loading = false;
        state.brokerConfig[hostUid].data = data;
      })
      .addCase(fetchBrokerConfig.rejected, (state, action) => {
        const { hostUid } = action.meta.arg;
        state.brokerConfig[hostUid].loading = false;
        state.brokerConfig[hostUid].error = action.payload;
      })
      // Cleanup on tab close to prevent memory leaks
      .addMatcher(
        (action) => action.type === 'layout/closeTab',
        (state, action) => {
          const tabId = action.payload;
          const statusMatch = tabId.match(/^broker_status:[^:]+:([^:]+)/);
          const logMatch = tabId.match(/^log:[^:]+:(.+)/);
          const allLogsMatch = tabId.match(/^all_logs:[^:]+:([^:]+)/);
          const allDbLogsMatch = tabId.match(/^all_db_logs:[^:]+:([^:]+)/);
          
          if (statusMatch) {
            delete state.detailedStatus[statusMatch[1]];
          } else if (logMatch) {
            delete state.viewingLogs[logMatch[1]];
          } else if (allLogsMatch) {
            const brokerName = allLogsMatch[1];
            const logs = state.logsByBroker[brokerName] || [];
            logs.forEach(log => {
              delete state.viewingLogs[log.path];
            });
          } else if (allDbLogsMatch) {
            const dbname = allDbLogsMatch[1];
            const logs = state.dbLogsByDbName[dbname] || [];
            logs.forEach(log => {
              delete state.viewingLogs[log.path];
            });
          }
        }
      )
      .addMatcher(
        (action) => action.type === 'layout/closeHostTabs',
        (state, action) => {
          const hostUid = action.payload;
          // Clean up logs and config for specifically closed host
          delete state.adminLogsByHost[hostUid];
          delete state.cmsLogsByHost[hostUid];
          delete state.brokerConfig[hostUid];
        }
      );
  },
});

export const { 
  setSelectedBroker, 
  setSelectedBrokerSubItem, 
  openBrokerPropertyModal, 
  closeBrokerPropertyModal,
  resetBrokerState 
} = brokerSlice.actions;

export default brokerSlice.reducer;
