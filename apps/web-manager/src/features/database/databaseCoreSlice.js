import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { databaseApi } from './databaseApi';
import { isAmbiguousFailure } from '../../api/isAmbiguousFailure';
import { dbKey } from './dbKey';

export const fetchDatabaseStartInfo = createAsyncThunk(
  'database/fetchDatabaseStartInfo',
  async (arg, { rejectWithValue }) => {
    const hostUid = typeof arg === 'string' ? arg : arg.hostUid;
    try {
      const response = await databaseApi.getStartInfo(hostUid);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || 'Failed to fetch database information');
    }
  }
);

export const startDatabase = createAsyncThunk(
  'database/startDatabase',
  async ({ hostUid, dbname }, { rejectWithValue, dispatch }) => {
    try {
      const response = await databaseApi.startDatabase(hostUid, dbname);
      return response;
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
  async ({ hostUid, dbname }, { rejectWithValue, dispatch }) => {
    try {
      const response = await databaseApi.stopDatabase(hostUid, dbname);
      return response;
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
          return info;
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

// Bulk start/stop for the "Start/Stop All Databases" tree actions (Restart
// All stays per-database — see databaseBulkActions.js).
// Goes through the dedicated start-all/stop-all endpoints instead of looping
// individual startDatabase/stopDatabase calls client-side: the backend
// already isolates per-database failures there (a database with no stored
// login profile is reported in `failed` instead of aborting every other
// database in the batch), which a client-side loop awaiting each call in
// turn cannot do once any one of them throws.
export const startAllDatabases = createAsyncThunk(
  'database/startAllDatabases',
  async ({ hostUid, dbnames }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.startAllDatabases(hostUid, dbnames);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || 'Failed to start databases');
    }
  }
);

export const stopAllDatabases = createAsyncThunk(
  'database/stopAllDatabases',
  async ({ hostUid, dbnames }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.stopAllDatabases(hostUid, dbnames);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || 'Failed to stop databases');
    }
  }
);

export const loginDatabase = createAsyncThunk(
  'database/loginDatabase',
  async ({ hostUid, dbname, payload }, { rejectWithValue }) => {
    try {
      const response = payload 
        ? await databaseApi.loginDatabase(hostUid, dbname, payload)
        : await databaseApi.loginDatabaseWithProfile(hostUid, dbname);
      return { dbname, ...response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || `Failed to login to database ${dbname}`);
    }
  }
);

export const logoutDatabase = createAsyncThunk(
  'database/logoutDatabase',
  async ({ hostUid, dbname }, { rejectWithValue }) => {
    try {
      await databaseApi.logoutDatabase(hostUid, dbname);
      return { dbname };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || `Failed to log out of database ${dbname}`);
    }
  }
);

export const registerDatabase = createAsyncThunk(
  'database/registerDatabase',
  async ({ hostUid, dbname, payload }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.registerDatabase(hostUid, dbname, payload);
      return { dbname, response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || `Failed to register database ${dbname}`);
    }
  }
);

export const deleteDatabaseProfile = createAsyncThunk(
  'database/deleteDatabaseProfile',
  async ({ hostUid, dbname }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.deleteDatabaseProfile(hostUid, dbname);
      return { dbname, response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || `Failed to delete saved credentials for ${dbname}`);
    }
  }
);

