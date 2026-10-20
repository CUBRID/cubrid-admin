import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { databaseApi } from './databaseApi';
import { dbKey } from './dbKey';

export const fetchDatabaseParamDump = createAsyncThunk(
  'database/fetchParamDump',
  async ({ hostUid, dbname, both }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getParamDump(hostUid, dbname, both);
      return { dbname, data: response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to fetch param dump for ${dbname}`);
    }
  }
);

export const fetchDatabasePlanDump = createAsyncThunk(
  'database/fetchPlanDump',
  async ({ hostUid, dbname, plandrop }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getPlanDump(hostUid, dbname, plandrop);
      return { dbname, data: response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to fetch plan dump for ${dbname}`);
    }
  }
);

export const fetchDatabaseClasses = createAsyncThunk(
  'database/fetchClasses',
  async ({ hostUid, dbname, dbstatus }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getClassInfo(hostUid, dbname, dbstatus || 'on');
      return { dbname, classes: response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to fetch classes for ${dbname}`);
    }
  }
);

export const fetchAutoVolumeConfig = createAsyncThunk(
  'database/fetchAutoVolumeConfig',
  async ({ hostUid, dbname }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getAutoVolumeConfig(hostUid, dbname);
      return { dbname, config: response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to fetch auto volume config for ${dbname}`);
    }
  }
);

export const updateAutoVolumeConfig = createAsyncThunk(
  'database/updateAutoVolumeConfig',
  async ({ hostUid, dbname, payload }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.setAutoVolumeConfig(hostUid, dbname, payload);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to update auto volume config for ${dbname}`);
    }
  }
);

export const fetchAutoVolumeLog = createAsyncThunk(
  'database/fetchAutoVolumeLog',
  async ({ hostUid }, { rejectWithValue }) => {
    try {
      const response = await databaseApi.getAutoVolumeLog(hostUid);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch auto volume log');
    }
  }
);

const initialState = {
  // Named to match legacy component expectations
  databaseInfoData: {},
  databaseInfoLoading: false,
  databaseInfoError: null,
  
  planDumpData: {},
  planDumpLoading: false,
  planDumpError: null,
  
  databaseClasses: {},
  databaseClassesLoading: {},
  
  autoVolumeConfigs: {},
  autoVolumeLogs: [],
  autoVolumeLoading: false,
  autoVolumeError: null,
  logsLoading: false,
  logsError: null,
  loading: false,
};

const databaseConfigurationSlice = createSlice({
  name: 'databaseConfiguration',
  initialState,
  reducers: {
    resetPlanDumpState: (state) => {
      state.planDumpError = null;
      state.planDumpLoading = false;
      state.planDumpData = {};
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDatabaseParamDump.pending, (state) => {
        state.databaseInfoLoading = true;
        state.databaseInfoError = null;
      })
      .addCase(fetchDatabaseParamDump.fulfilled, (state, action) => {
        const { hostUid } = action.meta.arg;
        const { dbname, data } = action.payload;
        state.databaseInfoLoading = false;
        state.databaseInfoData[dbKey(hostUid, dbname)] = data;
      })
      .addCase(fetchDatabaseParamDump.rejected, (state, action) => {
        state.databaseInfoLoading = false;
        state.databaseInfoError = action.payload;
      })
      .addCase(fetchDatabasePlanDump.pending, (state) => {
        state.planDumpLoading = true;
        state.planDumpError = null;
      })
      .addCase(fetchDatabasePlanDump.fulfilled, (state, action) => {
        const { hostUid } = action.meta.arg;
        const { dbname, data } = action.payload;
        state.planDumpLoading = false;
        state.planDumpData[dbKey(hostUid, dbname)] = data;
      })
      .addCase(fetchDatabasePlanDump.rejected, (state, action) => {
        state.planDumpLoading = false;
        state.planDumpError = action.payload;
      })
      .addCase(fetchDatabaseClasses.pending, (state, action) => {
        const { dbname } = action.meta.arg;
        state.databaseClassesLoading[dbname] = true;
      })
      .addCase(fetchDatabaseClasses.fulfilled, (state, action) => {
        const { dbname, classes } = action.payload;
        state.databaseClassesLoading[dbname] = false;
        state.databaseClasses[dbname] = classes;
      })
      .addCase(fetchDatabaseClasses.rejected, (state, action) => {
        const { dbname } = action.meta.arg;
        state.databaseClassesLoading[dbname] = false;
      })
      .addCase(fetchAutoVolumeConfig.pending, (state) => {
        state.autoVolumeLoading = true;
        state.autoVolumeError = null;
      })
      .addCase(fetchAutoVolumeConfig.fulfilled, (state, action) => {
        const { hostUid } = action.meta.arg;
        const { dbname, config } = action.payload;
        state.autoVolumeLoading = false;
        state.autoVolumeConfigs[dbKey(hostUid, dbname)] = config;
      })
      .addCase(fetchAutoVolumeConfig.rejected, (state, action) => {
        state.autoVolumeLoading = false;
        state.autoVolumeError = action.payload;
      })
      .addCase(fetchAutoVolumeLog.pending, (state) => {
        state.logsLoading = true;
        state.logsError = null;
      })
      .addCase(fetchAutoVolumeLog.fulfilled, (state, action) => {
        state.logsLoading = false;
        state.autoVolumeLogs = action.payload;
      })
      .addCase(fetchAutoVolumeLog.rejected, (state, action) => {
        state.logsLoading = false;
        state.logsError = action.payload;
      });
  }
});

export const { resetPlanDumpState } = databaseConfigurationSlice.actions;
export default databaseConfigurationSlice.reducer;
