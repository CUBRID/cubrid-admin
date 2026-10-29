import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { databaseApi } from './databaseApi';
import { isAmbiguousFailure } from '../../api/isAmbiguousFailure';
import { dbKey } from './dbKey';
import { nextSeq } from '../../infrastructure/utils/singleFlight';

export const fetchDatabaseStartInfo = createAsyncThunk(
  'database/fetchDatabaseStartInfo',
  async (arg, { rejectWithValue, fulfillWithValue }) => {
    const hostUid = typeof arg === 'string' ? arg : arg.hostUid;
    // Only a background poll may take a request already in flight; anything
    // else was asked for by the user or follows an action.
    const result = await databaseApi.readStartInfo(hostUid, { fresh: !arg?.isBackground });
    if (!result.ok) {
      const err = result.error;
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || 'Failed to fetch database information', { seq: result.seq });
    }
    return fulfillWithValue(result.value, { seq: result.seq });
  }
);

export const startDatabase = createAsyncThunk(
  'database/startDatabase',
  async ({ hostUid, dbname }, { rejectWithValue, dispatch, fulfillWithValue }) => {
    try {
      const response = await databaseApi.startDatabase(hostUid, dbname);
      return fulfillWithValue(response, { seq: nextSeq() });
    } catch (err) {
      if (isAmbiguousFailure(err)) {
        dispatch(fetchDatabaseStartInfo(hostUid));
      }
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || `Failed to start database ${dbname}`);
    }
  }
);

export const stopDatabase = createAsyncThunk(
  'database/stopDatabase',
  async ({ hostUid, dbname }, { rejectWithValue, dispatch, fulfillWithValue }) => {
    try {
      const response = await databaseApi.stopDatabase(hostUid, dbname);
      return fulfillWithValue(response, { seq: nextSeq() });
    } catch (err) {
      // CMS stopdb can time out (30s) even when the DB has actually stopped.
      // Do a single immediate start-info check; if the DB is gone, treat stop as success.
      try {
        const info = await databaseApi.getStartInfo(hostUid);
        const active = info?.activelist?.active;
        const valid = Array.isArray(active) && active.every((a) =>
          typeof a === 'string' ? a.length > 0 : typeof a?.dbname === 'string' && a.dbname.length > 0
        );
        if (valid && !active.some((a) => (typeof a === 'string' ? a : a.dbname) === dbname)) {
          return fulfillWithValue(info, { seq: nextSeq() });
        }
      } catch (_) {
        // ignore start-info failure, fall through to rejectWithValue
      }
      if (isAmbiguousFailure(err)) {
        dispatch(fetchDatabaseStartInfo(hostUid));
      }
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || `Failed to stop database ${dbname}`);
    }
  }
);

// Bulk start/stop for the "Start/Stop/Restart All Databases" tree actions.
// Goes through the dedicated start-all/stop-all endpoints instead of looping
// individual startDatabase/stopDatabase calls client-side: the backend
// already isolates per-database failures there (a database with no stored
// login profile is reported in `failed` instead of aborting every other
// database in the batch), which a client-side loop awaiting each call in
// turn cannot do once any one of them throws.
export const startAllDatabases = createAsyncThunk(
  'database/startAllDatabases',
  async ({ hostUid, dbnames }, { rejectWithValue, fulfillWithValue }) => {
    try {
      const response = await databaseApi.startAllDatabases(hostUid, dbnames);
      return fulfillWithValue(response, { seq: nextSeq() });
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || 'Failed to start databases');
    }
  }
);

export const stopAllDatabases = createAsyncThunk(
  'database/stopAllDatabases',
  async ({ hostUid, dbnames }, { rejectWithValue, fulfillWithValue }) => {
    try {
      const response = await databaseApi.stopAllDatabases(hostUid, dbnames);
      return fulfillWithValue(response, { seq: nextSeq() });
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || 'Failed to stop databases');
    }
  }
);

