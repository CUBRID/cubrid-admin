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

// Helper to parse the shared response format
const parseDbResponse = (state, payload) => {
  if (!payload) return;
  const dbsFound = payload.dblist?.dbs;
  const activeFound = payload.activelist?.active;

  let newActive;
  if (payload.activelist !== undefined) {
    const rawActive = Array.isArray(activeFound) ? activeFound : activeFound ? [activeFound] : [];
    newActive = rawActive.map(d => (typeof d === 'string' ? d : d?.dbname)).filter(Boolean);
    if (JSON.stringify(state.activeDatabases) !== JSON.stringify(newActive)) {
      state.activeDatabases = newActive;
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
    const activeNames = newActive ?? state.activeDatabases ?? [];
    const missingActiveNames = activeNames.filter((name) => !knownNames.has(name));
    const mergedList = missingActiveNames.length > 0
      ? [...rawList, ...missingActiveNames.map((dbname) => ({ dbname, isProfileExists: false }))]
      : rawList;
    if (JSON.stringify(state.databases) !== JSON.stringify(mergedList)) {
      state.databases = mergedList;
    }
  }

  if (dbsFound) {
    const exists = state.databases.find(db => db.dbname === state.selectedDatabase);
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
    if (JSON.stringify(state.haDbNames) !== JSON.stringify(newHaDbNames)) {
      state.haDbNames = newHaDbNames;
    }
  }
};

const initialState = {
  databases: [],
  activeDatabases: [],
  haDbNames: [],
  selectedDatabase: null,
  selectedDatabaseSubItem: null,
  loggedInDatabases: [],
  loggingInDatabases: {},
  loading: false,
  actionLoading: false,
  error: null,
  latestStartInfoRequestId: null,
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
    resetDatabaseState: (state) => {
      // Deliberately does NOT touch loggedInDatabases/loggingInDatabases —
      // those are composite-keyed (hostUid:dbname) and shared across every
      // host's tree, not just the one being reset here. This reducer fires
      // on every plain host-focus switch (see useHostActivation.js), so
      // clearing them here used to wipe every OTHER host's login state too
      // each time the user simply clicked between hosts. Use
      // clearDatabaseLoginsForHost to actually invalidate one host's logins
      // (host deleted, host session revoked).
      state.databases = [];
      state.activeDatabases = [];
      state.haDbNames = [];
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
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDatabaseStartInfo.pending, (state, action) => {
        // A slower earlier request (e.g. a previous host's start-info, still
        // in flight when the user switches focus again) can otherwise
        // resolve after this one and clobber its fresher data — track the
        // latest requestId and have fulfilled/rejected ignore anything else.
        state.latestStartInfoRequestId = action.meta.requestId;
        if (!action.meta.arg?.isBackground) state.loading = true;
        state.error = null;
      })
      .addCase(fetchDatabaseStartInfo.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.latestStartInfoRequestId) return;
        state.loading = false;
        parseDbResponse(state, action.payload);
      })
      .addCase(fetchDatabaseStartInfo.rejected, (state, action) => {
        if (action.meta.requestId !== state.latestStartInfoRequestId) return;
        state.loading = false;
        state.error = action.payload;
        state.databases = [];
        state.activeDatabases = [];
      })
      .addCase(startDatabase.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(startDatabase.fulfilled, (state, action) => {
        state.actionLoading = false;
        parseDbResponse(state, action.payload);
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
        parseDbResponse(state, action.payload);
      })
      .addCase(stopDatabase.rejected, (state, action) => {
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
          parseDbResponse(state, action.payload.response);
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
          parseDbResponse(state, action.payload.response);
        }
      })
      .addCase(deleteDatabaseProfile.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      });
  }
});

export const {
  setSelectedDatabase,
  setSelectedDatabaseSubItem,
  clearDatabaseError,
  resetDatabaseState,
  clearDatabaseLoginsForHost
} = databaseCoreSlice.actions;

export default databaseCoreSlice.reducer;
