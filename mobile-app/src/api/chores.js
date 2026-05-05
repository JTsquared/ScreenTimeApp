import apiClient from './client';

export const choresAPI = {
  // Get all chores
  getChores: async () => {
    const response = await apiClient.get('/chores');
    return response.data;
  },

  // Create chore (parents only)
  createChore: async (data) => {
    const response = await apiClient.post('/chores', data);
    return response.data;
  },

  // Update chore (parents only)
  updateChore: async (id, data) => {
    const response = await apiClient.put(`/chores/${id}`, data);
    return response.data;
  },

  // Delete chore (parents only)
  deleteChore: async (id) => {
    const response = await apiClient.delete(`/chores/${id}`);
    return response.data;
  },

  // Mark chore as complete (children)
  completeChore: async (id, notes = '') => {
    const response = await apiClient.post(`/chores/${id}/complete`, { notes });
    return response.data;
  },

  // Get pending completions (parents)
  getPendingCompletions: async () => {
    const response = await apiClient.get('/chores/completions/pending');
    return response.data;
  },

  // Get my completions (children)
  getMyCompletions: async () => {
    const response = await apiClient.get('/chores/completions/my');
    return response.data;
  },

  // Approve completion (parents)
  approveCompletion: async (id) => {
    const response = await apiClient.post(`/chores/completions/${id}/approve`);
    return response.data;
  },

  // Quick approve from child's device using parent credentials
  quickApprove: async (id, parentLogin, parentPassword) => {
    const response = await apiClient.post(`/chores/completions/${id}/quick-approve`, {
      parentLogin,
      parentPassword,
    });
    return response.data;
  },

  // Reject completion (parents)
  rejectCompletion: async (id, notes = '') => {
    const response = await apiClient.post(`/chores/completions/${id}/reject`, { notes });
    return response.data;
  },

  // Get available screen time
  getAvailableScreenTime: async () => {
    const response = await apiClient.get('/chores/screen-time/available');
    return response.data;
  },
};