export const loginDatabase = createAsyncThunk(
  'database/loginDatabase',
  async ({ hostUid, dbname, payload }, { rejectWithValue, fulfillWithValue }) => {
    try {
      const response = payload 
        ? await databaseApi.loginDatabase(hostUid, dbname, payload)
        : await databaseApi.loginDatabaseWithProfile(hostUid, dbname);
      return fulfillWithValue({ dbname, ...response }, { seq: nextSeq() });
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || `Failed to login to database ${dbname}`);
    }
  }
);

export const logoutDatabase = createAsyncThunk(
  'database/logoutDatabase',
  async ({ hostUid, dbname }, { rejectWithValue, fulfillWithValue }) => {
    try {
      await databaseApi.logoutDatabase(hostUid, dbname);
      return fulfillWithValue({ dbname }, { seq: nextSeq() });
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || `Failed to log out of database ${dbname}`);
    }
  }
);

export const registerDatabase = createAsyncThunk(
  'database/registerDatabase',
  async ({ hostUid, dbname, payload }, { rejectWithValue, fulfillWithValue }) => {
    try {
      const response = await databaseApi.registerDatabase(hostUid, dbname, payload);
      return fulfillWithValue({ dbname, response }, { seq: nextSeq() });
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || `Failed to register database ${dbname}`);
    }
  }
);

export const deleteDatabaseProfile = createAsyncThunk(
  'database/deleteDatabaseProfile',
  async ({ hostUid, dbname }, { rejectWithValue, fulfillWithValue }) => {
    try {
      const response = await databaseApi.deleteDatabaseProfile(hostUid, dbname);
      return fulfillWithValue({ dbname, response }, { seq: nextSeq() });
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || `Failed to delete saved credentials for ${dbname}`);
    }
  }
);

// The client just changed its own belief about this db's login (login,
// logout, a gated start/stop, ...). Remember when (`seq`, taken as the
// change happened): a start-info read sent before that carries an older
// isLoggedIn and must not overwrite this db (see syncLoggedInFromStartInfo).
const noteLoginChange = (state, hostUid, dbname, seq) => {
  if (!hostUid || !dbname || seq === undefined) return;
  state.loginChangedSeq[dbKey(hostUid, dbname)] = seq;
};

// A non-HA database in a start-all/stop-all `succeeded` list went through
// the backend's ensureDbLogin gate, so it is logged in now. An HA one did
// not — the host-wide ha_start/ha_stop runs without a per-database login —
// so it is left as it was.
const markBulkSucceededLoggedIn = (state, hostUid, succeeded, seq) => {
  if (!hostUid) return;
  const haDbNames = state.haDbNamesByHost[hostUid] || [];
  (succeeded || []).forEach((dbname) => {
    if (haDbNames.includes(dbname)) return;
    const key = dbKey(hostUid, dbname);
    if (!state.loggedInDatabases.includes(key)) state.loggedInDatabases.push(key);
    noteLoginChange(state, hostUid, dbname, seq);
  });
};

// Start-info's per-entry `isLoggedIn` is the server's real DB-login state
// (same test as its ensureDbLogin cache hit — invalidated by a rotated CMS
// token or a server restart), so this host's padlocks are set to exactly
// that, even from a background poll. Other hosts are left untouched; so is
// everything when the field is absent (older server) or there are no
// entries to read it from, and so is any db with a login in flight or whose
// login state the client changed after this start-info was read (`seq`).
const syncLoggedInFromStartInfo = (state, payload, hostUid, seq) => {
  if (!hostUid) return;
  const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const entries = [...toArray(payload.dblist?.dbs), ...toArray(payload.activelist?.active)]
    .filter((e) => e && typeof e === 'object' && typeof e.dbname === 'string' && 'isLoggedIn' in e);
  if (entries.length === 0) return;

  const loggedIn = new Set(entries.filter((e) => e.isLoggedIn === true).map((e) => e.dbname));
  const prefix = dbKey(hostUid, '');
  const inFlight = (key) => state.loggingInDatabases[key] === true;
  const changedSinceRequest = (key) => seq !== undefined && (state.loginChangedSeq[key] ?? 0) > seq;
  const next = state.loggedInDatabases.filter(
    (key) => !key.startsWith(prefix) || inFlight(key) || changedSinceRequest(key)
  );
  loggedIn.forEach((dbname) => {
    const key = dbKey(hostUid, dbname);
    if (!next.includes(key) && !changedSinceRequest(key)) next.push(key);
  });
  if (JSON.stringify(next) !== JSON.stringify(state.loggedInDatabases)) {
    state.loggedInDatabases = next;
  }
};

