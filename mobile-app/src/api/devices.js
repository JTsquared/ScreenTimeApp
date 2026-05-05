import apiClient from './client';

export const devicesAPI = {
  // Get all devices
  getDevices: async () => {
    const response = await apiClient.get('/devices');
    return response.data;
  },

  // Register device (parents only)
  registerDevice: async (data) => {
    const response = await apiClient.post('/devices', data);
    return response.data;
  },

  // Update device (parents only)
  updateDevice: async (id, data) => {
    const response = await apiClient.put(`/devices/${id}`, data);
    return response.data;
  },

  // Delete device (parents only)
  deleteDevice: async (id) => {
    const response = await apiClient.delete(`/devices/${id}`);
    return response.data;
  },

  // Get my screen time sessions
  getMySessions: async () => {
    const response = await apiClient.get('/devices/sessions/my');
    return response.data;
  },

  // Enable device (children)
  enableDevice: async (id, durationMinutes) => {
    const response = await apiClient.post(`/devices/${id}/enable`, { durationMinutes });
    return response.data;
  },

  // Disable device (parents only)
  disableDevice: async (id) => {
    const response = await apiClient.post(`/devices/${id}/disable`);
    return response.data;
  },

  // Get device status
  getDeviceStatus: async (id) => {
    const response = await apiClient.get(`/devices/${id}/status`);
    return response.data;
  },
};
