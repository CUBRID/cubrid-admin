import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { databaseApi } from './databaseApi';
import { readSharedBrokerStatus } from '../broker/brokerSlice';
import { createRateTracker } from '../broker/rateTracker';
import { dbKey as dashboardKey } from './dbKey';
import { isDbLoginGone, dbOfLoginGone } from './dbLoginGone';
import { computeStatdumpRates } from './statdumpRates';
import { requestErrorText } from '../../infrastructure/errors/serverErrorText';
import { getCM, getStoredLocale } from '../../constants/useCM';

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
      if (responses.length === 0) return rejectWithValue(getCM(getStoredLocale()).volumeInfoFetchFailedMsg);
      return responses;
    } catch (err) {
      return rejectWithValue(requestErrorText(err));
    }
  }
);

// One volume-info read feeds every view of a database's space: the volume
// tabs (spaceInfo) and the dashboard's volume and file-space sections.
export const fetchDatabaseSpaceInfo = createAsyncThunk(
  'database/fetchDatabaseSpaceInfo',
  async ({ hostUid, dbname }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getVolumeInfo(hostUid, dbname);
      return { hostUid, dbname, data: response };
    } catch (err) {
      return rejectWithValue(requestErrorText(err));
    }
  }
);

export const fetchDashboardLocks = createAsyncThunk(
  'database/fetchDashboardLocks',
  async ({ hostUid, dbname }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getLockInfo(hostUid, dbname, { summary: true });
      const summary = response?.summary ?? response?.data?.summary;
      return { hostUid, dbname, locks: summary?.rows ?? [] };
    } catch (err) {
      return rejectWithValue(requestErrorText(err));
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
      return rejectWithValue(requestErrorText(err));
    }
  }
);

export const fetchDashboardCAS = createAsyncThunk(
  'database/fetchDashboardCAS',
  async ({ hostUid, dbname, isBackground }, { rejectWithValue }) => {
    try {
      // The sidebar's broker poll reads the same list and status at the same
      // moment, so a poll joins that read; a user refresh reads anew.
      const { brokers: actualBrokerList, statusByName } = await readSharedBrokerStatus(hostUid, { fresh: !isBackground });
      const brokersCAS = [];

      // brokerDetails stays index-aligned with actualBrokerList (null = no
      // status for that broker).
      const brokerDetails = actualBrokerList.map(b => statusByName.get(b?.name) ?? null);

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
              qps,
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
      return rejectWithValue(requestErrorText(err));
    }
  }
);

export const fetchDashboardData = createAsyncThunk(
  'database/fetchDashboardData',
  // `collapsed`: the sections the user collapsed (useRefreshWhenShown); their
  // data is not read, and a section reads its own when expanded again.
  async ({ hostUid, dbname, isBackground, collapsed = {} }, { rejectWithValue, dispatch }) => {
    if (!hostUid || !dbname) return rejectWithValue('Missing hostUid or dbname');

    const skipped = Promise.resolve({ skipped: true });
    const settled = await Promise.allSettled([
      // The volume and file sections show the same read.
      collapsed.volumes && collapsed.files ? skipped : dispatch(fetchDatabaseSpaceInfo({ hostUid, dbname })).unwrap(),
      collapsed.locks ? skipped : dispatch(fetchDashboardLocks({ hostUid, dbname })).unwrap(),
      collapsed.performance ? skipped : dispatch(fetchDashboardPerformance({ hostUid, dbname })).unwrap(),
      collapsed.cas ? skipped : dispatch(fetchDashboardCAS({ hostUid, dbname, isBackground })).unwrap(),
    ]);

    const [spaceR, lockR] = settled;

    if (spaceR.status === 'rejected') {
      return rejectWithValue(spaceR.reason || getCM(getStoredLocale()).dashboardFetchFailedMsg(dbname));
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
  // Bumped per host when a database's volumes changed (a volume was added),
  // so the host dashboard's volume table re-reads (DatabaseVolumes).
  volumesChangedSeq: {},
  dashboardData: {},
  dashboardLoading: {},
  dashboardError: {},
  spaceInfo: {},
  spaceInfoLoading: {},
};

const databaseMonitoringSlice = createSlice({
  name: 'databaseMonitoring',
  initialState,
  reducers: {
    volumesChanged: (state, action) => {
      const hostUid = action.payload;
      state.volumesChangedSeq[hostUid] = (state.volumesChangedSeq[hostUid] || 0) + 1;
    },
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
        // Also merge into the per-DB dashboard cache: both of its volume
        // sections (DBVolumesSection, DBSpaceInfoSection) read from
        // `dashboardData`, not `spaceInfo`, and their own refreshes dispatch
        // this thunk.
        const existing = state.dashboardData[key] || emptyDashboardEntry();
        state.dashboardData[key] = {
          ...existing,
          volumes: data.spaceinfo || [],
          pagesize: data.pagesize,
          logpagesize: data.logpagesize,
          volumesStatus: 'loaded',
          spaceInfo: data.fileinfo || [],
          volumeSummary: data.dbinfo || [],
          spaceInfoStatus: 'loaded',
        };
      })
      .addCase(fetchDatabaseSpaceInfo.rejected, (state, action) => {
        setSectionStatus(state, action.meta.arg, 'volumesStatus', 'error');
        setSectionStatus(state, action.meta.arg, 'spaceInfoStatus', 'error');
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
      // gone (see dbLoginGone.js) — it was fetched under a login that no
      // longer exists, so leaving it around would show stale data as if it
      // were still current.
      .addMatcher(
        isDbLoginGone,
        (state, action) => {
          const { hostUid, dbname } = dbOfLoginGone(action);
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

export const { clearMonitoringError, volumesChanged } = databaseMonitoringSlice.actions;
export default databaseMonitoringSlice.reducer;