// Helper to parse the shared response format into this host's per-host
// slots, so a response for a host the user has since switched away from can
// never overwrite another host's lists.
//
// Two views are written: the live lists every dashboard reads, and the
// navigator* mirror DatabaseTree.jsx reads. The tree only moves on an
// explicit user action or an operation's own refetch, never on a background
// poll. Which views a response may update is decided by applyStartInfo.
// Keeps an already-empty list as it is: every failed poll of an unreachable
// host would otherwise hand subscribers a new empty array and re-render them.
const clearList = (byHost, hostUid) => {
  if (byHost[hostUid]?.length !== 0) byHost[hostUid] = [];
};

const parseDbResponse = (state, payload, hostUid, { updateLive, updateNavigator, seq }) => {
  if (!payload) return;
  const dbsFound = payload.dblist?.dbs;
  const activeFound = payload.activelist?.active;

  const prevActive = state.activeDatabasesByHost[hostUid];
  let newActive;
  if (payload.activelist !== undefined) {
    const rawActive = Array.isArray(activeFound) ? activeFound : activeFound ? [activeFound] : [];
    newActive = rawActive.map(d => (typeof d === 'string' ? d : d?.dbname)).filter(Boolean);
    if (updateLive && JSON.stringify(prevActive) !== JSON.stringify(newActive)) {
      state.activeDatabasesByHost[hostUid] = newActive;
    }
    if (updateNavigator && JSON.stringify(state.navigatorActiveDatabasesByHost[hostUid]) !== JSON.stringify(newActive)) {
      state.navigatorActiveDatabasesByHost[hostUid] = newActive;
    }
  }

  if (dbsFound !== undefined) {
    const rawList = Array.isArray(dbsFound) ? dbsFound : dbsFound ? [dbsFound] : [];
    // CMS's dblist can omit a database that startinfo's own activelist still
    // reports as active — seen consistently on HA replica nodes, where the
    // database is genuinely running/replicating there but was never locally
    // "registered" the way dblist expects. Without this, such a database is
    // simply missing from the tree entirely instead of just showing as on.
    const knownNames = new Set(rawList.map((db) => db.dbname));
    const activeNames = newActive ?? state.activeDatabasesByHost[hostUid] ?? [];
    const missingActiveNames = activeNames.filter((name) => !knownNames.has(name));
    const mergedList = missingActiveNames.length > 0
      ? [...rawList, ...missingActiveNames.map((dbname) => {
        const activeEntry = (Array.isArray(activeFound) ? activeFound : [activeFound])
          .find((a) => a && typeof a === 'object' && a.dbname === dbname);
        return activeEntry && 'isLoggedIn' in activeEntry
          ? { dbname, isProfileExists: false, isLoggedIn: activeEntry.isLoggedIn }
          : { dbname, isProfileExists: false };
      })]
      : rawList;
    if (updateLive && JSON.stringify(state.databasesByHost[hostUid]) !== JSON.stringify(mergedList)) {
      state.databasesByHost[hostUid] = mergedList;
    }
    if (updateNavigator && JSON.stringify(state.navigatorDatabasesByHost[hostUid]) !== JSON.stringify(mergedList)) {
      state.navigatorDatabasesByHost[hostUid] = mergedList;
    }
  }

  // Only the currently active host's own response may affect the globally
  // shared selectedDatabase. Without this gate, a response for a host the
  // user has since switched away from (still "latest for that host" —
  // nothing else for it superseded this request) could find its own list
  // doesn't contain whatever database is selected in the NEW host and
  // wrongly null out that unrelated, still-valid selection.
  if (dbsFound && hostUid === state.activeHostUid) {
    const exists = (state.databasesByHost[hostUid] || []).find(db => db.dbname === state.selectedDatabase);
    if (!exists) {
      state.selectedDatabase = null;
      state.selectedDatabaseSubItem = null;
    }
  }

  // The padlock follows the server's truth, so background polls count too —
  // but only a response that is still the latest for this host's live view
  // (updateLive); one superseded by a newer request would overwrite the
  // fresher login state that newer response carries.
  if (updateLive) syncLoggedInFromStartInfo(state, payload, hostUid, seq);

  // Static ha_db_list membership from cubrid_ha.conf — deliberately separate
  // from any live-heartbeat-based HA signal, which can read "not HA" while
  // the pair is genuinely down or mid-recovery (see haDbNames comment on
  // StartInfoClientResponse).
  if (updateLive && payload.haDbNames !== undefined) {
    const newHaDbNames = Array.isArray(payload.haDbNames) ? payload.haDbNames : [];
    if (JSON.stringify(state.haDbNamesByHost[hostUid]) !== JSON.stringify(newHaDbNames)) {
      state.haDbNamesByHost[hostUid] = newHaDbNames;
    }
  }
};

