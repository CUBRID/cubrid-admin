import apiClient from '../../api/apiClient';

export const authApi = {
  register: (id, password) => {
    return apiClient.post('/auth/register', { id, password });
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

  updatePassword: (oldPassword, newPassword) => {
    return apiClient.post('/user/credential', { oldPassword, newPassword });
  },

  updateUserAccount: (data) => {
    return apiClient.post('/user/account', data);
  },
};
