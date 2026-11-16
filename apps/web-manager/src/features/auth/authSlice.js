import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { hasStoredSession, sessionFromResponse, setAppSession } from '../../api/apiClient';
import { authApi } from './authApi';
import { isDesktopApp } from '../desktop/isDesktopApp';
import { requestErrorText } from '../../infrastructure/errors/serverErrorText';
import { getCM, getStoredLocale } from '../../constants/useCM';

export const fetchUser = createAsyncThunk(
  'auth/fetchUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authApi.getUserInfo();
      return response;
    } catch (err) {
      return rejectWithValue(requestErrorText(err));
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
      return rejectWithValue(requestErrorText(err));
    }
  }
);

export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async (_, { dispatch }) => {
    try {
      // The server ends the session and clears its cookies.
      await authApi.logout();
    } catch {
      // Clear client session even when server logout fails.
    } finally {
      // Must trigger root reducer reset path (`auth/logout`) to clear all slices.
      dispatch(logout());
    }
  }
);

// The tokens are httpOnly cookies the page cannot see; a session kept from
// the last visit counts as signed in until the server says otherwise.
const initialState = {
  // The desktop app has no app login (isDesktopApp).
  isAuthenticated: isDesktopApp() || hasStoredSession(),
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
    // payload: the login answer ({ expiresIn }) and the user.
    loginSuccess: (state, action) => {
      const session = sessionFromResponse(action.payload);
      if (!session) {
        state.loading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.error = getCM(getStoredLocale()).loginTokenMissingMsg;
        setAppSession(null);
        return;
      }
      state.loading = false;
      state.isAuthenticated = true;
      state.user = action.payload.user;
      state.error = null;
      setAppSession(session);
    },
    // The session is already kept (this tab's refresh, or another tab's);
    // the state only follows.
    sessionRefreshed: (state) => {
      state.isAuthenticated = true;
    },
    loginFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },
    logout: (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.error = null;
      setAppSession(null);
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