// One foreground start-info read for the host settled. The spinner stays
// while another one is still pending.
const endForegroundRead = (state, hostUid) => {
  if (!(hostUid in state.foregroundReadsByHost)) return; // host closed meanwhile
  const left = state.foregroundReadsByHost[hostUid] - 1;
  state.foregroundReadsByHost[hostUid] = left;
  state.loadingByHost[hostUid] = left > 0;
};

// Applies a start-info response to each view only if it is newer than what
// that view last applied. Reads are stamped when sent and an action's result
// when it returns, so a slow poll that was sent before a newer read or an
// action can never overwrite them. A background poll never moves the
// navigator.
const applyStartInfo = (state, hostUid, payload, { seq, isBackground = false }) => {
  if (!hostUid || seq === undefined) return;
  const updateLive = seq > (state.appliedLiveSeqByHost[hostUid] ?? 0);
  const updateNavigator = !isBackground && seq > (state.appliedNavigatorSeqByHost[hostUid] ?? 0);
  if (updateLive) state.appliedLiveSeqByHost[hostUid] = seq;
  if (updateNavigator) state.appliedNavigatorSeqByHost[hostUid] = seq;
  if (updateLive || updateNavigator) parseDbResponse(state, payload, hostUid, { updateLive, updateNavigator, seq });
};

const initialState = {
  // Keyed by hostUid — see parseDbResponse's comment: a single shared array
  // let a slow, still in-flight fetch for a host the user has since
  // switched away from resolve after the switch and overwrite the array the
  // UI is now using to render a DIFFERENT, currently-selected host's tree.
  databasesByHost: {}, // { hostUid: dbs[] }
  activeDatabasesByHost: {}, // { hostUid: dbname[] }
  // Navigator-only mirror of the two maps above — see parseDbResponse's
  // header comment. DatabaseTree.jsx reads these instead of
  // databasesByHost/activeDatabasesByHost, so the sidebar tree doesn't
  // move on every dashboard-interval poll tick.
  navigatorDatabasesByHost: {}, // { hostUid: dbs[] }
  navigatorActiveDatabasesByHost: {}, // { hostUid: dbname[] }
  haDbNamesByHost: {}, // { hostUid: dbname[] }
  // Mirrors state.host.selectedHostUid (via the addMatcher below) so a late
  // response for a host the user is no longer viewing can tell it isn't the
  // active one and skip touching the globally-shared selectedDatabase.
  activeHostUid: null,
  selectedDatabase: null,
  selectedDatabaseSubItem: null,
  loggedInDatabases: [],
  loggingInDatabases: {},
  loginChangedSeq: {}, // { dbKey: seq } — see noteLoginChange
  loadingByHost: {}, // { hostUid: boolean } — fetchDatabaseStartInfo's own
  // loading, kept per host like databasesByHost itself: a single shared
  // flag meant closing one host's tabs while fetchDatabaseStartInfo was
  // still in flight for it could only clear loading by zeroing it
  // globally, which also hid a DIFFERENT, still-legitimately-loading
  // host's own spinner.
  actionLoading: false,
  error: null,
  // { hostUid: number } — foreground start-info reads still pending, behind loadingByHost.
  foregroundReadsByHost: {},
  // { hostUid: seq } — the newest start-info each view applied; see applyStartInfo.
  appliedLiveSeqByHost: {},
  appliedNavigatorSeqByHost: {},
};

