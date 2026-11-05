import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { setAuthToken } from '../../api/apiClient';
import { authApi } from './authApi';
import { isDesktopApp } from '../desktop/isDesktopApp';

const token = localStorage.getItem('token');
const refreshToken = localStorage.getItem('refreshToken');

export const fetchUser = createAsyncThunk(
  'auth/fetchUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authApi.getUserInfo();
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch user info');
    }
  }
);

export const updateAccount = createAsyncThunk(
  'auth/updateAccount',
  async (data, { rejectWithValue }) => {
    try {
      const response = await authApi.updateUserAccount(data);
      return response;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to update account');
    }
  }
);

export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async (_, { getState, dispatch }) => {
    const storedRefresh = getState().auth.refreshToken || localStorage.getItem('refreshToken');
    try {
      await authApi.logout(storedRefresh);
    } catch {
      // Clear client session even when server logout fails (e.g. expired access token).
    } finally {
      // Must trigger root reducer reset path (`auth/logout`) to clear all slices.
      dispatch(logout());
    }
  }
);

const initialState = {
  // The desktop app has no app login (isDesktopApp).
  isAuthenticated: isDesktopApp() || !!token,
  token: token || null,
  refreshToken: refreshToken || null,
  user: null,
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    loginSuccess: (state, action) => {
      if (!action.payload?.token || !action.payload?.refreshToken) {
        state.loading = false;
        state.isAuthenticated = false;
        state.token = null;
        state.refreshToken = null;
        state.user = null;
        state.error = 'Login response missing required tokens';
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        setAuthToken(null);
        return;
      }
      state.loading = false;
      state.isAuthenticated = true;
      state.token = action.payload.token;
      state.refreshToken = action.payload.refreshToken ?? null;
      state.user = action.payload.user;
      state.error = null;
      localStorage.setItem('token', action.payload.token);
      if (action.payload.refreshToken) {
        localStorage.setItem('refreshToken', action.payload.refreshToken);
      } else {
        localStorage.removeItem('refreshToken');
      }
      setAuthToken(action.payload.token);
    },
    sessionRefreshed: (state, action) => {
      state.token = action.payload.token;
      state.refreshToken = action.payload.refreshToken ?? state.refreshToken;
      state.isAuthenticated = true;
      localStorage.setItem('token', action.payload.token);
      if (action.payload.refreshToken) {
        localStorage.setItem('refreshToken', action.payload.refreshToken);
      }
      setAuthToken(action.payload.token);
    },
    loginFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },
    logout: (state) => {
      state.isAuthenticated = false;
      state.token = null;
      state.refreshToken = null;
      state.user = null;
      state.error = null;
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      setAuthToken(null);
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUser.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
      })
      .addCase(fetchUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(updateAccount.pending, (state) => {
        state.loading = true;
      })
      .addCase(updateAccount.fulfilled, (state, action) => {
        state.loading = false;
        state.user = { ...state.user, ...action.payload };
      })
      .addCase(updateAccount.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const {
  loginStart,
  loginSuccess,
  loginFailure,
  sessionRefreshed,
  logout,
  clearError,
} = authSlice.actions;
export default authSlice.reducer;
