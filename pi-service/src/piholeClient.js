const axios = require('axios');

class PiHoleClient {
  constructor(piholeUrl, password) {
    this.piholeUrl = piholeUrl.replace(/\/+$/, '');
    this.password = password;
    this.sid = null;
    this.blockedGroupId = null;
    this.client = axios.create({
      baseURL: this.piholeUrl,
      headers: { 'Content-Type': 'application/json' },
      // Pi-hole v6 uses self-signed HTTPS by default
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
  }

  /**
   * Authenticate with Pi-hole v6 API and get a session ID
   */
  async authenticate() {
    try {
      const response = await this.client.post('/api/auth', {
        password: this.password
      });

      if (response.data.session && response.data.session.valid) {
        this.sid = response.data.session.sid;
        console.log('Pi-hole authentication successful');
        return true;
      }

      console.error('Pi-hole authentication failed: invalid session');
      return false;
    } catch (error) {
      console.error('Pi-hole authentication error:', error.message);
      return false;
    }
  }

  /**
   * Make an authenticated API request, re-authenticating if session expired
   */
  async apiRequest(method, path, data = null) {
    if (!this.sid) {
      const authed = await this.authenticate();
      if (!authed) throw new Error('Failed to authenticate with Pi-hole');
    }

    const config = {
      method,
      url: path,
      headers: { 'X-FTL-SID': this.sid }
    };
    if (data) config.data = data;

    try {
      return await this.client.request(config);
    } catch (error) {
      // If unauthorized, try re-authenticating once
      if (error.response && error.response.status === 401) {
        console.log('Session expired, re-authenticating...');
        const authed = await this.authenticate();
        if (!authed) throw new Error('Failed to re-authenticate with Pi-hole');

        config.headers['X-FTL-SID'] = this.sid;
        return await this.client.request(config);
      }
      throw error;
    }
  }

  /**
   * One-time setup: create the ScreenTimeBlocked group and add a wildcard deny rule
   */
  async setupBlockedGroup() {
    try {
      // Check if group already exists
      const groupsResponse = await this.apiRequest('GET', '/api/groups');
      const groups = groupsResponse.data.groups || [];
      let blockedGroup = groups.find(g => g.name === 'ScreenTimeBlocked');

      if (!blockedGroup) {
        console.log('Creating ScreenTimeBlocked group...');
        await this.apiRequest('POST', '/api/groups', {
          name: 'ScreenTimeBlocked',
          enabled: true,
          comment: 'Devices blocked by Screen Time app'
        });
        // Re-fetch groups to get the created group with its ID
        const refetchResponse = await this.apiRequest('GET', '/api/groups');
        const refetchedGroups = refetchResponse.data.groups || [];
        blockedGroup = refetchedGroups.find(g => g.name === 'ScreenTimeBlocked');
      }

      this.blockedGroupId = blockedGroup.id;
      console.log(`ScreenTimeBlocked group ID: ${this.blockedGroupId}`);

      // Check if wildcard deny regex already exists for this group
      const domainsResponse = await this.apiRequest('GET', '/api/domains/deny/regex');
      const denyDomains = domainsResponse.data.domains || [];
      const hasWildcard = denyDomains.some(
        d => d.domain === '.*' && d.groups && d.groups.includes(this.blockedGroupId)
      );

      if (!hasWildcard) {
        console.log('Adding wildcard deny regex for blocked group...');
        await this.apiRequest('POST', '/api/domains/deny/regex', {
          domain: '.*',
          groups: [this.blockedGroupId],
          enabled: true,
          comment: 'Block all DNS for screen time blocked devices'
        });
      }

      console.log('Blocked group setup complete');
      return true;
    } catch (error) {
      console.error('Error setting up blocked group:', error.message);
      return false;
    }
  }

  /**
   * URL-encode a client identifier for use in API paths
   */
  encodeClient(identifier) {
    return encodeURIComponent(identifier);
  }

  /**
   * Look up a device's current IPs from Pi-hole's network devices list by MAC address
   */
  async getDeviceIPs(macAddress) {
    try {
      const response = await this.apiRequest('GET', '/api/network/devices');
      const devices = response.data.devices || [];
      const mac = macAddress.toLowerCase();
      const device = devices.find(d => d.hwaddr && d.hwaddr.toLowerCase() === mac);
      if (device && device.ips) {
        return device.ips.map(entry => entry.ip);
      }
      return [];
    } catch (error) {
      console.error(`Error looking up IPs for ${macAddress}:`, error.message);
      return [];
    }
  }

  /**
   * Ensure a client entry exists in Pi-hole for a given identifier (MAC or IP)
   */
  async ensureClientEntry(identifier, name, groups) {
    try {
      try {
        await this.apiRequest('GET', `/api/clients/${this.encodeClient(identifier)}`);
        return true; // Already exists
      } catch (error) {
        if (!error.response || error.response.status !== 404) throw error;
      }

      console.log(`Registering client ${identifier} (${name})...`);
      await this.apiRequest('POST', '/api/clients', {
        client: identifier,
        groups: groups,
        comment: name || 'Screen Time managed device'
      });
      return true;
    } catch (error) {
      console.error(`Error registering client ${identifier}:`, error.message);
      return false;
    }
  }

  /**
   * Ensure a device is fully registered — MAC + all known IPs
   */
  async ensureClientRegistered(macAddress, name) {
    const mac = macAddress.toLowerCase();
    await this.ensureClientEntry(mac, name, [0]);

    const ips = await this.getDeviceIPs(macAddress);
    for (const ip of ips) {
      await this.ensureClientEntry(ip, name, [0]);
    }
  }

  /**
   * Set group for a device across MAC and all known IPs
   */
  async setDeviceGroup(macAddress, groups) {
    const mac = macAddress.toLowerCase();

    // Update MAC entry
    try {
      await this.apiRequest('PUT', `/api/clients/${this.encodeClient(mac)}`, { groups });
    } catch (error) {
      if (error.response && error.response.status === 404) {
        await this.ensureClientEntry(mac, null, groups);
      } else {
        throw error;
      }
    }

    // Look up and update all IP entries for this device
    const ips = await this.getDeviceIPs(macAddress);
    for (const ip of ips) {
      try {
        await this.apiRequest('PUT', `/api/clients/${this.encodeClient(ip)}`, { groups });
      } catch (error) {
        if (error.response && error.response.status === 404) {
          await this.ensureClientEntry(ip, null, groups);
        } else {
          console.error(`Error updating client ${ip}:`, error.message);
        }
      }
    }
  }

  /**
   * Enable internet for a device (move to Default group)
   */
  async enableDevice(macAddress) {
    try {
      console.log(`Enabling device: ${macAddress}`);
      await this.setDeviceGroup(macAddress, [0]);
      console.log(`Device ${macAddress} enabled successfully`);
      return { success: true, message: 'Device enabled' };
    } catch (error) {
      console.error(`Error enabling device ${macAddress}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Disable internet for a device (move to ScreenTimeBlocked group)
   */
  async disableDevice(macAddress) {
    try {
      console.log(`Disabling device: ${macAddress}`);

      if (!this.blockedGroupId) {
        throw new Error('Blocked group not initialized. Call setupBlockedGroup() first.');
      }

      await this.setDeviceGroup(macAddress, [this.blockedGroupId]);
      console.log(`Device ${macAddress} disabled successfully`);
      return { success: true, message: 'Device disabled' };
    } catch (error) {
      console.error(`Error disabling device ${macAddress}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if device is currently blocked
   */
  async isDeviceBlocked(macAddress) {
    try {
      const mac = macAddress.toLowerCase();
      const response = await this.apiRequest('GET', `/api/clients/${this.encodeClient(mac)}`);
      const client = response.data.client || response.data;
      return client.groups && client.groups.includes(this.blockedGroupId) && !client.groups.includes(0);
    } catch (error) {
      console.error(`Error checking device status ${macAddress}:`, error.message);
      return false;
    }
  }

  /**
   * Get Pi-hole status
   */
  async getStatus() {
    try {
      const response = await this.apiRequest('GET', '/api/dns/blocking');
      return response.data;
    } catch (error) {
      console.error('Error getting Pi-hole status:', error.message);
      return null;
    }
  }

  /**
   * Block all devices by default (initialize blocklist)
   */
  async initializeBlocklist(devices) {
    console.log(`Initializing blocklist for ${devices.length} devices`);

    for (const device of devices) {
      await this.ensureClientRegistered(device.macAddress, device.name);

      if (!device.isEnabled) {
        await this.disableDevice(device.macAddress);
      }
    }

    console.log('Blocklist initialized');
  }
}

module.exports = PiHoleClient;
