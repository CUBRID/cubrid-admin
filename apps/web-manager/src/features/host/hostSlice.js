import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { hostApi } from './hostApi';
import { databaseApi } from '../database/databaseApi';
import { fetchDatabaseStartInfo } from '../database/databaseSlice';
import { fetchBrokerList } from '../broker/brokerSlice';
import { flattenHostsFromGroups, findGroupIdForHost } from './hostGroupUtils';
import {
  findHaPeersNeedingMerge,
  findRegisteredHaPeersInSameGroup,
  findUndiscoveredHaPeers,
  isHaPostLoginModalOpen,
} from './haPeerUtils';

export { isHaPostLoginModalOpen, clearHaClusterLinkSessionNotices } from './haPeerUtils';

function purgeHostClientState(state, hostUid) {
  state.authorizedHosts = state.authorizedHosts.filter((uid) => uid !== hostUid);
  delete state.haInfo[hostUid];
  delete state.hostEnvs[hostUid];
  delete state.hostAuthErrors[hostUid];
}

function syncHaInfoStorage(state) {
  try {
    localStorage.setItem('cubrid_ha_info', JSON.stringify(state.haInfo));
  } catch {
    // Storage may be blocked
  }
}

function applyHostGroupsResponse(state, hostGroups) {
  state.hostGroups = hostGroups || {};
  state.hosts = flattenHostsFromGroups(state.hostGroups);
  const validUids = new Set(state.hosts.map((h) => h.uid));
  state.authorizedHosts = state.authorizedHosts.filter((uid) => validUids.has(uid));
  for (const uid of Object.keys(state.haInfo)) {
    if (!validUids.has(uid)) delete state.haInfo[uid];
  }
  for (const uid of Object.keys(state.hostEnvs)) {
    if (!validUids.has(uid)) delete state.hostEnvs[uid];
  }
  for (const uid of Object.keys(state.hostAuthErrors)) {
    if (!validUids.has(uid)) delete state.hostAuthErrors[uid];
  }
  syncHaInfoStorage(state);
}

/** Keep selected host/group in sync after host_groups map changes (move, delete, etc.). */
function syncHostSelection(state) {
  if (state.selectedHostUid) {
    const groupId = findGroupIdForHost(state.hostGroups, state.selectedHostUid);
    if (groupId) {
      state.selectedGroupUid = groupId;
    } else {
      state.selectedHostUid = null;
    }
  }

  if (state.selectedGroupUid && !state.hostGroups[state.selectedGroupUid]) {
    state.selectedGroupUid = null;
  }
}

// Async thunk to fetch hosts from API
export const fetchHosts = createAsyncThunk(
  'host/fetchHosts',
  async (_, { rejectWithValue }) => {
    try {
      const response = await hostApi.getHosts();
      return response.host_groups || {};
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch hosts');
    }
  }
);

// Async thunk to add a new host
export const addHost = createAsyncThunk(
  'host/addHost',
  async (payload, { rejectWithValue }) => {
    try {
      const response = await hostApi.addHost(payload);
      return response.host_groups || {};
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || 'Failed to add host');
    }
  }
);

// Async thunk to delete a host
export const deleteHost = createAsyncThunk(
  'host/deleteHost',
  async (hostUid, { rejectWithValue }) => {
    try {
      const response = await hostApi.deleteHost(hostUid);
      return { hostUid, hostGroups: response.host_groups || {} };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || 'Failed to delete host');
    }
  }
);

// Async thunk to edit a host
export const editHost = createAsyncThunk(
  'host/editHost',
  async ({ hostUid, payload }, { rejectWithValue }) => {
    try {
      const response = await hostApi.editHost(hostUid, payload);
      return response.host_groups || {};
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || 'Failed to edit host');
    }
  }
);

export const moveHost = createAsyncThunk(
  'host/moveHost',
  async ({ hostUid, targetGroupId }, { rejectWithValue }) => {
    try {
      const response = await hostApi.moveHost(hostUid, targetGroupId);
      return response.host_groups || {};
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || 'Failed to move host');
    }
  }
);

export const mergeHaPeers = createAsyncThunk(
  'host/mergeHaPeers',
  async ({ targetGroupId, peers }, { dispatch, rejectWithValue }) => {
    try {
      for (const peer of peers) {
        await dispatch(moveHost({ hostUid: peer.hostUid, targetGroupId })).unwrap();
      }
      return { mergedCount: peers.length, targetGroupId };
    } catch (err) {
      return rejectWithValue(typeof err === 'string' ? err : err?.message || 'Failed to merge HA peers');
    }
  }
);

