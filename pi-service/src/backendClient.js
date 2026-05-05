const axios = require('axios');

class BackendClient {
  constructor(backendUrl, apiKey) {
    this.backendUrl = backendUrl;
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: backendUrl,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  }

  /**
   * Get pending device commands from backend
   */
  async getPendingCommands() {
    try {
      const response = await this.client.get('/api/pi/commands');
      return response.data;
    } catch (error) {
      console.error('Error fetching pending commands:', error.message);
      return [];
    }
  }

  /**
   * Update command status after execution
   */
  async updateCommandStatus(commandId, status, errorMessage = null) {
    try {
      await this.client.put(`/api/pi/commands/${commandId}/status`, {
        status,
        errorMessage
      });
      return true;
    } catch (error) {
      console.error(`Error updating command status for ${commandId}:`, error.message);
      return false;
    }
  }

  /**
   * Get all devices from backend
   */
  async getAllDevices() {
    try {
      const response = await this.client.get('/api/pi/devices');
      return response.data;
    } catch (error) {
      console.error('Error fetching devices:', error.message);
      return [];
    }
  }

  /**
   * Notify backend to check for expired sessions
   */
  async checkExpiredSessions() {
    try {
      const response = await this.client.post('/api/pi/check-expired');
      return response.data;
    } catch (error) {
      console.error('Error checking expired sessions:', error.message);
      return null;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.backendUrl}/health`, {
        timeout: 5000
      });
      return response.data.status === 'ok';
    } catch (error) {
      console.error('Backend health check failed:', error.message);
      return false;
    }
  }
}

module.exports = BackendClient;
