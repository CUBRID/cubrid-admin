import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getStoredLocale, setStoredLocale } from '../../constants/useCM';
import { userApi } from './userApi';

export const DEFAULT_PREFERENCES = {
  dashboardInterval: 0,
  brokerStatusInterval: 0,
  uiLocale: 'en',
};

/** Preserve interval defaults and locale when server/partial payloads omit fields. */
function mergePreferencesState(current, patch) {
  const merged = {
    ...DEFAULT_PREFERENCES,
    ...current,
    ...patch,
  };
  if (patch.dashboardInterval == null) {
    merged.dashboardInterval =
      current.dashboardInterval ?? DEFAULT_PREFERENCES.dashboardInterval;
  }
  if (patch.brokerStatusInterval == null) {
    merged.brokerStatusInterval =
      current.brokerStatusInterval ?? DEFAULT_PREFERENCES.brokerStatusInterval;
  }
  if (patch.uiLocale === 'ko' || patch.uiLocale === 'en') {
    merged.uiLocale = patch.uiLocale;
  } else {
    merged.uiLocale = current.uiLocale ?? getStoredLocale();
  }
  return merged;
}

export const fetchPreferences = createAsyncThunk(
  'user/fetchPreferences',
  async (_, { rejectWithValue }) => {
    try {
      const response = await userApi.getPreferences();
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch preferences');
    }
  }
);

export const updatePreferences = createAsyncThunk(
  'user/updatePreferences',
  async (preferences, { rejectWithValue }) => {
    try {
      await userApi.updatePreferences(preferences);
      return preferences;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to update preferences');
    }
  }
);

export const fetchDatabaseUsers = createAsyncThunk(
  'user/fetchDatabaseUsers',
  async ({ hostUid, dbname }, { rejectWithValue }) => {
    try {
      const response = await userApi.getDatabaseUsers(hostUid, dbname);
      // Map @name to name for UI consistency
      const users = (response.user || []).map(u => ({
        ...u,
        name: u['@name'] || u.name,
        id: u['@id'] || u.id
      }));
      return { dbname, users };
    } catch (err) {
      return rejectWithValue({ 
        dbname, 
        error: err.response?.data?.message || `Failed to fetch users for ${dbname}` 
      });
    }
  }
);

