import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { hasStoredSession, sessionFromResponse, setAppSession, takeServerSession } from '../../api/apiClient';
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

/** How long the app waits, when it opens, for the server to say whether the cookies sign in. */
export const SESSION_CHECK_TIMEOUT_MS = 5000;

/**
 * Asks the server, with the cookies, whether this browser is signed in: once
 * when the app opens in a browser (the desktop app has no app login). The
 * session kept in localStorage can be missing or old: localStorage belongs to
 * one origin, while the browser sends the cookies to every port of the same
 * host name (not to another name of it, such as its IP address); and a tab
 * left on the login page has an old view of it. A 401 (after the refresh the
 * client tries) means signed out; no answer within SESSION_CHECK_TIMEOUT_MS,
 * or a failure (server down, busy), keeps what the stored session says.
 */
export const checkSession = createAsyncThunk(
  'auth/checkSession',
  async (_, { dispatch, rejectWithValue }) => {
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('session check timed out'));
      }, SESSION_CHECK_TIMEOUT_MS);
    });
    try {
      const answer = await Promise.race([
        authApi.getSession({ signal: controller.signal, __sessionCheck: true }),
        deadline,
      ]);
      // The expiry and the account: the refresh before expiry and the other
      // tabs' logout and account changes follow from them (apiClient).
      takeServerSession(answer);
      return answer;
    } catch (err) {
      const status = err?.response?.status ?? null;
      // Signed out: the stored session and its refresh end too.
      if (status === 401 || status === 403) dispatch(logout());
      return rejectWithValue({ status });
    } finally {
      clearTimeout(timer);
    }
  }
);

// The tokens are httpOnly cookies the page cannot see; a session kept from
// the last visit counts as signed in until checkSession has the server's answer.
const initialState = {
  // The desktop app has no app login (isDesktopApp).
  isAuthenticated: isDesktopApp() || hasStoredSession(),
  // In a browser the screens wait for checkSession; the desktop app needs no check.
  sessionChecked: isDesktopApp(),
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
      // The ID goes with the session the tabs share (see SESSION_EXPIRY_KEY).
      const user = action.payload.user?.id;
      setAppSession(typeof user === 'string' && user ? { ...session, user } : session);
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
      // The root reducer resets every slice on logout: the answer is known (signed out).
      state.sessionChecked = true;
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
      .addCase(checkSession.fulfilled, (state) => {
        state.sessionChecked = true;
        state.isAuthenticated = true;
        // The user stays to the header, which loads it with the preferences (fetchUser).
      })
      .addCase(checkSession.rejected, (state) => {
        // Signed out came with logout(); anything else keeps the stored session.
        state.sessionChecked = true;
      })
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