// Helper to parse the shared response format. hostUid identifies which
// host's per-host slot this response belongs to — every list this writes
// lives in a {hostUid: [...]} map (see initialState) rather than a single
// shared array, so a response for a host the user has since switched away
// from can never overwrite the data the UI is now using to render a
// DIFFERENT, currently-selected host's tree/dashboard.
const parseDbResponse = (state, payload, hostUid) => {
  if (!payload) return;
  const dbsFound = payload.dblist?.dbs;
  const activeFound = payload.activelist?.active;

  const prevActive = state.activeDatabasesByHost[hostUid];
  let newActive;
  if (payload.activelist !== undefined) {
    const rawActive = Array.isArray(activeFound) ? activeFound : activeFound ? [activeFound] : [];
    newActive = rawActive.map(d => (typeof d === 'string' ? d : d?.dbname)).filter(Boolean);
    if (JSON.stringify(prevActive) !== JSON.stringify(newActive)) {
      state.activeDatabasesByHost[hostUid] = newActive;
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
      ? [...rawList, ...missingActiveNames.map((dbname) => ({ dbname, isProfileExists: false }))]
      : rawList;
    if (JSON.stringify(state.databasesByHost[hostUid]) !== JSON.stringify(mergedList)) {
      state.databasesByHost[hostUid] = mergedList;
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

  // Static ha_db_list membership from cubrid_ha.conf — deliberately separate
  // from any live-heartbeat-based HA signal, which can read "not HA" while
  // the pair is genuinely down or mid-recovery (see haDbNames comment on
  // StartInfoClientResponse).
  if (payload.haDbNames !== undefined) {
    const newHaDbNames = Array.isArray(payload.haDbNames) ? payload.haDbNames : [];
    if (JSON.stringify(state.haDbNamesByHost[hostUid]) !== JSON.stringify(newHaDbNames)) {
      state.haDbNamesByHost[hostUid] = newHaDbNames;
    }
  }
};

const initialState = {
  // Keyed by hostUid — see parseDbResponse's comment: a single shared array
  // let a slow, still in-flight fetch for a host the user has since
  // switched away from resolve after the switch and overwrite the array the
  // UI is now using to render a DIFFERENT, currently-selected host's tree.
  databasesByHost: {}, // { hostUid: dbs[] }
  activeDatabasesByHost: {}, // { hostUid: dbname[] }
  haDbNamesByHost: {}, // { hostUid: dbname[] }
  // Mirrors state.host.selectedHostUid (via the addMatcher below) so a late
  // response for a host the user is no longer viewing can tell it isn't the
  // active one and skip touching the globally-shared selectedDatabase.
  activeHostUid: null,
  selectedDatabase: null,
  selectedDatabaseSubItem: null,
  loggedInDatabases: [],
  loggingInDatabases: {},
  loadingByHost: {}, // { hostUid: boolean } — fetchDatabaseStartInfo's own
  // loading, kept per host like databasesByHost itself: a single shared
  // flag meant closing one host's tabs while fetchDatabaseStartInfo was
  // still in flight for it could only clear loading by zeroing it
  // globally, which also hid a DIFFERENT, still-legitimately-loading
  // host's own spinner.
  actionLoading: false,
  error: null,
  latestStartInfoRequestIdByHost: {}, // { hostUid: requestId }
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
        delete state.haDbNamesByHost[hostUid];
      } else {
        state.databasesByHost = {};
        state.activeDatabasesByHost = {};
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
    clearDatabaseLogin: (state, action) => {
      const { hostUid, dbname } = action.payload || {};
      if (!hostUid || !dbname) return;
      const key = dbKey(hostUid, dbname);
      state.loggedInDatabases = state.loggedInDatabases.filter((k) => k !== key);
      delete state.loggingInDatabases[key];
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDatabaseStartInfo.pending, (state, action) => {
        // Track the latest requestId PER HOST so a slower earlier request
        // for that same host (still in flight when the user switches focus
        // away and back) can't resolve after a newer one and clobber its
        // fresher data.
        //
        // Scoped by hostUid, not a single shared id: a bare shared id meant
        // any request for ANY host would mark this host's own in-flight
        // request as "stale" the instant it fired, discarding this host's
        // response once it resolved — under sustained polling across
        // multiple hosts, that could discard every response for a given
        // host indefinitely, not just an actually-superseded one.
        const hostUid = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg?.hostUid;
        state.latestStartInfoRequestIdByHost[hostUid] = action.meta.requestId;
        if (!action.meta.arg?.isBackground) state.loadingByHost[hostUid] = true;
        state.error = null;
      })
      .addCase(fetchDatabaseStartInfo.fulfilled, (state, action) => {
        const hostUid = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg?.hostUid;
        if (action.meta.requestId !== state.latestStartInfoRequestIdByHost[hostUid]) return;
        state.loadingByHost[hostUid] = false;
        parseDbResponse(state, action.payload, hostUid);
      })
      .addCase(fetchDatabaseStartInfo.rejected, (state, action) => {
        const hostUid = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg?.hostUid;
        if (action.meta.requestId !== state.latestStartInfoRequestIdByHost[hostUid]) return;
        state.loadingByHost[hostUid] = false;
        state.error = action.payload;
        state.databasesByHost[hostUid] = [];
        state.activeDatabasesByHost[hostUid] = [];
      })
      .addCase(startDatabase.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(startDatabase.fulfilled, (state, action) => {
        state.actionLoading = false;
        const { hostUid, dbname } = action.meta.arg || {};
        parseDbResponse(state, action.payload, hostUid);
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
        parseDbResponse(state, action.payload, hostUid);
        // See startDatabase.fulfilled's matching comment.
        if (hostUid && dbname) {
          const key = dbKey(hostUid, dbname);
          if (!state.loggedInDatabases.includes(key)) state.loggedInDatabases.push(key);
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
        const { hostUid } = action.meta.arg || {};
        if (hostUid) {
          (action.payload?.succeeded || []).forEach((dbname) => {
            const key = dbKey(hostUid, dbname);
            if (!state.loggedInDatabases.includes(key)) state.loggedInDatabases.push(key);
          });
        }
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
        const { hostUid } = action.meta.arg || {};
        if (hostUid) {
          (action.payload?.succeeded || []).forEach((dbname) => {
            const key = dbKey(hostUid, dbname);
            if (!state.loggedInDatabases.includes(key)) state.loggedInDatabases.push(key);
          });
        }
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
          parseDbResponse(state, action.payload.response, action.meta.arg?.hostUid);
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
        if (action.payload.response) {
          parseDbResponse(state, action.payload.response, hostUid);
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
          delete state.haDbNamesByHost[hostUid];
          // A fetchDatabaseStartInfo already in flight for this host when it
          // was deleted/disconnected is still "the latest for its own host"
          // per the per-host dedup above — nothing else for this host will
          // ever supersede it now that the host is gone — so it would pass
          // that check and resurrect this host's just-evicted slot once it
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
          delete state.latestStartInfoRequestIdByHost[hostUid];
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
