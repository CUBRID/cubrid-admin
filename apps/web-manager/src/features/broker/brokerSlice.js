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
    // Callers that only need the plain list fields (pid/port/jq/auto/sqll/
    // long_tran_time/long_query_time — e.g. BrokerStatus.jsx's "Basic
    // Information" panel) can skip the per-broker getBrokerStatus enrichment
    // loop below, which issues one extra request per broker on this host
    // just to compute qps/tps. Those fields are all already present on
    // `formattedBrokers` before enrichment runs.
    const skipStatusEnrichment = typeof arg === 'object' && !!arg.skipStatusEnrichment;
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

      if (skipStatusEnrichment) return formattedBrokers;

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
  // Keyed by hostUid — a bare shared `brokers` array meant a slow, still
  // in-flight fetch for a host the user has since switched away from could
  // resolve after the switch and overwrite the array the UI is now using to
  // render a DIFFERENT, currently-selected host's broker tree. See the same
  // reasoning on `activeHostUid` below and in fetchBrokerList's reducers.
  brokersByHost: {}, // { hostUid: brokers[] }
  // Navigator-only mirror of brokersByHost — only updated by a
  // non-background fetchBrokerList (initial load, manual refresh, or an
  // operation's own refetch), never by MonitoringProvider's interval poll
  // (isBackground:true). BrokerTree.jsx reads this instead of
  // brokersByHost, so the sidebar tree doesn't move on every poll tick.
  navigatorBrokersByHost: {}, // { hostUid: brokers[] }
  // Mirrors state.host.selectedHostUid (via the addMatcher below) so a late
  // response for a host the user is no longer viewing can tell it isn't the
  // active one and skip touching the globally-shared selectedBroker.
  activeHostUid: null,
  selectedBroker: null,
  selectedBrokerSubItem: null,
  detailedStatus: {}, // { brokerName: { data: {}, loading: false, error: null } }
  logsByBroker: {}, // { brokerName: [logs] }
  viewingLogs: {}, // { path: { data: {}, loading: false, error: null } }
  adminLogsByHost: {}, // { hostUid: [logs] }
  loadingByHost: {}, // { hostUid: boolean } — fetchBrokerList's own loading, kept
  // per host like brokersByHost itself: a single shared flag meant closing
  // one host's tabs while fetchBrokerList was still in flight for it could
  // only clear loading by zeroing it globally, which also hid a DIFFERENT,
  // still-legitimately-loading host's own spinner.
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
  latestBrokerListRequestIdByHost: {}, // { hostUid: requestId }
  // Tracks only the latest NON-background fetchBrokerList request per host
  // — separate from latestBrokerListRequestIdByHost above, so a background
  // poll starting while this one is still in flight can't make this one
  // look stale for the navigator mirror once it resolves. See
  // fetchBrokerList.fulfilled's own comment.
  latestNavigatorBrokerListRequestIdByHost: {}, // { hostUid: requestId }
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
    // Dispatched whenever focus leaves a host (plain focus switch, delete,
    // disconnect/revoke) — hostUid is the host being LEFT, if known. Only
    // that host's cached broker list is evicted; other hosts' cached data
    // (and their own in-flight fetches) are untouched. selectedBroker and
    // friends are always cleared since they always belonged to whichever
    // host this reducer is firing for.
    resetBrokerState: (state, action) => {
      const hostUid = action.payload;
      if (hostUid) {
        delete state.brokersByHost[hostUid];
        delete state.navigatorBrokersByHost[hostUid];
      } else {
        state.brokersByHost = {};
        state.navigatorBrokersByHost = {};
      }
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
        // brokers can take a while — track the latest requestId PER HOST so
        // a slower earlier fetch for that same host (e.g. still in flight
        // when the user switches focus away and back) can't resolve after a
        // newer one and clobber its fresher data.
        //
        // Scoped by hostUid, not a single shared id: a bare shared id meant
        // any fetch for ANY host — e.g. a different, still-mounted tab's
        // poll for a completely unrelated host — would mark this host's own
        // in-flight fetch as "stale" the moment it fired, discarding this
        // host's response when it later resolved. Under sustained polling
        // from multiple hosts/tabs, that could discard every response for a
        // given host indefinitely, not just an actually-superseded one.
        const hostUid = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg?.hostUid;
        const isBackground = !!action.meta.arg?.isBackground;
        state.latestBrokerListRequestIdByHost[hostUid] = action.meta.requestId;
        if (!isBackground) {
          state.loadingByHost[hostUid] = true;
          state.latestNavigatorBrokerListRequestIdByHost[hostUid] = action.meta.requestId;
        }
        state.error = null;
      })
      .addCase(fetchBrokerList.fulfilled, (state, action) => {
        const hostUid = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg?.hostUid;
        const isBackground = typeof action.meta.arg === 'object' && !!action.meta.arg?.isBackground;
        const requestId = action.meta.requestId;
        // Two INDEPENDENT staleness checks, not one gating the other — a
        // background poll starting while a foreground (navigator-relevant)
        // request is still in flight must not make that foreground
        // response's eventual navigator update look stale just because the
        // background one now owns the general per-host staleness slot. See
        // databaseCoreSlice.js's identical fix for the full reasoning.
        const isLatestLive = requestId === state.latestBrokerListRequestIdByHost[hostUid];
        const isLatestNavigator = !isBackground && requestId === state.latestNavigatorBrokerListRequestIdByHost[hostUid];
        if (!isLatestLive && !isLatestNavigator) return;
        const newBrokers = action.payload;
        if (isLatestNavigator) state.loadingByHost[hostUid] = false;
        if (isLatestLive && JSON.stringify(state.brokersByHost[hostUid]) !== JSON.stringify(newBrokers)) {
          state.brokersByHost[hostUid] = newBrokers;
        }
        // Navigator mirror — skipped for a background (interval) poll, so
        // the sidebar broker tree only moves on an explicit user action.
        if (isLatestNavigator && JSON.stringify(state.navigatorBrokersByHost[hostUid]) !== JSON.stringify(newBrokers)) {
          state.navigatorBrokersByHost[hostUid] = newBrokers;
        }
        // Only let the CURRENTLY ACTIVE host's own response affect the
        // shared selectedBroker. Without this, a response for a host the
        // user has since switched away from (still "latest for that host" —
        // nothing else for it superseded this request) could find its own
        // list doesn't contain whatever broker is selected in the NEW host
        // and wrongly null out that unrelated, still-valid selection.
        if (isLatestLive && hostUid === state.activeHostUid) {
          const exists = (state.brokersByHost[hostUid] || []).find(b => b.name === state.selectedBroker);
          if (!exists) state.selectedBroker = null;
        }
      })
      .addCase(fetchBrokerList.rejected, (state, action) => {
        const hostUid = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg?.hostUid;
        const isBackground = typeof action.meta.arg === 'object' && !!action.meta.arg?.isBackground;
        const requestId = action.meta.requestId;
        const isLatestLive = requestId === state.latestBrokerListRequestIdByHost[hostUid];
        const isLatestNavigator = !isBackground && requestId === state.latestNavigatorBrokerListRequestIdByHost[hostUid];
        if (!isLatestLive && !isLatestNavigator) return;
        // Same reasoning as the fulfilled case: a background poll failure
        // is transient and shouldn't blank the navigator's tree.
        if (isLatestNavigator) {
          state.loadingByHost[hostUid] = false;
          state.error = action.payload;
          state.navigatorBrokersByHost[hostUid] = [];
        }
        if (isLatestLive) {
          state.brokersByHost[hostUid] = [];
        }
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
      // Mirrors hostSlice's selectedHostUid so fetchBrokerList's fulfilled
      // handler can tell whether a given response belongs to the host the
      // user is currently viewing (see the comment there).
      .addMatcher(
        (action) => action.type === 'host/setSelectedHost',
        (state, action) => {
          state.activeHostUid = action.payload;
        }
      )
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
          // Clean up logs and config for specifically closed host. Dispatched
          // unconditionally on delete/disconnect, regardless of whether this
          // host was the currently selected one — unlike resetBrokerState,
          // which only fires for the currently-selected host — so this is
          // also where a NON-selected host's cached broker list must be
          // evicted, or it would sit in brokersByHost forever.
          delete state.adminLogsByHost[hostUid];
          delete state.cmsLogsByHost[hostUid];
          delete state.brokerConfig[hostUid];
          delete state.brokersByHost[hostUid];
          delete state.navigatorBrokersByHost[hostUid];
          // A fetchBrokerList already in flight for this host when it was
          // deleted/disconnected is still "the latest for its own host" per
          // the per-host dedup above — nothing else for this host will ever
          // supersede it now that the host is gone — so it would pass that
          // check and resurrect this host's just-evicted slot once it
          // resolves, with nothing left to ever clean it up again. Clearing
          // the id here makes that stale response get dropped like any
          // other no-longer-latest one.
          //
          // That discard path returns before reaching the loadingByHost
          // write, so if this host's now-orphaned request was the one that
          // set it, nothing else would ever clear it — every other fetch is
          // for a DIFFERENT host and only ever touches its own slot. Clear
          // this host's own loading slot directly instead of leaving a
          // stuck spinner with no fetch left that could ever turn it off —
          // and ONLY this host's slot, not a single shared flag, or closing
          // host A here would also hide host B's own, still-legitimate
          // in-flight loading indicator.
          delete state.latestBrokerListRequestIdByHost[hostUid];
          delete state.latestNavigatorBrokerListRequestIdByHost[hostUid];
          delete state.loadingByHost[hostUid];
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