export const markGroupHa = createAsyncThunk(
  'host/markGroupHa',
  async ({ hostUid, groupName }, { rejectWithValue }) => {
    try {
      const response = await hostApi.markGroupHa(hostUid, groupName);
      return response.host_groups || {};
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to mark HA group');
    }
  }
);

export const createHostGroup = createAsyncThunk(
  'host/createHostGroup',
  async ({ name }, { rejectWithValue }) => {
    try {
      const response = await hostApi.createGroup({ name });
      return response.host_groups || {};
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || 'Failed to create group');
    }
  }
);

export const updateHostGroup = createAsyncThunk(
  'host/updateHostGroup',
  async ({ groupId, payload }, { rejectWithValue }) => {
    try {
      const response = await hostApi.updateGroup(groupId, payload);
      return response.host_groups || {};
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || 'Failed to update group');
    }
  }
);

export const deleteHostGroup = createAsyncThunk(
  'host/deleteHostGroup',
  async (groupId, { rejectWithValue, getState }) => {
    try {
      const group = getState().host.hostGroups[groupId];
      const removedHostUids = Object.keys(group?.hosts || {});
      const response = await hostApi.deleteGroup(groupId);
      return { groupId, hostGroups: response.host_groups || {}, removedHostUids };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || 'Failed to delete group');
    }
  }
);

export const setHostPassword = createAsyncThunk(
  'host/setHostPassword',
  async ({ hostUid, payload }, { rejectWithValue }) => {
    try {
      await hostApi.setHostPassword(hostUid, payload);
      return hostUid;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || 'Failed to set password');
    }
  }
);

const formatServiceFailures = (actionLabel, failures) => (
  `Failed to ${actionLabel} for: ${failures.map(({ name, error }) => `${name} (${error})`).join(', ')}`
);

// Async thunk to start CUBRID service (Brokers + Auto-start Databases,
// including a bulk ha_start for every HA-configured database) — the backend
// does brokers → cubridconf-driven database start in one call.
export const startService = createAsyncThunk(
  'host/startService',
  async (hostUid, { dispatch, rejectWithValue }) => {
    try {
      dispatch(hostSlice.actions.setServiceProgressMessage('Starting service...'));
      const { failed } = await databaseApi.startWholeService(hostUid);

      dispatch(hostSlice.actions.setServiceProgressMessage('Refreshing status...'));
      dispatch(fetchDatabaseStartInfo(hostUid));
      dispatch(fetchBrokerList(hostUid));
      dispatch(refreshHaInfo(hostUid));
      if (failed.length > 0) {
        return rejectWithValue(formatServiceFailures('start service', failed));
      }
      return true;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to start service');
    }
  }
);

// Async thunk to stop CUBRID service (All Databases, including a bulk
// ha_stop for every HA-configured database, then All Brokers) — the backend
// does database stop → brokers in one call.
export const stopService = createAsyncThunk(
  'host/stopService',
  async (hostUid, { dispatch, rejectWithValue }) => {
    try {
      dispatch(hostSlice.actions.setServiceProgressMessage('Stopping service...'));
      const { failed } = await databaseApi.stopWholeService(hostUid);

      dispatch(hostSlice.actions.setServiceProgressMessage('Refreshing status...'));
      dispatch(fetchDatabaseStartInfo(hostUid));
      dispatch(fetchBrokerList(hostUid));
      dispatch(refreshHaInfo(hostUid));
      if (failed.length > 0) {
        return rejectWithValue(formatServiceFailures('stop service', failed));
      }
      return true;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to stop service');
    }
  }
);

// Async thunk to explicitly login/forward to a specific host
export const loginToHost = createAsyncThunk(
  'host/loginToHost',
  async (hostUid, { rejectWithValue }) => {
    try {
      const response = await hostApi.loginToHost(hostUid);
      // The API returns { success: true, isHA: boolean, ... }
      if (
        response === false ||
        response?.data === false ||
        (response && typeof response === 'object' && response.success === false)
      ) {
        return rejectWithValue('Host login failed (bad credentials or unavailable)');
      }
      return { hostUid, ...response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || `Failed to login to host ${hostUid}`);
    }
  }
);

