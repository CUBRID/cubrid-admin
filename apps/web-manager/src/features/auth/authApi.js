import apiClient from '../../api/apiClient';

export const authApi = {
  register: (id, password) => {
    return apiClient.post('/auth/register', { id, password });
  },

  getRegistration: () => {
    return apiClient.get('/auth/registration');
  },

  login: (id, password) => {
    return apiClient.post('/auth/login', { id, password });
  },

  // The session's cookies go with it; the server clears them.
  logout: () => {
    return apiClient.post('/auth/logout');
  },

  getUserInfo: () => {
    return apiClient.get('/user');
  },

  // Only while an admin-required password change is pending.
  setInitialPassword: (newPassword) => {
    return apiClient.post('/user/initial-password', { newPassword });
  },

  // The session the cookies hold: { expiresIn, expiresLeft, user }.
  getSession: (config) => {
    return apiClient.get('/auth/session', config);
  },

  updatePassword: (oldPassword, newPassword) => {
    return apiClient.post('/user/credential', { oldPassword, newPassword });
  },

  updateUserAccount: (data) => {
    return apiClient.post('/user/account', data);
  },
};
