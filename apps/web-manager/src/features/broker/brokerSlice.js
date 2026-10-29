import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { brokerApi } from './brokerApi';
import { isAmbiguousFailure } from '../../api/isAmbiguousFailure';
import { createRateTracker } from './rateTracker';
import { fetchBrokerStatusMap } from './fetchBrokerStatusMap';
import apiClient from '../../api/apiClient';
import { createSharedReads } from '../../infrastructure/utils/singleFlight';

// Module-level so the previous-sample baseline survives across polls and
// across every host/broker tab, keyed by hostUid+brokerName below.
const brokerRateTracker = createRateTracker();

// The whole list read is shared, not just its requests: qps/tps are rates
// against the previous sample, so computing them twice for one sample would
// leave the second at zero.
const brokerListReads = createSharedReads();

const readBrokerList = async (hostUid, skipStatusEnrichment) => {
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

  // One bulk request for every broker's status. A broker missing from
  // the response (or a failed request) counts as a failed status fetch.
  const statusByName = await fetchBrokerStatusMap(hostUid, formattedBrokers.map((b) => b.name));
  const responses = formattedBrokers.map((b) => (
    statusByName.has(b.name)
      ? { b, statusRes: statusByName.get(b.name), success: true }
      : { b, success: false }
  ));

  // A broker whose status could not be read stays listed, without rates.
  return responses.map((r) => {
    if (!r.success) return r.b;
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
  });
};

