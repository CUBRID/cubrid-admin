import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { databaseApi } from './databaseApi';
import { brokerApi } from '../broker/brokerApi';
import { buildDashboardLockRows } from './lockMappers';

export const fetchDatabaseVolumes = createAsyncThunk(
  'database/fetchDatabaseVolumes',
  async (arg, { rejectWithValue, getState }) => {
    const hostUid = typeof arg === 'string' ? arg : arg.hostUid;
    let activeDatabases = arg?.activeDatabases;
    
    if (!activeDatabases) {
      activeDatabases = getState().database.activeDatabases;
    }

    if (!activeDatabases || activeDatabases.length === 0) return [];
    
    try {
      const allRequest = activeDatabases.map(async (dbname) => {
        try {
          const res = await databaseApi.getVolumeInfo(hostUid, dbname);
          return { ...res, dbname }; // Inject dbname for mapping
        } catch {
          return null;
        }
      });
      const responses = await Promise.all(allRequest);
      return responses.filter(res => res !== null);
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch volume info');
    }
  }
);

export const fetchDatabaseSpaceInfo = createAsyncThunk(
  'database/fetchDatabaseSpaceInfo',
  async ({ hostUid, dbname }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getVolumeInfo(hostUid, dbname);
      return { dbname, data: response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to fetch space info for ${dbname}`);
    }
  }
);

export const fetchDashboardVolumes = createAsyncThunk(
  'database/fetchDashboardVolumes',
  async ({ hostUid, dbname }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getVolumeInfo(hostUid, dbname);
      return { 
        dbname, 
        volumes: response.spaceinfo || [],
        pagesize: response.pagesize,
        logpagesize: response.logpagesize
      };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch volumes');
    }
  }
);

export const fetchDashboardLocks = createAsyncThunk(
  'database/fetchDashboardLocks',
  async ({ hostUid, dbname }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getLockInfo(hostUid, dbname);
      return { dbname, locks: buildDashboardLockRows(response) };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch locks');
    }
  }
);

export const fetchDashboardPerformance = createAsyncThunk(
  'database/fetchDashboardPerformance',
  async ({ hostUid, dbname }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getStatDump(hostUid, dbname);
      return { dbname, performance: response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch performance stats');
    }
  }
);

export const fetchDashboardCAS = createAsyncThunk(
  'database/fetchDashboardCAS',
  async ({ hostUid, dbname }, { rejectWithValue }) => {
    try {
      const brokerList = await brokerApi.getBrokerList(hostUid);
      const actualBrokerList = brokerList?.[0]?.broker || [];
      const brokersCAS = [];

      const brokerDetails = await Promise.all(
        actualBrokerList.map(b => {
          if (!b?.name) return Promise.resolve(null);
          return brokerApi.getBrokerStatus(hostUid, b.name).catch(() => null);
        })
      );

      brokerDetails.forEach((status, idx) => {
        if (!status || !status.asinfo) return;
        const brokerName = actualBrokerList[idx]?.name;
        status.asinfo.forEach(cas => {
          if (cas.as_dbname?.toLowerCase() === dbname.toLowerCase()) {
            brokersCAS.push({
              broker: brokerName,
              id: cas.as_id,
              pid: cas.as_pid,
              qps: cas.as_num_query,
              lqs: cas.as_long_query,
              status: cas.as_status,
              lastConn: cas.as_lct,
              cpu: cas.as_cpu,
              psize: cas.as_psize,
              // Raw numeric fields for correct sort (CMS returns strings)
              _idNum: parseInt(cas.as_id, 10) || 0,
              _pidNum: parseInt(cas.as_pid, 10) || 0,
              _qpsNum: parseFloat(cas.as_num_query) || 0,
              _lqsNum: parseFloat(cas.as_long_query) || 0,
            });
          }
        });
      });
      return { dbname, brokersCAS };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch CAS stats');
    }
  }
);

export const fetchDashboardData = createAsyncThunk(
  'database/fetchDashboardData',
  async ({ hostUid, dbname }, { rejectWithValue, dispatch }) => {
    if (!hostUid || !dbname) return rejectWithValue('Missing hostUid or dbname');

    const settled = await Promise.allSettled([
      dispatch(fetchDashboardVolumes({ hostUid, dbname })).unwrap(),
      dispatch(fetchDashboardLocks({ hostUid, dbname })).unwrap(),
      dispatch(fetchDashboardPerformance({ hostUid, dbname })).unwrap(),
      dispatch(fetchDashboardCAS({ hostUid, dbname })).unwrap(),
      dispatch(fetchDatabaseSpaceInfo({ hostUid, dbname })).unwrap(),
    ]);

    const [volR, lockR, perfR, casR, spaceR] = settled;

    if (volR.status === 'rejected' && spaceR.status === 'rejected') {
      return rejectWithValue(volR.reason || `Failed to fetch dashboard data for ${dbname}`);
    }

    if (lockR.status === 'rejected') {
      console.warn(`[dashboard] lock fetch failed for ${dbname}:`, lockR.reason);
    }

    const vol = volR.status === 'fulfilled' ? volR.value : { volumes: [], pagesize: undefined, logpagesize: undefined };
    const lock = lockR.status === 'fulfilled' ? lockR.value : { locks: [] };
    const perf = perfR.status === 'fulfilled' ? perfR.value : { performance: {} };
    const cas = casR.status === 'fulfilled' ? casR.value : { brokersCAS: [] };
    const space = spaceR.status === 'fulfilled' ? spaceR.value : { data: {} };

    return {
      dbname,
      volumes: vol.volumes,
      locks: lock.locks,
      performance: perf.performance,
      brokersCAS: cas.brokersCAS,
      spaceInfo: space.data?.fileinfo || [],
      volumeSummary: space.data?.dbinfo || [],
      pagesize: vol.pagesize,
      logpagesize: vol.logpagesize,
    };
  }
);

const initialState = {
  dashboardData: {},
  dashboardLoading: {},
  dashboardError: {},
  spaceInfo: {},
  spaceInfoLoading: {},
  volumes: [],
  volumesLoading: false,
};

const databaseMonitoringSlice = createSlice({
  name: 'databaseMonitoring',
  initialState,
  reducers: {
    clearMonitoringError: (state, action) => {
      const dbname = action.payload;
      if (dbname) delete state.dashboardError[dbname];
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDatabaseVolumes.pending, (state) => {
        state.volumesLoading = true;
      })
      .addCase(fetchDatabaseVolumes.fulfilled, (state, action) => {
        state.volumesLoading = false;
        state.volumes = action.payload;
      })
      .addCase(fetchDatabaseSpaceInfo.fulfilled, (state, action) => {
        const { dbname, data } = action.payload;
        state.spaceInfoLoading[dbname] = false;
        state.spaceInfo[dbname] = {
          volumes: data.spaceinfo || [],
          summary: data.dbinfo || [],
          files: data.fileinfo || []
        };
      })
      .addCase(fetchDashboardLocks.fulfilled, (state, action) => {
        const { dbname, locks } = action.payload;
        const existing = state.dashboardData[dbname] || {
          volumes: [],
          spaceInfo: [],
          locks: [],
          performance: {},
          brokersCAS: [],
          volumeSummary: [],
        };
        state.dashboardData[dbname] = { ...existing, locks };
      })
      .addCase(fetchDashboardData.fulfilled, (state, action) => {
        const { dbname, volumes, locks, performance, brokersCAS, spaceInfo, volumeSummary, pagesize, logpagesize } = action.payload;
        state.dashboardData[dbname] = { volumes, locks, performance, brokersCAS, spaceInfo, volumeSummary, pagesize, logpagesize };
        state.dashboardLoading[dbname] = false;
      })
      // Cleanup on tab close to prevent memory leaks
      .addMatcher(
        (action) => action.type === 'layout/closeTab',
        (state, action) => {
          const tabId = action.payload;
          const match = tabId.match(/^(?:db|db_space|vol_category|vol_info|table_info|view_info):[^:]+:([^:]+)/) || tabId.match(/^db:(.+)/);
          if (match) {
            const dbname = match[1];
            delete state.dashboardData[dbname];
            delete state.dashboardLoading[dbname];
            delete state.dashboardError[dbname];
            delete state.spaceInfo[dbname];
            delete state.spaceInfoLoading[dbname];
          }
        }
      )
      .addMatcher(
        (action) => action.type === 'layout/closeHostTabs',
        (state) => {
          // Reset all monitoring data when host is closed
          state.dashboardData = {};
          state.dashboardLoading = {};
          state.dashboardError = {};
          state.spaceInfo = {};
          state.spaceInfoLoading = {};
        }
      );
  }
});

export const { clearMonitoringError } = databaseMonitoringSlice.actions;
export default databaseMonitoringSlice.reducer;
