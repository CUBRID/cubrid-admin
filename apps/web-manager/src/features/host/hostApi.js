import apiClient from '../../api/apiClient';

export const hostApi = {
  getHosts: () => {
    return apiClient.get('/host');
  },
  createGroup: (payload) => {
    return apiClient.post('/host/group', payload);
  },
  updateGroup: (groupId, payload) => {
    return apiClient.put(`/host/group/${groupId}`, payload);
  },
  deleteGroup: (groupId) => {
    return apiClient.delete(`/host/group/${groupId}`);
  },
  addHost: (payload) => {
    return apiClient.post('/host', payload);
  },
  loginToHost: (hostUid) => {
    return apiClient.post(`/${hostUid}/cms-auth/login`);
  },
  // Logs in to CMS with these settings and out again; nothing is saved.
  testConnection: ({ address, port, id, password }) => {
    return apiClient.post('/cms-auth/test', { address, port, id, password });
  },
  // Logs in with changed settings; the server saves them only if it succeeds.
  connectHost: (hostUid, changes) => {
    return apiClient.post(`/${hostUid}/cms-auth/connect`, changes);
  },
  // Tells the server the user closed this host's session, so a reload
  // no longer restores it as connected.
  disconnectHost: (hostUid) => {
    return apiClient.post(`/${hostUid}/cms-auth/disconnect`);
  },
  getHaInfo: (hostUid) => {
    return apiClient.get(`/${hostUid}/cms-auth/ha-info`);
  },
  getHostEnv: (hostUid) => {
    return apiClient.get(`/${hostUid}/cms-config/env`);
  },
  deleteHost: (hostUid) => {
    return apiClient.delete(`/host/${hostUid}`);
  },
  editHost: (hostUid, payload) => {
    return apiClient.put(`/host/${hostUid}`, payload);
  },
  moveHost: (hostUid, targetGroupId) => {
    return apiClient.post(`/host/${hostUid}/move`, { targetGroupId });
  },
  getHostConfig: (hostUid, confname) => {
    return apiClient.get(`/${hostUid}/cms-config/all-sys-param?confname=${confname}`);
  },
  setHostConfig: (hostUid, payload) => {
    return apiClient.post(`/${hostUid}/cms-config/set-sys-param`, payload);
  },
  setHostPassword: (hostUid, payload) => {
    return apiClient.put(`/${hostUid}/cms-user/set-password`, payload);
  },
  getCmsUsers: (hostUid) => {
    return apiClient.get(`/${hostUid}/cms-user`);
  },
  addCmsUser: (hostUid, payload) => {
    return apiClient.post(`/${hostUid}/cms-user`, payload);
  },
  updateCmsUser: (hostUid, payload) => {
    return apiClient.put(`/${hostUid}/cms-user`, payload);
  },
  deleteCmsUser: (hostUid, targetid) => {
    return apiClient.delete(`/${hostUid}/cms-user/${targetid}`);
  },
  markGroupHa: (hostUid, groupName) => {
    return apiClient.post(`/host/${hostUid}/mark-ha`, groupName ? { groupName } : {});
  },
};
