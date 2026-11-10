import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { brokerApi } from './brokerApi';
import { isAmbiguousFailure } from '../../api/isAmbiguousFailure';
import { createRateTracker } from './rateTracker';
import { brokerStateOf } from './brokerState';
import { fetchBrokerStatusMap } from './fetchBrokerStatusMap';
import apiClient from '../../api/apiClient';
import { createSharedReads } from '../../infrastructure/utils/singleFlight';
import { dbKey } from '../database/dbKey';
import { hostKey, deleteHostKeys } from '../host/hostKey';
import { isDbLoginGone, dbOfLoginGone } from '../database/dbLoginGone';
import { requestErrorText } from '../../infrastructure/errors/serverErrorText';

// Module-level so the previous-sample baseline survives across polls and
// across every host/broker tab, keyed by hostUid+brokerName below.
const brokerRateTracker = createRateTracker();

// The whole list read is shared, not just its requests: qps/tps are rates
// against the previous sample, so computing them twice for one sample would
// leave the second at zero.
const brokerListReads = createSharedReads();

// Do not share a read across login sessions.
const brokerListKey = (hostUid, skipStatusEnrichment) =>
  JSON.stringify([apiClient.defaults.headers.common.Authorization, hostUid, skipStatusEnrichment]);

// Resolves to { brokers, statusByName }: the list, and the bulk status
// (broker name -> getbrokerstatus entry) it was enriched with, empty when
// skipped.
const readBrokerList = async (hostUid, skipStatusEnrichment) => {
  const response = await brokerApi.getBrokerList(hostUid);
  const brokerList = response.result || (Array.isArray(response) ? response[0]?.broker : []);

  if (!brokerList) return { brokers: [], statusByName: new Map() };

  const formattedBrokers = brokerList.map(item => ({
    ...item,
    name: item.name,
    state: brokerStateOf(item),
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

  if (skipStatusEnrichment) return { brokers: formattedBrokers, statusByName: new Map() };

  // One bulk request for every broker's status. A broker missing from
  // the response (or a failed request) counts as a failed status fetch.
  const statusByName = await fetchBrokerStatusMap(hostUid, formattedBrokers.map((b) => b.name));
  const responses = formattedBrokers.map((b) => (
    statusByName.has(b.name)
      ? { b, statusRes: statusByName.get(b.name), success: true }
      : { b, success: false }
  ));

  // A broker whose status could not be read stays listed, without rates.
  const brokers = responses.map((r) => {
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
  return { brokers, statusByName };
};

/**
 * The broker list as the host dashboard's own fetchBrokerList reads it, for
 * another reader in the same refresh (the system status' TPS/QPS): it takes
 * the read already in flight instead of sending one more. Resolves to the
 * `{ result: [...] }` shape of the raw response; rejects like the read.
 */
export const readSharedBrokerList = async (hostUid) => {
  const result = await brokerListReads(brokerListKey(hostUid, false), () => readBrokerList(hostUid, false));
  if (!result.ok) throw result.error;
  return { result: result.value.brokers };
};

/**
 * Every broker's status from the same shared read, for the DB dashboard's
 * CAS table: its poll fires with the sidebar's broker poll, and sending its
 * own list and status requests sent each of them twice. Resolves to
 * `{ brokers, statusByName }`; rejects when the list cannot be read. `fresh`
 * (a user refresh) waits for a read sent after it was asked for.
 */
export const readSharedBrokerStatus = async (hostUid, { fresh = false } = {}) => {
  const result = await brokerListReads(brokerListKey(hostUid, false), () => readBrokerList(hostUid, false), { fresh });
  if (!result.ok) throw result.error;
  return result.value;
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
    // Only a background poll may take a read already in flight; anything
    // else was asked for by the user or follows an action.
    const result = await brokerListReads(
      brokerListKey(hostUid, skipStatusEnrichment),
      () => readBrokerList(hostUid, skipStatusEnrichment),
      { fresh: !arg?.isBackground }
    );
    if (!result.ok) {
      return rejectWithValue(requestErrorText(result.error), { seq: result.seq });
    }
    return fulfillWithValue(result.value.brokers, { seq: result.seq });
  }
);

export const fetchDetailedBrokerStatus = createAsyncThunk(
  'broker/fetchDetailedBrokerStatus',
  async ({ hostUid, brokerName }, { rejectWithValue }) => {
    try {
      const response = await brokerApi.getBrokerStatus(hostUid, brokerName);
      return { brokerName, data: response };
    } catch (err) {
      return rejectWithValue(requestErrorText(err));
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
      return rejectWithValue(requestErrorText(err));
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
      return rejectWithValue(requestErrorText(err));
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
      return rejectWithValue(requestErrorText(err));
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
      return rejectWithValue(requestErrorText(err));
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
      return rejectWithValue(requestErrorText(err));
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
      return rejectWithValue(requestErrorText(err));
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
      return rejectWithValue(requestErrorText(err));
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
      return rejectWithValue(requestErrorText(err));
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
      return rejectWithValue(requestErrorText(err));
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
      return rejectWithValue(requestErrorText(err));
    }
  }
);

// Reads are tracked per host from pending to settled, as { requestId:
// foreground }. Closing the host drops its entries, so a read started on the
// earlier connection (still in flight, or queued behind one) can neither
// write the evicted slots nor end the new connection's spinner when it
// settles. Returns whether the read still belongs to the host's connection.
const startRead = (state, hostUid, requestId, foreground) => {
  (state.pendingReadsByHost[hostUid] ??= {})[requestId] = foreground;
  if (foreground) state.loadingByHost[hostUid] = true;
};

const settleRead = (state, hostUid, requestId) => {
  const reads = state.pendingReadsByHost[hostUid];
  if (!reads || !(requestId in reads)) return false;
  const foreground = reads[requestId];
  delete reads[requestId];
  if (foreground) state.loadingByHost[hostUid] = Object.values(reads).some(Boolean);
  return true;
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
  // Keyed by hostKey(hostUid, name): two hosts can have a broker, and a log
  // file path, of the same name.
  detailedStatus: {}, // { [hostKey(hostUid, brokerName)]: { data: {}, loading: false, error: null } }
  logsByBroker: {}, // { [hostKey(hostUid, brokerName)]: [logs] }
  // Brokers being restarted, by hostKey(hostUid, brokerName): they show as ON
  // until the restart ends (brokerRestartState.js).
  restartingBrokers: {},
  viewingLogs: {}, // { [hostKey(hostUid, path)]: { data: {}, loading: false, error: null } }
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
  dbLogsByDb: {}, // { [dbKey(hostUid, dbname)]: [logs] } — two hosts can share a dbname
  dbLogsLoadingByDb: {}, // { [dbKey]: true } while that database's list is read
  dbLogsFailedByDb: {}, // { [dbKey]: true } when the last read failed; nothing retries it on its own
  brokerConfig: {}, // { hostUid: { data: {}, loading: false, error: null } }
  // { hostUid: { requestId: foreground } } — reads started on the host's current connection; see startRead.
  pendingReadsByHost: {},
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
    markBrokersRestarting: (state, action) => {
      const { hostUid, names, restarting } = action.payload;
      names.forEach((name) => {
        const key = hostKey(hostUid, name);
        if (restarting) state.restartingBrokers[key] = true;
        else delete state.restartingBrokers[key];
      });
    },
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
      state.restartingBrokers = {};
      state.dbLogsByDb = {};
      state.dbLogsLoadingByDb = {};
      state.dbLogsFailedByDb = {};
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
        startRead(state, hostUid, action.meta.requestId, !action.meta.arg?.isBackground);
        state.error = null;
      })
      .addCase(fetchBrokerList.fulfilled, (state, action) => {
        const hostUid = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg?.hostUid;
        const isBackground = !!action.meta.arg?.isBackground;
        if (!settleRead(state, hostUid, action.meta.requestId)) return; // host closed since
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
        if (!settleRead(state, hostUid, action.meta.requestId)) return; // host closed since
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
        const { hostUid, brokerName, isBackground } = action.meta.arg;
        const key = hostKey(hostUid, brokerName);
        if (!state.detailedStatus[key]) {
          state.detailedStatus[key] = { data: {}, loading: true, error: null };
          return;
        }
        // A background poll keeps what is shown, the data or the last error,
        // until it answers. Showing the loading view meanwhile made a stopped
        // broker's status flash between loading and error on every poll.
        if (isBackground) return;
        state.detailedStatus[key].loading = true;
        state.detailedStatus[key].error = null;
      })
      .addCase(fetchDetailedBrokerStatus.fulfilled, (state, action) => {
        const entry = state.detailedStatus[hostKey(action.meta.arg.hostUid, action.meta.arg.brokerName)];
        if (!entry) return; // tab or host closed since
        entry.loading = false;
        entry.error = null;
        entry.data = action.payload.data;
      })
      .addCase(fetchDetailedBrokerStatus.rejected, (state, action) => {
        const entry = state.detailedStatus[hostKey(action.meta.arg.hostUid, action.meta.arg.brokerName)];
        if (!entry) return;
        entry.loading = false;
        entry.error = action.payload;
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
        state.logsByBroker[hostKey(action.meta.arg.hostUid, action.meta.arg.brokerName)] = action.payload.logs;
      })
      .addCase(fetchBrokerLogs.rejected, (state) => {
        state.logsLoadingCount = Math.max(0, state.logsLoadingCount - 1);
        state.logsLoading = state.logsLoadingCount > 0;
      })
      .addCase(fetchLogContent.pending, (state, action) => {
        const key = hostKey(action.meta.arg.hostUid, action.meta.arg.path);
        if (!state.viewingLogs[key]) state.viewingLogs[key] = {};
        state.viewingLogs[key].loading = true;
        state.viewingLogs[key].error = null;
      })
      .addCase(fetchLogContent.fulfilled, (state, action) => {
        const entry = state.viewingLogs[hostKey(action.meta.arg.hostUid, action.meta.arg.path)];
        if (!entry) return; // tab or host closed since
        entry.loading = false;
        entry.data = action.payload.data;
      })
      .addCase(fetchLogContent.rejected, (state, action) => {
        const entry = state.viewingLogs[hostKey(action.meta.arg.hostUid, action.meta.arg.path)];
        if (!entry) return;
        entry.loading = false;
        entry.error = action.payload;
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
      .addCase(fetchDatabaseLogs.pending, (state, action) => {
        const key = dbKey(action.meta.arg.hostUid, action.meta.arg.dbname);
        state.dbLogsLoadingByDb[key] = true;
        delete state.dbLogsFailedByDb[key];
      })
      .addCase(fetchDatabaseLogs.fulfilled, (state, action) => {
        const key = dbKey(action.meta.arg.hostUid, action.meta.arg.dbname);
        delete state.dbLogsLoadingByDb[key];
        state.dbLogsByDb[key] = action.payload.logs;
      })
      .addCase(fetchDatabaseLogs.rejected, (state, action) => {
        const key = dbKey(action.meta.arg.hostUid, action.meta.arg.dbname);
        delete state.dbLogsLoadingByDb[key];
        state.dbLogsFailedByDb[key] = true;
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
          const statusMatch = tabId.match(/^broker_status:([^:]+):([^:]+)/);
          const logMatch = tabId.match(/^log:([^:]+):(.+)/);
          const allLogsMatch = tabId.match(/^all_logs:([^:]+):([^:]+)/);
          const allDbLogsMatch = tabId.match(/^all_db_logs:([^:]+):([^:]+)/);
          
          if (statusMatch) {
            delete state.detailedStatus[hostKey(statusMatch[1], statusMatch[2])];
          } else if (logMatch) {
            delete state.viewingLogs[hostKey(logMatch[1], logMatch[2])];
          } else if (allLogsMatch) {
            const hostUid = allLogsMatch[1];
            const logs = state.logsByBroker[hostKey(hostUid, allLogsMatch[2])] || [];
            logs.forEach(log => {
              delete state.viewingLogs[hostKey(hostUid, log.path)];
            });
          } else if (allDbLogsMatch) {
            const hostUid = allDbLogsMatch[1];
            const logs = state.dbLogsByDb[dbKey(hostUid, allDbLogsMatch[2])] || [];
            logs.forEach(log => {
              delete state.viewingLogs[hostKey(hostUid, log.path)];
            });
          }
        }
      )
      // A database's log list was read under its login; drop it with the login.
      .addMatcher(isDbLoginGone, (state, action) => {
        const { hostUid, dbname } = dbOfLoginGone(action);
        if (!hostUid || !dbname) return;
        const key = dbKey(hostUid, dbname);
        delete state.dbLogsByDb[key];
        delete state.dbLogsFailedByDb[key];
      })
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
          deleteHostKeys(state.detailedStatus, hostUid);
          deleteHostKeys(state.logsByBroker, hostUid);
          deleteHostKeys(state.restartingBrokers, hostUid);
          deleteHostKeys(state.viewingLogs, hostUid);
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
          delete state.pendingReadsByHost[hostUid];
          delete state.loadingByHost[hostUid];
          delete state.brokerListFailedByHost[hostUid];
        }
      );
  },
});

export const { 
  markBrokersRestarting,
  setSelectedBroker, 
  setSelectedBrokerSubItem, 
  openBrokerPropertyModal, 
  closeBrokerPropertyModal,
  resetBrokerState 
} = brokerSlice.actions;

export default brokerSlice.reducer;
