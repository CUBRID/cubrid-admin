import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { databaseApi } from './databaseApi';
import { brokerApi } from '../broker/brokerApi';
import { buildDashboardLockRows } from './lockMappers';
import { createRateTracker } from '../broker/rateTracker';
import { dbKey as dashboardKey } from './dbKey';
import { computeStatdumpRates } from './statdumpRates';

// Module-level so the previous-sample baseline survives across polls.
const casRateTracker = createRateTracker();

export const fetchDatabaseVolumes = createAsyncThunk(
  'database/fetchDatabaseVolumes',
  async (arg, { rejectWithValue, getState }) => {
    const hostUid = typeof arg === 'string' ? arg : arg.hostUid;
    let activeDatabases = arg?.activeDatabases;
    
    if (!activeDatabases) {
      activeDatabases = getState().database.activeDatabasesByHost[hostUid];
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
      const responses = await Promise.all(allRequest).then(list => list.filter(res => res !== null));
      // Every database's request failed: report a failure rather than an
      // empty list, which would read as "no volumes".
      if (responses.length === 0) return rejectWithValue('Failed to fetch volume info');
      return responses;
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
      return { hostUid, dbname, data: response };
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
        hostUid,
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
      return { hostUid, dbname, locks: buildDashboardLockRows(response) };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch locks');
    }
  }
);

