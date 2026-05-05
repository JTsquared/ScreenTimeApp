import apiClient from './client';

export const authAPI = {
  // Register new user/family
  register: async (data) => {
    const response = await apiClient.post('/auth/register', data);
    return response.data;
  },

  // Login
  login: async (email, password) => {
    const response = await apiClient.post('/auth/login', { email, password });
    return response.data;
  },

  // Get current user
  getMe: async () => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },

  // Add family member (parents only)
  addFamilyMember: async (data) => {
    const response = await apiClient.post('/auth/add-member', data);
    return response.data;
  },
};