export const createDatabaseUser = createAsyncThunk(
  'user/createDatabaseUser',
  async ({ hostUid, dbname, payload }, { rejectWithValue }) => {
    try {
      const response = await userApi.createDatabaseUser(hostUid, dbname, payload);
      return { dbname, user: response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to create user');
    }
  }
);

export const updateDatabaseUser = createAsyncThunk(
  'user/updateDatabaseUser',
  async ({ hostUid, dbname, userName, payload }, { rejectWithValue }) => {
    try {
      const response = await userApi.updateDatabaseUser(hostUid, dbname, userName, payload);
      return { dbname, userName, user: response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to update user');
    }
  }
);

export const dropDatabaseUser = createAsyncThunk(
  'user/dropDatabaseUser',
  async ({ hostUid, dbname, userName }, { rejectWithValue }) => {
    try {
      await userApi.dropDatabaseUser(hostUid, dbname, userName);
      return { dbname, userName };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to drop user');
    }
  }
);

const initialState = {
  isProfileOpen: false,
  profile: {
    fullName: 'Admin User',
    email: 'admin@cubrid.com',
    role: 'Database Administrator',
    phone: '+1 (555) 123-4567',
    department: 'Engineering',
    timezone: 'UTC+7',
  },
  preferences: {
    ...DEFAULT_PREFERENCES,
    uiLocale: getStoredLocale(),
  },
  databaseUsers: {}, // { [dbname]: [] }
  databaseUsersLoading: {}, // { [dbname]: boolean }
  databaseUsersError: {}, // { [dbname]: string }
  isCreateUserModalOpen: false,
  isEditUserModalOpen: false,
  isDropUserModalOpen: false,
  createUserDbName: null,
  editUserData: null, // { dbname, user }
  dropUserData: null, // { dbname, userName }
  preferencesLoading: false,
  actionLoading: false,
  error: null,
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    openProfileModal: (state) => {
      state.isProfileOpen = true;
    },
    closeProfileModal: (state) => {
      state.isProfileOpen = false;
    },
    updateProfile: (state, action) => {
      state.profile = { ...state.profile, ...action.payload };
    },
    openCreateUserModal: (state, action) => {
      state.isCreateUserModalOpen = true;
      state.createUserDbName = action.payload; // dbname
    },
    closeCreateUserModal: (state) => {
      state.isCreateUserModalOpen = false;
      state.createUserDbName = null;
    },
    openEditUserModal: (state, action) => {
      state.isEditUserModalOpen = true;
      state.editUserData = action.payload; // { dbname, user }
    },
    closeEditUserModal: (state) => {
      state.isEditUserModalOpen = false;
      state.editUserData = null;
    },
    openDropUserModal: (state, action) => {
      state.isDropUserModalOpen = true;
      state.dropUserData = action.payload; // { dbname, userName }
    },
    closeDropUserModal: (state) => {
      state.isDropUserModalOpen = false;
      state.dropUserData = null;
    },
    clearUserError: (state) => {
      state.error = null;
    },
    setUiLocale: (state, action) => {
      const locale = action.payload === 'ko' ? 'ko' : 'en';
      state.preferences.uiLocale = locale;
      setStoredLocale(locale);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPreferences.pending, (state) => {
        state.preferencesLoading = true;
      })
      .addCase(fetchPreferences.fulfilled, (state, action) => {
        state.preferencesLoading = false;
        state.preferences = mergePreferencesState(
          state.preferences,
          action.payload ?? {}
        );
      })
      .addCase(fetchPreferences.rejected, (state, action) => {
        state.preferencesLoading = false;
        state.error = action.payload;
      })
      .addCase(updatePreferences.pending, (state) => {
        state.preferencesLoading = true;
      })
      .addCase(updatePreferences.fulfilled, (state, action) => {
        state.preferencesLoading = false;
        state.preferences = mergePreferencesState(
          state.preferences,
          action.payload ?? {}
        );
      })
      .addCase(updatePreferences.rejected, (state, action) => {
        state.preferencesLoading = false;
        state.error = action.payload;
      })
      .addCase(fetchDatabaseUsers.pending, (state, action) => {
        const { dbname } = action.meta.arg;
        state.databaseUsersLoading[dbname] = true;
        delete state.databaseUsersError[dbname];
      })
      .addCase(fetchDatabaseUsers.fulfilled, (state, action) => {
        const { dbname, users } = action.payload;
        state.databaseUsersLoading[dbname] = false;
        state.databaseUsers[dbname] = users;
      })
      .addCase(fetchDatabaseUsers.rejected, (state, action) => {
        const { dbname, error } = action.payload || action.meta.arg;
        state.databaseUsersLoading[dbname] = false;
        state.databaseUsersError[dbname] = error;
      })
      // Create user
      .addCase(createDatabaseUser.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(createDatabaseUser.fulfilled, (state, _action) => {
        state.actionLoading = false;
        // Optionally refetch users or update state manually
      })
      .addCase(createDatabaseUser.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      })
      // Update user
      .addCase(updateDatabaseUser.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(updateDatabaseUser.fulfilled, (state, _action) => {
        state.actionLoading = false;
      })
      .addCase(updateDatabaseUser.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      })
      // Drop user
      .addCase(dropDatabaseUser.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(dropDatabaseUser.fulfilled, (state, action) => {
        state.actionLoading = false;
        const { dbname, userName } = action.payload;
        if (state.databaseUsers[dbname]) {
          state.databaseUsers[dbname] = state.databaseUsers[dbname].filter(u => {
            const currentName = typeof u === 'string' ? u : (u.name || u['@name']);
            return currentName !== userName;
          });
        }
      })
      .addCase(dropDatabaseUser.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      });
  },
});

export const {
  openProfileModal,
  closeProfileModal,
  updateProfile,
  openCreateUserModal,
  closeCreateUserModal,
  openEditUserModal,
  closeEditUserModal,
  openDropUserModal,
  closeDropUserModal,
  clearUserError,
  setUiLocale,
} = userSlice.actions;

export default userSlice.reducer;
