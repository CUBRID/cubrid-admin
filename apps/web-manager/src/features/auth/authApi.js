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

  refresh: (refreshToken) => {
    return apiClient.post('/auth/refresh', { refreshToken });
  },

  logout: (refreshToken) => {
    return apiClient.post('/auth/logout', { refreshToken: refreshToken || undefined });
  },

  getUserInfo: () => {
    return apiClient.get('/user');
  },

  // Only while an admin-required password change is pending.
  setInitialPassword: (newPassword) => {
    return apiClient.post('/user/initial-password', { newPassword });
  },

  updatePassword: (oldPassword, newPassword) => {
    return apiClient.post('/user/credential', { oldPassword, newPassword });
  },

  updateUserAccount: (data) => {
    return apiClient.post('/user/account', data);
  },
};