export const fetchBrokerList = createAsyncThunk(
  'broker/fetchBrokerList',
  async (arg, { rejectWithValue, fulfillWithValue }) => {
    const hostUid = typeof arg === 'string' ? arg : arg.hostUid;
    // Callers that only need the plain list fields (pid/port/jq/auto/sqll/
    // long_tran_time/long_query_time — e.g. BrokerStatus.jsx's "Basic
    // Information" panel) can skip the bulk broker status request, which is
    // only needed to compute qps/tps.
    const skipStatusEnrichment = typeof arg === 'object' && !!arg.skipStatusEnrichment;
    // Do not share a read across login sessions.
    const key = JSON.stringify([apiClient.defaults.headers.common.Authorization, hostUid, skipStatusEnrichment]);
    // Only a background poll may take a read already in flight; anything
    // else was asked for by the user or follows an action.
    const result = await brokerListReads(key, () => readBrokerList(hostUid, skipStatusEnrichment), { fresh: !arg?.isBackground });
    if (!result.ok) {
      return rejectWithValue(result.error.response?.data?.message || 'Failed to fetch broker list', { seq: result.seq });
    }
    return fulfillWithValue(result.value, { seq: result.seq });
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

// On success these don't refetch the broker list themselves: the sidebar
// wrappers in brokerSidebarActions.js do it once per action (see there).
export const startBroker = createAsyncThunk(
  'broker/startBroker',
  async ({ hostUid, brokerName }, { dispatch, rejectWithValue }) => {
    try {
      await brokerApi.startBroker(hostUid, brokerName);
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

// One foreground list read for the host settled. The spinner stays while
// another one is still pending.
const endForegroundRead = (state, hostUid) => {
  if (!(hostUid in state.foregroundReadsByHost)) return; // host closed meanwhile
  const left = state.foregroundReadsByHost[hostUid] - 1;
  state.foregroundReadsByHost[hostUid] = left;
  state.loadingByHost[hostUid] = left > 0;
};

// Which views a list read (or its failure) may update: only those that have
// not applied anything newer. A background poll never moves the navigator.
const claimSeq = (state, hostUid, seq, isBackground) => {
  if (seq === undefined) return { updateLive: false, updateNavigator: false };
  const updateLive = seq > (state.appliedLiveSeqByHost[hostUid] ?? 0);
  const updateNavigator = !isBackground && seq > (state.appliedNavigatorSeqByHost[hostUid] ?? 0);
  if (updateLive) state.appliedLiveSeqByHost[hostUid] = seq;
  if (updateNavigator) state.appliedNavigatorSeqByHost[hostUid] = seq;
  return { updateLive, updateNavigator };
};

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
  brokerListFailedByHost: {}, // { hostUid: boolean } — the newest applied fetchBrokerList failed
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
  // { hostUid: number } — foreground list reads still pending, behind loadingByHost.
  foregroundReadsByHost: {},
  // { hostUid: seq } — the newest list each view applied. A read is stamped
  // when sent, so a slow one can never overwrite a newer one; a background
  // poll never moves the navigator.
  appliedLiveSeqByHost: {},
  appliedNavigatorSeqByHost: {},
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
        const hostUid = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg?.hostUid;
        if (!action.meta.arg?.isBackground) {
          state.foregroundReadsByHost[hostUid] = (state.foregroundReadsByHost[hostUid] ?? 0) + 1;
          state.loadingByHost[hostUid] = true;
        }
        state.error = null;
      })
      .addCase(fetchBrokerList.fulfilled, (state, action) => {
        const hostUid = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg?.hostUid;
        const isBackground = !!action.meta.arg?.isBackground;
        if (!isBackground) endForegroundRead(state, hostUid);
        const { updateLive, updateNavigator } = claimSeq(state, hostUid, action.meta.seq, isBackground);
        const newBrokers = action.payload;
        if (updateLive) {
          state.brokerListFailedByHost[hostUid] = false;
          if (JSON.stringify(state.brokersByHost[hostUid]) !== JSON.stringify(newBrokers)) {
            state.brokersByHost[hostUid] = newBrokers;
          }
        }
        if (updateNavigator && JSON.stringify(state.navigatorBrokersByHost[hostUid]) !== JSON.stringify(newBrokers)) {
          state.navigatorBrokersByHost[hostUid] = newBrokers;
        }
        // Only the active host's own list may clear the shared selection; a
        // late list for another host doesn't contain what is selected here.
        if (updateLive && hostUid === state.activeHostUid) {
          const exists = (state.brokersByHost[hostUid] || []).find(b => b.name === state.selectedBroker);
          if (!exists) state.selectedBroker = null;
        }
      })
      .addCase(fetchBrokerList.rejected, (state, action) => {
        const hostUid = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg?.hostUid;
        const isBackground = !!action.meta.arg?.isBackground;
        if (!isBackground) endForegroundRead(state, hostUid);
        // A background poll failure leaves the navigator's tree alone; only
        // an explicit fetch failure empties it. brokerListFailedByHost lets
        // the host dashboard (Brokers.jsx) tell a failure from an empty list.
        const { updateLive, updateNavigator } = claimSeq(state, hostUid, action.meta.seq, isBackground);
        if (updateLive) {
          state.brokerListFailedByHost[hostUid] = true;
          state.brokersByHost[hostUid] = [];
        }
        if (updateNavigator) {
          state.error = action.payload;
          state.navigatorBrokersByHost[hostUid] = [];
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
      .addCase(fetchCMSLogs.rejected, (state, action) => {
        state.cmsLogsLoading = false;
        // null = fetch failed with nothing cached (undefined = not fetched
        // yet); a failed refresh keeps the last logs.
        if (state.cmsLogsByHost[action.meta.arg] === undefined) state.cmsLogsByHost[action.meta.arg] = null;
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
          // A list read still in flight for this host was sent before it
          // closed (closeHostTabs carries the seq it closed at), so it can
          // never repopulate the slots just evicted. Its spinner goes too.
          if (action.meta?.seq !== undefined) {
            state.appliedLiveSeqByHost[hostUid] = action.meta.seq;
            state.appliedNavigatorSeqByHost[hostUid] = action.meta.seq;
          } else {
            delete state.appliedLiveSeqByHost[hostUid];
            delete state.appliedNavigatorSeqByHost[hostUid];
          }
          delete state.foregroundReadsByHost[hostUid];
          delete state.loadingByHost[hostUid];
          delete state.brokerListFailedByHost[hostUid];
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
