import apiClient from './client';

export const scheduleAPI = {
  getRules: async () => {
    const response = await apiClient.get('/schedules');
    return response.data;
  },

  getActiveStatus: async () => {
    const response = await apiClient.get('/schedules/status');
    return response.data;
  },

  createRule: async (rule) => {
    const response = await apiClient.post('/schedules', rule);
    return response.data;
  },

  updateRule: async (id, updates) => {
    const response = await apiClient.put(`/schedules/${id}`, updates);
    return response.data;
  },

  deleteRule: async (id) => {
    const response = await apiClient.delete(`/schedules/${id}`);
    return response.data;
  },
};
