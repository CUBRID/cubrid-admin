import { createSlice } from '@reduxjs/toolkit';

const getInitialTheme = () => {
  const saved = localStorage.getItem('theme');
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const initialState = {
  theme: getInitialTheme(),
  isSidebarCollapsed: localStorage.getItem('isSidebarCollapsed') === 'true',
  isResizing: false,
  activeMainTab: null,
  openTabs: [],
  dirtyTabs: [], // Tracks tab IDs with unsaved changes
  statusModal: {
    isOpen: false,
    type: 'success', // success, error, info
    title: '',
    message: '',
    guidance: null, // string[] — curated "things to check" for error type
    detail: null, // raw CMS/server error text, shown behind a "Show details" toggle
    tables: null, // FailureTable props[] — per-item bulk outcomes, shown directly
  },
  refreshCounter: 0,
  refreshTabId: null,
  // Hosts whose CMS login still uses the installed admin/admin, waiting to
  // be pointed out, and hosts already pointed out this session.
  defaultCmsPasswordHosts: [],
  defaultCmsPasswordNoticed: [],
};

const layoutSlice = createSlice({
  name: 'layout',
  initialState,
  reducers: {
    toggleTheme: (state) => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', state.theme);
    },
    setTheme: (state, action) => {
      state.theme = action.payload;
      localStorage.setItem('theme', action.payload);
    },
    toggleSidebar: (state) => {
      state.isSidebarCollapsed = !state.isSidebarCollapsed;
      localStorage.setItem('isSidebarCollapsed', state.isSidebarCollapsed);
    },
    setSidebarCollapsed: (state, action) => {
      state.isSidebarCollapsed = action.payload;
      localStorage.setItem('isSidebarCollapsed', action.payload);
    },
    setIsResizing: (state, action) => {
      state.isResizing = action.payload;
    },
    setActiveMainTab: (state, action) => {
      state.activeMainTab = action.payload;
      // Also ensure it's in openTabs if we are setting it active
      if (!state.openTabs.includes(action.payload)) {
        state.openTabs.push(action.payload);
      }
    },
    openTab: (state, action) => {
      const tabId = action.payload;
      if (!state.openTabs.includes(tabId)) {
        state.openTabs.push(tabId);
      }
      state.activeMainTab = tabId;
    },
    setTabDirty: (state, action) => {
      const { tabId, isDirty } = action.payload;
      if (isDirty) {
        if (!state.dirtyTabs.includes(tabId)) {
          state.dirtyTabs.push(tabId);
        }
      } else {
        state.dirtyTabs = state.dirtyTabs.filter(id => id !== tabId);
      }
    },
    closeTab: (state, action) => {
      const tabId = action.payload;
      state.openTabs = state.openTabs.filter(tab => tab !== tabId);
      state.dirtyTabs = state.dirtyTabs.filter(id => id !== tabId);
      
      // If we closed the active tab, switch to another one
      if (state.activeMainTab === tabId) {
        if (state.openTabs.length > 0) {
          state.activeMainTab = state.openTabs[state.openTabs.length - 1];
        } else {
          state.activeMainTab = null;
        }
      }
    },
    closeHostTabs: (state, action) => {
      const hostUid = action.payload;
      const tabsToClose = state.openTabs.filter(tab => 
        tab.includes(hostUid) || 
        // Fallback for database tabs which might not have UID in identifier yet 
        // (shared model - assumes they belong to the disconnected host if it was active)
        (tab.startsWith('db:') && state.activeMainTab?.includes(hostUid))
      );
      state.openTabs = state.openTabs.filter(tab => !tabsToClose.includes(tab));
      state.dirtyTabs = state.dirtyTabs.filter(id => !tabsToClose.includes(id));
      
      if (!state.openTabs.includes(state.activeMainTab)) {
        if (state.openTabs.length > 0) {
          state.activeMainTab = state.openTabs[state.openTabs.length - 1];
        } else {
          state.activeMainTab = null;
        }
      }
    },
    closeOtherTabs: (state, action) => {
      const keepTabId = action.payload;
      state.openTabs = state.openTabs.filter(tab => tab === keepTabId);
      state.dirtyTabs = state.dirtyTabs.filter(id => id === keepTabId);
      state.activeMainTab = keepTabId;
    },
    closeAllTabs: (state) => {
      state.openTabs = [];
      state.dirtyTabs = [];
      state.activeMainTab = null;
    },
    showStatusModal: (state, action) => {
      state.statusModal = {
        isOpen: true,
        type: action.payload.type || 'success',
        title: action.payload.title || '',
        message: action.payload.message || '',
        guidance: action.payload.guidance || null,
        detail: action.payload.detail || null,
        tables: action.payload.tables || null,
      };
    },
    closeStatusModal: (state) => {
      state.statusModal.isOpen = false;
    },
    triggerRefreshActiveTab: (state, action) => {
      state.refreshCounter += 1;
      state.refreshTabId = action.payload || state.activeMainTab;
    },
    dismissDefaultCmsPassword: (state, action) => {
      state.defaultCmsPasswordHosts = action.payload
        ? state.defaultCmsPasswordHosts.filter((uid) => uid !== action.payload)
        : [];
    },
  },
  extraReducers: (builder) => {
    // Matched by type so this slice does not import hostSlice.
    builder.addMatcher(
      (action) => action.type === 'host/loginToHost/fulfilled' && action.payload?.usesDefaultPassword,
      (state, action) => {
        const { hostUid } = action.payload;
        if (state.defaultCmsPasswordNoticed.includes(hostUid)) return;
        state.defaultCmsPasswordNoticed.push(hostUid);
        state.defaultCmsPasswordHosts.push(hostUid);
      }
    );
  },
});

export const {
  toggleTheme,
  setTheme,
  toggleSidebar,
  setSidebarCollapsed,
  setIsResizing,
  setActiveMainTab,
  setTabDirty,
  openTab,
  closeTab,
  closeOtherTabs,
  closeAllTabs,
  closeHostTabs,
  showStatusModal,
  closeStatusModal,
  triggerRefreshActiveTab,
  dismissDefaultCmsPassword,
} = layoutSlice.actions;

export default layoutSlice.reducer;
