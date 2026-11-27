import apiClient from '../../api/apiClient';

// Web Manager account control (/admin/*, administrators only).
const userPath = (id) => `/admin/users/${encodeURIComponent(id)}`;

export const adminApi = {
  listAccounts: () => apiClient.get('/admin/users'),
  // Sign-ups awaiting approval -> { count }
  countPending: () => apiClient.get('/admin/users/pending-count'),
  approveAccount: (id, role = 'user') => apiClient.post(`${userPath(id)}/approve`, { role }),
  rejectAccount: (id) => apiClient.post(`${userPath(id)}/reject`),
  createAccount: (id, password, role = 'user') => apiClient.post('/admin/users', { id, password, role }),
  setStatus: (id, status) => apiClient.put(`${userPath(id)}/status`, { status }),
  setRole: (id, role) => apiClient.put(`${userPath(id)}/role`, { role }),
  resetPassword: (id, password) => apiClient.post(`${userPath(id)}/password`, { password }),
  signOutEverywhere: (id) => apiClient.post(`${userPath(id)}/sign-out`),
  deleteAccount: (id) => apiClient.delete(userPath(id)),
  getSettings: () => apiClient.get('/admin/settings'),
  setRegistrationEnabled: (registrationEnabled) => apiClient.put('/admin/settings', { registrationEnabled }),
  setRegistrationApproval: (registrationApproval) => apiClient.put('/admin/settings', { registrationApproval }),
  // { actor, target, action, from, to, limit, offset } -> { entries, total }
  queryAudit: (filter = {}) => {
    const params = Object.fromEntries(
      Object.entries(filter).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
    return apiClient.get('/admin/audit', { params });
  },
  // { from, to, user, category, result, target, limit, offset, tz } -> { entries, total, summary }
  queryApiLog: (filter = {}) => {
    const params = Object.fromEntries(
      Object.entries(filter).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
    return apiClient.get('/admin/api-log', { params });
  },
};