// Async thunk to re-derive a host's HA badge (role/peers) without a full
// relogin — used after anything that can change HA role server-side
// (Service Start/Stop's ha_start/ha_stop) and by the manual server-list
// refresh, since haInfo is otherwise only ever populated at login time.
export const refreshHaInfo = createAsyncThunk(
  'host/refreshHaInfo',
  async (hostUid, { rejectWithValue }) => {
    try {
      const response = await hostApi.getHaInfo(hostUid);
      return { hostUid, ...response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to refresh HA info for ${hostUid}`);
    }
  }
);

// Async thunk for a manual "refresh" of the whole server list: re-fetches
// the host/group tree, then re-derives HA info for every logged-in host.
export const refreshServerList = createAsyncThunk(
  'host/refreshServerList',
  async (_, { dispatch, getState }) => {
    await dispatch(fetchHosts());
    const { authorizedHosts } = getState().host;
    await Promise.all(authorizedHosts.map((hostUid) => dispatch(refreshHaInfo(hostUid))));
    return true;
  }
);

// Async thunk to fetch host environment (which contains the version)
export const fetchHostEnv = createAsyncThunk(
  'host/fetchHostEnv',
  async (hostUid, { rejectWithValue }) => {
    try {
      const response = await hostApi.getHostEnv(hostUid);
      return { hostUid, env: response };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || `Failed to fetch environment for ${hostUid}`);
    }
  }
);

export const fetchCmsUsers = createAsyncThunk(
  'host/fetchCmsUsers',
  async (hostUid, { rejectWithValue }) => {
    try {
      const response = await hostApi.getCmsUsers(hostUid);
      // Flatten the nested [ { user: [...] } ] structure from CMS
      const userlist = (response.userlist || []).flatMap(item => item.user || item);
      return { hostUid, userlist };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch CMS users');
    }
  }
);

export const addCmsUser = createAsyncThunk(
  'host/addCmsUser',
  async ({ hostUid, payload }, { rejectWithValue }) => {
    try {
      const response = await hostApi.addCmsUser(hostUid, payload);
      const userlist = (response.userlist || []).flatMap(item => item.user || item);
      return { hostUid, userlist };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to add CMS user');
    }
  }
);

export const updateCmsUser = createAsyncThunk(
  'host/updateCmsUser',
  async ({ hostUid, payload }, { rejectWithValue }) => {
    try {
      const response = await hostApi.updateCmsUser(hostUid, payload);
      const userlist = (response.userlist || []).flatMap(item => item.user || item);
      return { hostUid, userlist };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to update CMS user');
    }
  }
);

export const deleteCmsUser = createAsyncThunk(
  'host/deleteCmsUser',
  async ({ hostUid, targetid }, { rejectWithValue }) => {
    try {
      const response = await hostApi.deleteCmsUser(hostUid, targetid);
      const userlist = (response.userlist || []).flatMap(item => item.user || item);
      return { hostUid, userlist };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to delete CMS user');
    }
  }
);

const initialState = {
  isAddHostModalOpen: false,
  isDeleteHostModalOpen: false,
  isEditHostModalOpen: false,
  isCreateGroupModalOpen: false,
  isRenameGroupModalOpen: false,
  isDeleteGroupModalOpen: false,
  isManageGroupMembersModalOpen: false,
  groupToEditId: null,
  groupToEditName: null,
  hostToDeleteUid: null,
  hostToDeleteAlias: null,
  hostToEditUid: null,
  isServerVersionModalOpen: false,
  serverVersionHostUid: null,
  hosts: [],
  hostGroups: {},
  authorizedHosts: [], // Array of hostUids that have active forwarded sessions
  hostEnvs: {}, // Cache of environment info (version, paths, etc) indexed by hostUid
  haInfo: JSON.parse(localStorage.getItem('cubrid_ha_info') || '{}'), // Cache of HA info (isHA, currentNodeType, haNodes) indexed by hostUid
  suggestedHaNodes: [],
  suggestedHaGroupId: null,
  suggestedHaAnchorHostUid: null, // Host whose HA login surfaced these peers — moved into a new group if the user opts in
  isDiscoveryModalOpen: false, // Visibility of the discovery modal
  pendingHaMerge: null,
  isHaMergeModalOpen: false,
  haClusterLinkNotice: null,
  isHaClusterLinkModalOpen: false,
  hostsAwaitingHaLogin: [], // Host UIDs pending first HA post-login side effects (import/add batch)
  initialHostData: null, // Data to pre-fill AddHostModal
  selectedHostUid: null,
  selectedGroupUid: null,
  loading: false,
  isLoggingIntoHost: false,
  isServiceOperating: false,
  serviceOperationType: null, // 'start' or 'stop'
  serviceProgressMessage: '',
  hostAuthErrors: {}, // { [hostUid]: errorMessage }
  isImportExportModalOpen: false,
  importExportMode: 'export', // 'import' or 'export'
  skipAutoHostLogin: false, // import batch: do not auto CMS-login on selectedHostUid change
  isBatchHostLogin: false,
  isChangePasswordModalOpen: false,
  changePasswordHostUid: null,
  cmsUsers: {}, // { [hostUid]: [] }
  cmsUsersLoading: {}, // { [hostUid]: boolean }
  isCmsUserManagementModalOpen: false,
  isEditCmsUserModalOpen: false,
  cmsUserToEdit: null, // { hostUid, user }
  error: null,
  reconnectQueue: [],
};

const hostSlice = createSlice({
  name: 'host',
  initialState,
  reducers: {
    openAddHostModal: (state, action) => {
      state.isAddHostModalOpen = true;
      state.initialHostData = action.payload || null;
    },
    closeAddHostModal: (state) => {
      state.isAddHostModalOpen = false;
      state.initialHostData = null;
    },
    setSelectedHost: (state, action) => {
      state.selectedHostUid = action.payload;
      const gid = findGroupIdForHost(state.hostGroups, action.payload);
      if (gid) state.selectedGroupUid = gid;
    },
    setSelectedGroup: (state, action) => {
      const { groupId, hostUid } = action.payload;
      state.selectedGroupUid = groupId;
      if (hostUid) {
        state.selectedHostUid = hostUid;
      } else {
        state.selectedHostUid = null;
      }
    },
    setServiceProgressMessage: (state, action) => {
      state.serviceProgressMessage = action.payload;
    },
    revokeHostLogin: (state, action) => {
      const hostUid = action.payload;
      state.authorizedHosts = state.authorizedHosts.filter(uid => uid !== hostUid);
      // Reset specific host data
      if (state.hostEnvs[hostUid]) delete state.hostEnvs[hostUid];
      if (state.hostAuthErrors[hostUid]) delete state.hostAuthErrors[hostUid];
      // Reset general error if it was likely related to this host
      state.error = null;
    },
    openDeleteHostModal: (state, action) => {
      state.isDeleteHostModalOpen = true;
      state.hostToDeleteUid = action.payload.hostUid;
      state.hostToDeleteAlias = action.payload.alias;
    },
    closeDeleteHostModal: (state) => {
      state.isDeleteHostModalOpen = false;
      state.hostToDeleteUid = null;
      state.hostToDeleteAlias = null;
    },
    openEditHostModal: (state, action) => {
      state.isEditHostModalOpen = true;
      state.hostToEditUid = action.payload; // Just need the hostUid, we can look up the rest
    },
    closeEditHostModal: (state) => {
      state.isEditHostModalOpen = false;
      state.hostToEditUid = null;
    },
    openCreateGroupModal: (state) => {
      state.isCreateGroupModalOpen = true;
      state.groupToEditId = null;
      state.groupToEditName = null;
    },
    closeCreateGroupModal: (state) => {
      state.isCreateGroupModalOpen = false;
    },
    openRenameGroupModal: (state, action) => {
      state.isRenameGroupModalOpen = true;
      state.groupToEditId = action.payload.groupId;
      state.groupToEditName = action.payload.name;
    },
    closeRenameGroupModal: (state) => {
      state.isRenameGroupModalOpen = false;
      state.groupToEditId = null;
      state.groupToEditName = null;
    },
    openDeleteGroupModal: (state, action) => {
      state.isDeleteGroupModalOpen = true;
      state.groupToEditId = action.payload.groupId;
      state.groupToEditName = action.payload.name;
    },
    closeDeleteGroupModal: (state) => {
      state.isDeleteGroupModalOpen = false;
      state.groupToEditId = null;
      state.groupToEditName = null;
    },
    openManageGroupMembersModal: (state, action) => {
      state.isManageGroupMembersModalOpen = true;
      state.groupToEditId = action.payload.groupId;
      state.groupToEditName = action.payload.name;
    },
    closeManageGroupMembersModal: (state) => {
      state.isManageGroupMembersModalOpen = false;
      state.groupToEditId = null;
      state.groupToEditName = null;
    },
    openServerVersionModal: (state, action) => {
      state.isServerVersionModalOpen = true;
      state.serverVersionHostUid = action.payload;
    },
    setSuggestedHaNodes: (state, action) => {
      const payload = Array.isArray(action.payload)
        ? { nodes: action.payload, groupId: null, anchorHostUid: null }
        : action.payload;
      state.suggestedHaNodes = payload.nodes || [];
      state.suggestedHaGroupId = payload.groupId ?? null;
      state.suggestedHaAnchorHostUid = payload.anchorHostUid ?? null;
      state.isDiscoveryModalOpen = (payload.nodes || []).length > 0;
    },
    setSuggestedHaGroupId: (state, action) => {
      state.suggestedHaGroupId = action.payload ?? null;
    },
    clearSuggestedHaNodes: (state) => {
      state.suggestedHaNodes = [];
      state.suggestedHaGroupId = null;
      state.suggestedHaAnchorHostUid = null;
      state.isDiscoveryModalOpen = false;
    },
    openDiscoveryModal: (state) => {
      state.isDiscoveryModalOpen = true;
    },
    closeDiscoveryModal: (state) => {
      state.isDiscoveryModalOpen = false;
    },
    setPendingHaMerge: (state, action) => {
      state.pendingHaMerge = action.payload;
      state.isHaMergeModalOpen = !!action.payload?.peers?.length;
    },
    clearPendingHaMerge: (state) => {
      state.pendingHaMerge = null;
      state.isHaMergeModalOpen = false;
    },
    setHaClusterLinkNotice: (state, action) => {
      state.haClusterLinkNotice = action.payload;
      state.isHaClusterLinkModalOpen = !!action.payload?.peers?.length;
    },
    clearHaClusterLinkNotice: (state) => {
      state.haClusterLinkNotice = null;
      state.isHaClusterLinkModalOpen = false;
    },
    queueHostAwaitingHaLogin: (state, action) => {
      const uid = action.payload;
      if (uid && !state.hostsAwaitingHaLogin.includes(uid)) {
        state.hostsAwaitingHaLogin.push(uid);
      }
    },
    removeHostAwaitingHaLogin: (state, action) => {
      const uid = action.payload;
      state.hostsAwaitingHaLogin = state.hostsAwaitingHaLogin.filter((id) => id !== uid);
    },
    closeServerVersionModal: (state) => {
      state.isServerVersionModalOpen = false;
      state.serverVersionHostUid = null;
    },
    openImportExportModal: (state, action) => {
      state.isImportExportModalOpen = true;
      state.importExportMode = action.payload; // 'import' or 'export'
    },
    closeImportExportModal: (state) => {
      state.isImportExportModalOpen = false;
      state.skipAutoHostLogin = false;
    },
    setSkipAutoHostLogin: (state, action) => {
      state.skipAutoHostLogin = Boolean(action.payload);
    },
    openChangePasswordModal: (state, action) => {
      state.isChangePasswordModalOpen = true;
      state.changePasswordHostUid = action.payload;
    },
    closeChangePasswordModal: (state) => {
      state.isChangePasswordModalOpen = false;
      state.changePasswordHostUid = null;
    },
    clearHostError: (state) => {
      state.error = null;
    },
    openCmsUserManagementModal: (state) => {
      state.isCmsUserManagementModalOpen = true;
    },
    closeCmsUserManagementModal: (state) => {
      state.isCmsUserManagementModalOpen = false;
    },
    openEditCmsUserModal: (state, action) => {
      state.isEditCmsUserModalOpen = true;
      state.cmsUserToEdit = action.payload; // { hostUid, user } (user is null for add)
    },
    closeEditCmsUserModal: (state) => {
      state.isEditCmsUserModalOpen = false;
      state.cmsUserToEdit = null;
    },
    openReconnectModal: (state, action) => {
      const hostUid = action.payload;
      if (hostUid && !state.reconnectQueue.includes(hostUid)) {
        state.reconnectQueue.push(hostUid);
      }
    },
    closeReconnectModal: (state) => {
      state.reconnectQueue.shift();
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchHosts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchHosts.fulfilled, (state, action) => {
        state.loading = false;
        applyHostGroupsResponse(state, action.payload);
      })
      .addCase(fetchHosts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(addHost.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(addHost.fulfilled, (state, action) => {
        state.loading = false;
        const prevUids = new Set(state.hosts.map((h) => h.uid));
        applyHostGroupsResponse(state, action.payload);
        const newHost = state.hosts.find((h) => !prevUids.has(h.uid));
        if (newHost) {
          if (!state.hostsAwaitingHaLogin.includes(newHost.uid)) {
            state.hostsAwaitingHaLogin.push(newHost.uid);
          }
          if (!state.skipAutoHostLogin) {
            state.selectedHostUid = newHost.uid;
            state.selectedGroupUid = findGroupIdForHost(state.hostGroups, newHost.uid);
          }
        }
        state.isAddHostModalOpen = false;
      })
      .addCase(addHost.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload; // AddHostModal can also show this
      })
      .addCase(loginToHost.pending, (state, action) => {
        if (!state.isBatchHostLogin) {
          state.isLoggingIntoHost = true;
          state.loading = true;
        }
        // Clean up previous error for this host if any
        if (state.hostAuthErrors[action.meta.arg]) {
          delete state.hostAuthErrors[action.meta.arg];
        }
      })
      .addCase(loginToHost.fulfilled, (state, action) => {
        if (!state.isBatchHostLogin) {
          state.isLoggingIntoHost = false;
          state.loading = false;
        }
        const { hostUid, ...haInfo } = action.payload;
        if (!state.authorizedHosts.includes(hostUid)) {
          state.authorizedHosts.push(hostUid);
        }
        state.reconnectQueue = state.reconnectQueue.filter((uid) => uid !== hostUid);
        state.haInfo[hostUid] = haInfo;
        localStorage.setItem('cubrid_ha_info', JSON.stringify(state.haInfo));

        // If this is the host's first-ever login, queue HA discovery side effects.
        // initialLogin is true in the Redux hosts state (set when host was added) until
        // this point — the server already cleared it during CMS auth, but the Redux
        // state hasn't been re-fetched yet, so we can still read the original value.
        const host = state.hosts.find((h) => h.uid === hostUid);
        if (host?.initialLogin === true) {
          if (!state.hostsAwaitingHaLogin.includes(hostUid)) {
            state.hostsAwaitingHaLogin.push(hostUid);
          }
          host.initialLogin = false;
        }
      })
      .addCase(loginToHost.rejected, (state, action) => {
        if (!state.isBatchHostLogin) {
          state.isLoggingIntoHost = false;
          state.loading = false;
        }
        state.hostAuthErrors[action.meta.arg] = action.payload;
        if (!state.isBatchHostLogin) {
          state.error = action.payload;
        }
      })
      // Silent background refresh — no loading/error state, so a failure
      // (e.g. a host that went offline) doesn't surface an error banner.
      .addCase(refreshHaInfo.fulfilled, (state, action) => {
        const { hostUid, ...haInfo } = action.payload;
        state.haInfo[hostUid] = haInfo;
        syncHaInfoStorage(state);
      })
      .addCase(deleteHost.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteHost.fulfilled, (state, action) => {
        state.loading = false;
        const { hostUid, hostGroups } = action.payload;
        applyHostGroupsResponse(state, hostGroups);
        purgeHostClientState(state, hostUid);
        syncHostSelection(state);
        syncHaInfoStorage(state);
        state.isDeleteHostModalOpen = false;
        state.hostToDeleteUid = null;
      })
      .addCase(deleteHost.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(editHost.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(editHost.fulfilled, (state, action) => {
        state.loading = false;
        applyHostGroupsResponse(state, action.payload);
      })
      .addCase(editHost.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(moveHost.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(moveHost.fulfilled, (state, action) => {
        state.loading = false;
        applyHostGroupsResponse(state, action.payload);
        syncHostSelection(state);
      })
      .addCase(moveHost.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(mergeHaPeers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(mergeHaPeers.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(mergeHaPeers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(setHostPassword.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(setHostPassword.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(setHostPassword.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(startService.pending, (state) => {
        state.isServiceOperating = true;
        state.serviceOperationType = 'start';
        state.error = null;
      })
      .addCase(startService.fulfilled, (state) => {
        state.isServiceOperating = false;
        state.serviceOperationType = null;
      })
      .addCase(startService.rejected, (state, action) => {
        state.isServiceOperating = false;
        state.serviceOperationType = null;
        state.error = action.payload;
      })
      .addCase(stopService.pending, (state) => {
        state.isServiceOperating = true;
        state.serviceOperationType = 'stop';
        state.error = null;
      })
      .addCase(stopService.fulfilled, (state) => {
        state.isServiceOperating = false;
        state.serviceOperationType = null;
      })
      .addCase(stopService.rejected, (state, action) => {
        state.isServiceOperating = false;
        state.serviceOperationType = null;
        state.error = action.payload;
      })
      .addCase(markGroupHa.fulfilled, (state, action) => {
        applyHostGroupsResponse(state, action.payload);
      })
      .addCase(createHostGroup.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createHostGroup.fulfilled, (state, action) => {
        state.loading = false;
        applyHostGroupsResponse(state, action.payload);
        state.isCreateGroupModalOpen = false;
      })
      .addCase(createHostGroup.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(updateHostGroup.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateHostGroup.fulfilled, (state, action) => {
        state.loading = false;
        applyHostGroupsResponse(state, action.payload);
        state.isRenameGroupModalOpen = false;
        state.groupToEditId = null;
        state.groupToEditName = null;
      })
      .addCase(updateHostGroup.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(deleteHostGroup.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteHostGroup.fulfilled, (state, action) => {
        state.loading = false;
        const { groupId, hostGroups, removedHostUids = [] } = action.payload;
        applyHostGroupsResponse(state, hostGroups);
        const removedSet = new Set(removedHostUids);
        if (removedSet.has(state.selectedHostUid)) {
          state.selectedHostUid = null;
        }
        syncHostSelection(state);
        removedHostUids.forEach((uid) => purgeHostClientState(state, uid));
        syncHaInfoStorage(state);
        state.isDeleteGroupModalOpen = false;
        state.groupToEditId = null;
        state.groupToEditName = null;
      })
      .addCase(deleteHostGroup.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchHostEnv.fulfilled, (state, action) => {
        const { hostUid, env } = action.payload;
        state.hostEnvs[hostUid] = env;
      })
      // CMS Users fetching
      .addCase(fetchCmsUsers.pending, (state, action) => {
        state.cmsUsersLoading[action.meta.arg] = true;
      })
      .addCase(fetchCmsUsers.fulfilled, (state, action) => {
        const { hostUid, userlist } = action.payload;
        state.cmsUsersLoading[hostUid] = false;
        state.cmsUsers[hostUid] = userlist;
      })
      .addCase(fetchCmsUsers.rejected, (state, action) => {
        state.cmsUsersLoading[action.meta.arg] = false;
        state.error = action.payload;
      })
      .addMatcher(
        (action) => action.type === 'host/loginHostsBatch/pending',
        (state) => {
          state.isBatchHostLogin = true;
          state.isLoggingIntoHost = true;
          state.loading = true;
        }
      )
      .addMatcher(
        (action) =>
          action.type === 'host/loginHostsBatch/fulfilled'
          || action.type === 'host/loginHostsBatch/rejected',
        (state) => {
          state.isBatchHostLogin = false;
          state.isLoggingIntoHost = false;
          state.loading = false;
        }
      )
      // CMS Users CRUD operations (all return the updated userlist)
      .addMatcher(
        (action) =>
          [addCmsUser.fulfilled, updateCmsUser.fulfilled, deleteCmsUser.fulfilled].some(
            (type) => action.type === type
          ),
        (state, action) => {
          const { hostUid, userlist } = action.payload;
          state.cmsUsers[hostUid] = userlist;
          state.loading = false;
        }
      )
      .addMatcher(
        (action) =>
          [addCmsUser.pending, updateCmsUser.pending, deleteCmsUser.pending].some(
            (type) => action.type === type
          ),
        (state) => {
          state.loading = true;
          state.error = null;
        }
      )
      .addMatcher(
        (action) =>
          [addCmsUser.rejected, updateCmsUser.rejected, deleteCmsUser.rejected].some(
            (type) => action.type === type
          ),
        (state, action) => {
          state.loading = false;
          state.error = action.payload;
        }
      );
  },
});

export const {
  openAddHostModal,
  closeAddHostModal,
  setSelectedHost,
  setSelectedGroup,
  revokeHostLogin,
  openDeleteHostModal,
  closeDeleteHostModal,
  openEditHostModal,
  closeEditHostModal,
  openCreateGroupModal,
  closeCreateGroupModal,
  openRenameGroupModal,
  closeRenameGroupModal,
  openDeleteGroupModal,
  closeDeleteGroupModal,
  openManageGroupMembersModal,
  closeManageGroupMembersModal,
  openServerVersionModal,
  closeServerVersionModal,
  setSuggestedHaNodes,
  setSuggestedHaGroupId,
  clearSuggestedHaNodes,
  setPendingHaMerge,
  clearPendingHaMerge,
  setHaClusterLinkNotice,
  clearHaClusterLinkNotice,
  queueHostAwaitingHaLogin,
  removeHostAwaitingHaLogin,
  openDiscoveryModal,
  closeDiscoveryModal,
  openImportExportModal,
  closeImportExportModal,
  setSkipAutoHostLogin,
  openChangePasswordModal,
  closeChangePasswordModal,
  clearHostError,
  openCmsUserManagementModal,
  closeCmsUserManagementModal,
  openEditCmsUserModal,
  closeEditCmsUserModal,
  openReconnectModal,
  closeReconnectModal,
} = hostSlice.actions;

/** HA merge / discovery / alias updates after loginToHost stores haInfo. */
export const processHaLoginSideEffects = createAsyncThunk(
  'host/processHaLoginSideEffects',
  async (hostUid, { dispatch, getState }) => {
    const state = getState().host;
    const response = state.haInfo[hostUid];
    if (!response) return { hostUid };

    const hosts = state.hosts;
    const awaitingFirstHaLogin = state.hostsAwaitingHaLogin.includes(hostUid);
    const isHa = response.isHA === true || String(response.isHA).toLowerCase() === 'true';
    let showedHaModal = false;

    if (isHa) {
      await dispatch(markGroupHa({ hostUid })).unwrap().catch(() => {});
    }

    if (isHa && response.haNodes?.length > 0) {
      const hostGroups = getState().host.hostGroups;
      const undiscovered = findUndiscoveredHaPeers(hosts, response.haNodes);

      if (undiscovered.length > 0) {
        const hostState = getState().host;
        const staleDiscoveryOpen =
          hostState.isDiscoveryModalOpen
          && findUndiscoveredHaPeers(hosts, hostState.suggestedHaNodes).length === 0;
        if (staleDiscoveryOpen) {
          dispatch(hostSlice.actions.clearSuggestedHaNodes());
        }
        if (awaitingFirstHaLogin && !getState().host.isDiscoveryModalOpen) {
          dispatch(hostSlice.actions.setSuggestedHaNodes({
            nodes: undiscovered,
            groupId: findGroupIdForHost(hostGroups, hostUid),
            anchorHostUid: hostUid,
          }));
          showedHaModal = true;
        }
      }

      if (!showedHaModal && !getState().host.isHaMergeModalOpen) {
        const mergePlan = findHaPeersNeedingMerge(hostGroups, response.haNodes, hostUid);
        if (mergePlan) {
          dispatch(hostSlice.actions.setPendingHaMerge(mergePlan));
          showedHaModal = true;
        }
      }

      if (!showedHaModal && !getState().host.isHaClusterLinkModalOpen) {
        const sameGroupPeers = findRegisteredHaPeersInSameGroup(hostGroups, response.haNodes, hostUid);
        const noticeKey = `ha_cluster_linked_${hostUid}`;
        let alreadyNoticed = false;
        try {
          alreadyNoticed = sessionStorage.getItem(noticeKey) === '1';
        } catch {
          // ignore
        }
        if (sameGroupPeers.length > 0 && !alreadyNoticed) {
          const targetGroupId = findGroupIdForHost(hostGroups, hostUid);
          dispatch(hostSlice.actions.setHaClusterLinkNotice({
            anchorHostUid: hostUid,
            targetGroupId,
            targetGroupName: hostGroups[targetGroupId]?.name || 'Group',
            peers: sameGroupPeers,
          }));
          try {
            sessionStorage.setItem(noticeKey, '1');
          } catch {
            // ignore
          }
        }
      }
    }

    if (awaitingFirstHaLogin) {
      dispatch(hostSlice.actions.removeHostAwaitingHaLogin(hostUid));
    }

    // Deliberately does NOT append "(master)" to the host's real, persisted
    // alias anymore. It used to, via editHost — but a user-typed alias can
    // itself contain "(master)"/"(slave)"/"(replica)" (e.g. "cglee1_(master)"),
    // and there is no way to tell that apart from this auto-appended tag once
    // it's baked into the same alias string. HA role display now comes
    // entirely from live `haInfo` (see inferHaNodeType) instead of mutating
    // stored data to carry that information.

    return { hostUid };
  }
);

/** Login + HA side effects — use instead of bare loginToHost for user-initiated logins. */
export const loginToHostWithSideEffects = createAsyncThunk(
  'host/loginToHostWithSideEffects',
  async (hostUid, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(loginToHost(hostUid)).unwrap();
      await dispatch(processHaLoginSideEffects(hostUid)).unwrap();
      return hostUid;
    } catch (err) {
      return rejectWithValue(err);
    }
  }
);

/** CMS-login for multiple hosts (sequential), then HA side effects per successful login. */
export const loginHostsBatch = createAsyncThunk(
  'host/loginHostsBatch',
  async (hostUids, { dispatch, getState }) => {
    const pending = (hostUids || []).filter(
      (uid) => uid && !getState().host.authorizedHosts.includes(uid)
    );
    const failed = [];
    const succeededUids = [];
    let successCount = 0;

    for (const uid of pending) {
      try {
        await dispatch(loginToHost(uid)).unwrap();
        succeededUids.push(uid);
        successCount += 1;
      } catch (err) {
        const host = getState().host.hosts.find((h) => h.uid === uid);
        const reason = typeof err === 'string' ? err : (err?.message || String(err));
        failed.push({ name: host?.alias || host?.id || uid, reason });
      }
    }

    for (const uid of succeededUids) {
      await dispatch(processHaLoginSideEffects(uid)).unwrap().catch(() => {});
    }

    return { successCount, failed, attempted: pending.length };
  }
);

import { registerLoginToHost } from '../../api/apiClient';

registerLoginToHost((hostUid) => {
  return import('../../app/store').then(({ store }) => {
    return store.dispatch(loginToHost(hostUid)).unwrap();
  });
});

export default hostSlice.reducer;
