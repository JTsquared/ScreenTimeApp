import apiClient from './client';

export const usersAPI = {
  // Get family members
  getFamilyMembers: async () => {
    const response = await apiClient.get('/users/family');
    return response.data;
  },

  // Change password
  changePassword: async (currentPassword, newPassword) => {
    const response = await apiClient.put('/users/change-password', { currentPassword, newPassword });
    return response.data;
  },

  // Reset family member's password (parents only)
  resetMemberPassword: async (id, newPassword) => {
    const response = await apiClient.put(`/users/${id}/reset-password`, { newPassword });
    return response.data;
  },

  // Update profile
  updateProfile: async (id, data) => {
    const response = await apiClient.put(`/users/${id}`, data);
    return response.data;
  },

  // Delete user (parents only)
  deleteUser: async (id) => {
    const response = await apiClient.delete(`/users/${id}`);
    return response.data;
  },
};