const databaseCoreSlice = createSlice({
  name: 'databaseCore',
  initialState,
  reducers: {
    setSelectedDatabase: (state, action) => {
      if (state.selectedDatabase !== action.payload) {
        state.selectedDatabase = action.payload;
        state.selectedDatabaseSubItem = null;
      }
    },
    setSelectedDatabaseSubItem: (state, action) => {
      state.selectedDatabaseSubItem = action.payload;
    },
    clearDatabaseError: (state) => {
      state.error = null;
    },
    // Dispatched whenever focus leaves a host (plain focus switch, delete,
    // disconnect/revoke) — hostUid is the host being LEFT, if known. Only
    // that host's cached lists are evicted; other hosts' cached data (and
    // their own in-flight fetches) are untouched. selectedDatabase and
    // friends are always cleared since they always belonged to whichever
    // host this reducer is firing for.
    //
    // Deliberately does NOT touch loggedInDatabases/loggingInDatabases —
    // those are composite-keyed (hostUid:dbname) and shared across every
    // host's tree, not just the one being reset here. This reducer fires
    // on every plain host-focus switch (see useHostActivation.js), so
    // clearing them here used to wipe every OTHER host's login state too
    // each time the user simply clicked between hosts. Use
    // clearDatabaseLoginsForHost to actually invalidate one host's logins
    // (host deleted, host session revoked).
    resetDatabaseState: (state, action) => {
      const hostUid = action.payload;
      if (hostUid) {
        delete state.databasesByHost[hostUid];
        delete state.activeDatabasesByHost[hostUid];
        delete state.navigatorDatabasesByHost[hostUid];
        delete state.navigatorActiveDatabasesByHost[hostUid];
        delete state.haDbNamesByHost[hostUid];
      } else {
        state.databasesByHost = {};
        state.activeDatabasesByHost = {};
        state.navigatorDatabasesByHost = {};
        state.navigatorActiveDatabasesByHost = {};
        state.haDbNamesByHost = {};
      }
      state.selectedDatabase = null;
      state.selectedDatabaseSubItem = null;
      state.error = null;
    },
    clearDatabaseLoginsForHost: (state, action) => {
      const hostUid = action.payload;
      if (!hostUid) return;
      const prefix = `${hostUid}:`;
      state.loggedInDatabases = state.loggedInDatabases.filter((key) => !key.startsWith(prefix));
      Object.keys(state.loggingInDatabases).forEach((key) => {
        if (key.startsWith(prefix)) delete state.loggingInDatabases[key];
      });
    },
    // Corrects the client's belief about a single database's login state to
    // match the server's — used when a request comes back MISSING_DB_CREDENTIALS
    // (the server-side dbmtuserlogin session it was relying on has expired and
    // no saved profile exists to silently re-authenticate with), so the padlock
    // icon doesn't keep showing "logged in" for a session that no longer is.
    clearDatabaseLogin: {
      reducer: (state, action) => {
        const { hostUid, dbname } = action.payload || {};
        if (!hostUid || !dbname) return;
        const key = dbKey(hostUid, dbname);
        state.loggedInDatabases = state.loggedInDatabases.filter((k) => k !== key);
        delete state.loggingInDatabases[key];
        noteLoginChange(state, hostUid, dbname, action.meta.seq);
      },
      prepare: (payload) => ({ payload, meta: { seq: nextSeq() } }),
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDatabaseStartInfo.pending, (state, action) => {
        const hostUid = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg?.hostUid;
        if (!action.meta.arg?.isBackground) {
          state.foregroundReadsByHost[hostUid] = (state.foregroundReadsByHost[hostUid] ?? 0) + 1;
          state.loadingByHost[hostUid] = true;
        }
        state.error = null;
      })
      .addCase(fetchDatabaseStartInfo.fulfilled, (state, action) => {
        const hostUid = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg?.hostUid;
        const isBackground = !!action.meta.arg?.isBackground;
        if (!isBackground) endForegroundRead(state, hostUid);
        applyStartInfo(state, hostUid, action.payload, { seq: action.meta.seq, isBackground });
      })
      .addCase(fetchDatabaseStartInfo.rejected, (state, action) => {
        const hostUid = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg?.hostUid;
        const isBackground = !!action.meta.arg?.isBackground;
        if (!isBackground) endForegroundRead(state, hostUid);
        // A failure is newer information too, but only when nothing newer was
        // applied meanwhile. A background poll failure is transient and
        // leaves the navigator alone; only an explicit fetch failure empties
        // the tree.
        const { seq } = action.meta;
        if (seq === undefined) return;
        if (seq > (state.appliedLiveSeqByHost[hostUid] ?? 0)) {
          state.appliedLiveSeqByHost[hostUid] = seq;
          clearList(state.databasesByHost, hostUid);
          clearList(state.activeDatabasesByHost, hostUid);
        }
        if (!isBackground && seq > (state.appliedNavigatorSeqByHost[hostUid] ?? 0)) {
          state.appliedNavigatorSeqByHost[hostUid] = seq;
          state.error = action.payload;
          clearList(state.navigatorDatabasesByHost, hostUid);
          clearList(state.navigatorActiveDatabasesByHost, hostUid);
        }
      })
      .addCase(startDatabase.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(startDatabase.fulfilled, (state, action) => {
        state.actionLoading = false;
        const { hostUid, dbname } = action.meta.arg || {};
        applyStartInfo(state, hostUid, action.payload, { seq: action.meta.seq });
        // startDatabase only succeeds once the backend's own ensureDbLogin
        // gate has (re-)established a dbmtuserlogin for this database — sync
        // that belief here too, not just when the explicit loginDatabase
        // thunk runs. Otherwise a database started via a bulk action (which
        // never dispatches loginDatabase itself) stays marked "not logged
        // in" here, which disables this database's own individual
        // start/stop menu items from then on even though the backend will
        // happily service them.
        if (hostUid && dbname) {
          const key = dbKey(hostUid, dbname);
          if (!state.loggedInDatabases.includes(key)) state.loggedInDatabases.push(key);
          noteLoginChange(state, hostUid, dbname, action.meta.seq);
        }
      })
      .addCase(startDatabase.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      })
      .addCase(stopDatabase.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(stopDatabase.fulfilled, (state, action) => {
        state.actionLoading = false;
        const { hostUid, dbname } = action.meta.arg || {};
        applyStartInfo(state, hostUid, action.payload, { seq: action.meta.seq });
        // See startDatabase.fulfilled's matching comment.
        if (hostUid && dbname) {
          const key = dbKey(hostUid, dbname);
          if (!state.loggedInDatabases.includes(key)) state.loggedInDatabases.push(key);
          noteLoginChange(state, hostUid, dbname, action.meta.seq);
        }
      })
      .addCase(stopDatabase.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      })
      .addCase(startAllDatabases.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(startAllDatabases.fulfilled, (state, action) => {
        state.actionLoading = false;
        markBulkSucceededLoggedIn(state, action.meta.arg?.hostUid, action.payload?.succeeded, action.meta.seq);
      })
      .addCase(startAllDatabases.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      })
      .addCase(stopAllDatabases.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(stopAllDatabases.fulfilled, (state, action) => {
        state.actionLoading = false;
        markBulkSucceededLoggedIn(state, action.meta.arg?.hostUid, action.payload?.succeeded, action.meta.seq);
      })
      .addCase(stopAllDatabases.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      })
      .addCase(loginDatabase.pending, (state, action) => {
        const { hostUid, dbname, isBackground } = action.meta.arg || {};
        if (!isBackground) state.actionLoading = true;
        if (dbname) state.loggingInDatabases[dbKey(hostUid, dbname)] = true;
        state.error = null;
      })
      .addCase(loginDatabase.fulfilled, (state, action) => {
        const { hostUid } = action.meta.arg || {};
        const { dbname } = action.payload;
        state.actionLoading = false;
        if (dbname) state.loggingInDatabases[dbKey(hostUid, dbname)] = false;
        const key = dbKey(hostUid, dbname);
        if (!state.loggedInDatabases.includes(key)) {
          state.loggedInDatabases.push(key);
        }
        noteLoginChange(state, hostUid, dbname, action.meta.seq);
      })
      .addCase(loginDatabase.rejected, (state, action) => {
        const { hostUid, dbname } = action.meta.arg || {};
        state.actionLoading = false;
        if (dbname) state.loggingInDatabases[dbKey(hostUid, dbname)] = false;
        state.error = action.payload;
      })
      .addCase(logoutDatabase.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(logoutDatabase.fulfilled, (state, action) => {
        const { hostUid } = action.meta.arg || {};
        const { dbname } = action.payload;
        state.actionLoading = false;
        const key = dbKey(hostUid, dbname);
        state.loggedInDatabases = state.loggedInDatabases.filter((d) => d !== key);
        noteLoginChange(state, hostUid, dbname, action.meta.seq);
      })
      .addCase(logoutDatabase.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      })
      .addCase(registerDatabase.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(registerDatabase.fulfilled, (state, action) => {
        state.actionLoading = false;
        if (action.payload.response) {
          applyStartInfo(state, action.meta.arg?.hostUid, action.payload.response, { seq: action.meta.seq });
        }
      })
      .addCase(registerDatabase.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      })
      .addCase(deleteDatabaseProfile.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(deleteDatabaseProfile.fulfilled, (state, action) => {
        state.actionLoading = false;
        // Forgetting the profile also drops the server's dbmt-login cache
        // for it (deleteDbProfile clears both), so this db is no longer
        // logged in on the client either.
        const { hostUid } = action.meta.arg || {};
        const key = dbKey(hostUid, action.payload.dbname);
        state.loggedInDatabases = state.loggedInDatabases.filter((d) => d !== key);
        noteLoginChange(state, hostUid, action.payload.dbname, action.meta.seq);
        if (action.payload.response) {
          applyStartInfo(state, hostUid, action.payload.response, { seq: action.meta.seq });
        }
      })
      .addCase(deleteDatabaseProfile.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      })
      // Mirrors hostSlice's selectedHostUid so fetchDatabaseStartInfo's
      // fulfilled handler (via parseDbResponse) can tell whether a given
      // response belongs to the host the user is currently viewing (see the
      // comment there).
      .addMatcher(
        (action) => action.type === 'host/setSelectedHost',
        (state, action) => {
          state.activeHostUid = action.payload;
        }
      )
      // The backend forgets this dbname's stored login profile + dbmt-login
      // cache on delete (see DatabaseLifecycleService.deleteDatabase) so a
      // later database created with this same name never inherits it — mirror
      // that here, or this client would keep believing the old, now-deleted
      // database is still "logged in" under that name.
      .addMatcher(
        (action) => action.type === 'database/deleteDatabase/fulfilled',
        (state, action) => {
          const { hostUid, dbname } = action.meta.arg || {};
          if (!hostUid || !dbname) return;
          const key = dbKey(hostUid, dbname);
          state.loggedInDatabases = state.loggedInDatabases.filter((k) => k !== key);
          delete state.loggingInDatabases[key];
        }
      )
      // Dispatched unconditionally on delete/disconnect, regardless of
      // whether this host was the currently selected one — unlike
      // resetDatabaseState, which only fires for the currently-selected
      // host — so this is also where a NON-selected host's cached database
      // lists must be evicted, or they'd sit in these maps forever.
      .addMatcher(
        (action) => action.type === 'layout/closeHostTabs',
        (state, action) => {
          const hostUid = action.payload;
          delete state.databasesByHost[hostUid];
          delete state.activeDatabasesByHost[hostUid];
          delete state.navigatorDatabasesByHost[hostUid];
          delete state.navigatorActiveDatabasesByHost[hostUid];
          delete state.haDbNamesByHost[hostUid];
          // A start-info read still in flight for this host was sent before
          // it closed (closeHostTabs carries the seq it closed at), so it can
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
        }
      );
  }
});

export const {
  setSelectedDatabase,
  setSelectedDatabaseSubItem,
  clearDatabaseError,
  resetDatabaseState,
  clearDatabaseLoginsForHost,
  clearDatabaseLogin
} = databaseCoreSlice.actions;

export default databaseCoreSlice.reducer;