export const fetchDashboardPerformance = createAsyncThunk(
  'database/fetchDashboardPerformance',
  async ({ hostUid, dbname }, { rejectWithValue, getState }) => {
    try {
      const response = await databaseApi.getStatDump(hostUid, dbname);
      // statdump counters are cumulative; derive per-second rates against
      // this db's previous sample (kept on its dashboard entry).
      const prevSample = getState().databaseMonitoring?.dashboardData?.[dashboardKey(hostUid, dbname)]?.perfSample;
      const { sample, rates } = computeStatdumpRates(prevSample, response, Date.now());
      return { hostUid, dbname, performance: { ...response, calculatedRates: rates }, perfSample: sample };
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
        // apiClient already unwraps the server's { data, status, note }
        // envelope, so the CAS list sits directly on the resolved value
        // (same as fetchBrokerList's statusRes.asinfo).
        const asinfo = status?.asinfo;
        if (!asinfo) return;
        const brokerName = actualBrokerList[idx]?.name;
        asinfo.forEach(cas => {
          if (cas.as_dbname?.toLowerCase() === dbname.toLowerCase()) {
            // as_num_query is a per-AS lifetime total, not a rate — derive a
            // real per-second value from the delta between consecutive polls.
            const qps = casRateTracker(`${hostUid}:${brokerName}:${cas.as_id}:qps`, cas.as_num_query);
            brokersCAS.push({
              broker: brokerName,
              id: cas.as_id,
              pid: cas.as_pid,
              qps: qps === null ? null : qps.toFixed(1),
              lqs: cas.as_long_query,
              status: cas.as_status,
              lastConn: cas.as_lct,
              cpu: cas.as_cpu,
              psize: cas.as_psize,
              // Raw numeric fields for correct sort (CMS returns strings)
              _idNum: parseInt(cas.as_id, 10) || 0,
              _pidNum: parseInt(cas.as_pid, 10) || 0,
              _qpsNum: qps ?? 0,
              _lqsNum: parseFloat(cas.as_long_query) || 0,
            });
          }
        });
      });
      return { hostUid, dbname, brokersCAS };
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

    const [volR, lockR, , , spaceR] = settled;

    if (volR.status === 'rejected' && spaceR.status === 'rejected') {
      return rejectWithValue(volR.reason || `Failed to fetch dashboard data for ${dbname}`);
    }

    if (lockR.status === 'rejected') {
      console.warn(`[dashboard] lock fetch failed for ${dbname}:`, lockR.reason);
    }

    // Each sub-fetch's own fulfilled/rejected reducer has already merged its
    // rows and set its section status, so a failed part keeps its last rows.
    return { hostUid, dbname };
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
      const key = action.payload;
      if (key) delete state.dashboardError[key];
    }
  },
  extraReducers: (builder) => {
    const emptyDashboardEntry = () => ({
      volumes: [],
      spaceInfo: [],
      locks: [],
      performance: {},
      brokersCAS: [],
      volumeSummary: [],
    });

    // Per-section fetch status on the dashboard entry: unset until the first
    // fetch settles, then 'loaded' or 'error'. Lets a section tell "nothing
    // there" apart from "still loading" and "request failed".
    const setSectionStatus = (state, { hostUid, dbname }, field, status) => {
      const key = dashboardKey(hostUid, dbname);
      const existing = state.dashboardData[key] || emptyDashboardEntry();
      state.dashboardData[key] = { ...existing, [field]: status };
    };

    builder
      .addCase(fetchDatabaseVolumes.pending, (state) => {
        state.volumesLoading = true;
      })
      .addCase(fetchDatabaseVolumes.fulfilled, (state, action) => {
        state.volumesLoading = false;
        state.volumes = action.payload;
      })
      .addCase(fetchDatabaseVolumes.rejected, (state) => {
        state.volumesLoading = false;
      })
      .addCase(fetchDatabaseSpaceInfo.fulfilled, (state, action) => {
        const { hostUid, dbname, data } = action.payload;
        const key = dashboardKey(hostUid, dbname);
        state.spaceInfoLoading[key] = false;
        state.spaceInfo[key] = {
          volumes: data.spaceinfo || [],
          summary: data.dbinfo || [],
          files: data.fileinfo || [],
          pagesize: data.pagesize,
          logpagesize: data.logpagesize,
        };
        // Also merge into the per-DB dashboard cache — DBSpaceInfoSection's
        // own "became active" refresh dispatches this thunk, and the
        // dashboard reads from `dashboardData`, not `spaceInfo`.
        const existing = state.dashboardData[key] || emptyDashboardEntry();
        state.dashboardData[key] = {
          ...existing,
          spaceInfo: data.fileinfo || [],
          volumeSummary: data.dbinfo || [],
          spaceInfoStatus: 'loaded',
        };
      })
      .addCase(fetchDatabaseSpaceInfo.rejected, (state, action) => {
        setSectionStatus(state, action.meta.arg, 'spaceInfoStatus', 'error');
      })
      .addCase(fetchDashboardVolumes.fulfilled, (state, action) => {
        const { hostUid, dbname, volumes, pagesize, logpagesize } = action.payload;
        const key = dashboardKey(hostUid, dbname);
        const existing = state.dashboardData[key] || emptyDashboardEntry();
        state.dashboardData[key] = { ...existing, volumes, pagesize, logpagesize, volumesStatus: 'loaded' };
      })
      .addCase(fetchDashboardVolumes.rejected, (state, action) => {
        setSectionStatus(state, action.meta.arg, 'volumesStatus', 'error');
      })
      .addCase(fetchDashboardPerformance.fulfilled, (state, action) => {
        const { hostUid, dbname, performance, perfSample } = action.payload;
        const key = dashboardKey(hostUid, dbname);
        const existing = state.dashboardData[key] || emptyDashboardEntry();
        state.dashboardData[key] = { ...existing, performance, perfSample };
      })
      .addCase(fetchDashboardCAS.fulfilled, (state, action) => {
        const { hostUid, dbname, brokersCAS } = action.payload;
        const key = dashboardKey(hostUid, dbname);
        const existing = state.dashboardData[key] || emptyDashboardEntry();
        state.dashboardData[key] = { ...existing, brokersCAS, casStatus: 'loaded' };
      })
      .addCase(fetchDashboardCAS.rejected, (state, action) => {
        setSectionStatus(state, action.meta.arg, 'casStatus', 'error');
      })
      .addCase(fetchDashboardLocks.fulfilled, (state, action) => {
        const { hostUid, dbname, locks } = action.payload;
        const key = dashboardKey(hostUid, dbname);
        const existing = state.dashboardData[key] || emptyDashboardEntry();
        state.dashboardData[key] = { ...existing, locks, locksStatus: 'loaded' };
      })
      .addCase(fetchDashboardLocks.rejected, (state, action) => {
        setSectionStatus(state, action.meta.arg, 'locksStatus', 'error');
      })
      .addCase(fetchDashboardData.fulfilled, (state, action) => {
        const { hostUid, dbname } = action.payload;
        state.dashboardLoading[dashboardKey(hostUid, dbname)] = false;
      })
      // Cleanup on tab close to prevent memory leaks
      .addMatcher(
        (action) => action.type === 'layout/closeTab',
        (state, action) => {
          const tabId = action.payload;
          const match = tabId.match(/^(?:db|db_space|vol_category|vol_info|table_info|view_info):([^:]+):([^:]+)/);
          if (match) {
            const key = dashboardKey(match[1], match[2]);
            delete state.dashboardData[key];
            delete state.dashboardLoading[key];
            delete state.dashboardError[key];
            delete state.spaceInfo[key];
            delete state.spaceInfoLoading[key];
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
      )
      // Drop cached space/dashboard data once a database's dbmt login is
      // gone (explicit logout or forgetting its saved credentials) — it was
      // fetched under a login that no longer exists, so leaving it around
      // would show stale data as if it were still current.
      .addMatcher(
        (action) => action.type === 'database/logoutDatabase/fulfilled' || action.type === 'database/deleteDatabaseProfile/fulfilled',
        (state, action) => {
          const { hostUid, dbname } = action.meta.arg;
          const key = dashboardKey(hostUid, dbname);
          delete state.dashboardData[key];
          delete state.dashboardLoading[key];
          delete state.dashboardError[key];
          delete state.spaceInfo[key];
          delete state.spaceInfoLoading[key];
        }
      );
  }
});

export const { clearMonitoringError } = databaseMonitoringSlice.actions;
export default databaseMonitoringSlice.reducer;
