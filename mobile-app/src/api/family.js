import apiClient from './client';

export const familyAPI = {
  // Get family settings
  getSettings: async () => {
    const response = await apiClient.get('/family/settings');
    return response.data;
  },

  // Update family settings (parents only)
  updateSettings: async (data) => {
    const response = await apiClient.put('/family/settings', data);
    return response.data;
  },

  // Regenerate invite code (parents only)
  regenerateInviteCode: async () => {
    const response = await apiClient.post('/family/regenerate-invite');
    return response.data;
  },

  // Get activity log (parents only)
  getActivityLog: async (before = null, limit = 30) => {
    const params = { limit };
    if (before) params.before = before;
    const response = await apiClient.get('/family/activity-log', { params });
    return response.data;
  },
};
