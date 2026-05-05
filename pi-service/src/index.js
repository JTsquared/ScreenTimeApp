require('dotenv').config();
const BackendClient = require('./backendClient');
const PiHoleClient = require('./piholeClient');

// Configuration
const config = {
  backendUrl: process.env.BACKEND_URL,
  apiKey: process.env.PI_SERVICE_API_KEY,
  piholeUrl: process.env.PIHOLE_URL || 'https://localhost',
  piholePassword: process.env.PIHOLE_PASSWORD,
  commandPollInterval: parseInt(process.env.COMMAND_POLL_INTERVAL) || 5000,
  sessionCheckInterval: parseInt(process.env.SESSION_CHECK_INTERVAL) || 60000
};

// Validate configuration
if (!config.backendUrl || !config.apiKey) {
  console.error('ERROR: BACKEND_URL and PI_SERVICE_API_KEY must be set in .env file');
  process.exit(1);
}

// Initialize clients
const backendClient = new BackendClient(config.backendUrl, config.apiKey);
const piholeClient = new PiHoleClient(config.piholeUrl, config.piholePassword);

// Store active timers for device disabling
const deviceTimers = new Map();

/**
 * Process a device command
 */
async function processCommand(command) {
  console.log(`Processing command ${command._id}: ${command.command} for device ${command.deviceId.name}`);

  const macAddress = command.deviceId.macAddress;
  let result;

  try {
    if (command.command === 'enable') {
      // Enable device
      result = await piholeClient.enableDevice(macAddress);

      if (result.success && command.durationMinutes) {
        // Set timer to disable device after duration
        const timeoutMs = command.durationMinutes * 60 * 1000;

        // Clear existing timer if any
        if (deviceTimers.has(command.deviceId._id)) {
          clearTimeout(deviceTimers.get(command.deviceId._id));
        }

        // Set new timer
        const timer = setTimeout(async () => {
          console.log(`Timer expired for device ${command.deviceId.name}, disabling...`);
          await piholeClient.disableDevice(macAddress);
          deviceTimers.delete(command.deviceId._id);
        }, timeoutMs);

        deviceTimers.set(command.deviceId._id, timer);

        console.log(`Device ${command.deviceId.name} will be disabled in ${command.durationMinutes} minutes`);
      }
    } else if (command.command === 'disable') {
      // Disable device
      result = await piholeClient.disableDevice(macAddress);

      // Clear any existing timer
      if (deviceTimers.has(command.deviceId._id)) {
        clearTimeout(deviceTimers.get(command.deviceId._id));
        deviceTimers.delete(command.deviceId._id);
      }
    }

    // Update command status in backend
    if (result.success) {
      await backendClient.updateCommandStatus(command._id, 'executed');
      console.log(`Command ${command._id} executed successfully`);
    } else {
      await backendClient.updateCommandStatus(command._id, 'failed', result.error);
      console.error(`Command ${command._id} failed: ${result.error}`);
    }
  } catch (error) {
    console.error(`Error processing command ${command._id}:`, error);
    await backendClient.updateCommandStatus(command._id, 'failed', error.message);
  }
}

/**
 * Poll for pending commands
 */
async function pollCommands() {
  try {
    const commands = await backendClient.getPendingCommands();

    if (commands.length > 0) {
      console.log(`Found ${commands.length} pending command(s)`);

      for (const command of commands) {
        await processCommand(command);
      }
    }
  } catch (error) {
    console.error('Error in command polling loop:', error);
  }
}

/**
 * Check for expired sessions and ensure devices are disabled
 */
async function checkExpiredSessions() {
  try {
    console.log('Checking for expired sessions...');

    // Tell backend to check for expired sessions
    const result = await backendClient.checkExpiredSessions();

    if (result) {
      console.log(`Expired sessions check: ${result.expiredSessions} expired, ${result.disableCommands} disable commands created`);
    }
  } catch (error) {
    console.error('Error checking expired sessions:', error);
  }
}

/**
 * Re-sync blocked devices — catches IP changes for currently blocked devices
 */
async function syncBlockedDevices() {
  try {
    const devices = await backendClient.getAllDevices();
    for (const device of devices) {
      if (!device.isEnabled) {
        await piholeClient.disableDevice(device.macAddress);
      }
    }
  } catch (error) {
    console.error('Error syncing blocked devices:', error);
  }
}

/**
 * Initialize service
 */
async function initialize() {
  console.log('=== Screen Time Pi Service Starting ===');
  console.log(`Backend URL: ${config.backendUrl}`);
  console.log(`Pi-hole URL: ${config.piholeUrl}`);
  console.log(`Command poll interval: ${config.commandPollInterval}ms`);
  console.log(`Session check interval: ${config.sessionCheckInterval}ms`);

  // Authenticate with Pi-hole and set up blocked group
  console.log('Connecting to Pi-hole...');
  const piholeAuthed = await piholeClient.authenticate();
  if (!piholeAuthed) {
    console.error('WARNING: Pi-hole authentication failed. Check PIHOLE_PASSWORD.');
  } else {
    await piholeClient.setupBlockedGroup();
  }

  // Health check
  console.log('Performing backend health check...');
  const isHealthy = await backendClient.healthCheck();

  if (!isHealthy) {
    console.error('WARNING: Backend health check failed. Will continue trying...');
  } else {
    console.log('Backend is healthy');
  }

  // Get all devices and initialize blocklist
  console.log('Fetching devices from backend...');
  const devices = await backendClient.getAllDevices();
  console.log(`Found ${devices.length} device(s)`);

  if (devices.length > 0) {
    await piholeClient.initializeBlocklist(devices);
  }

  // Start polling loops
  console.log('Starting command polling loop...');
  setInterval(pollCommands, config.commandPollInterval);

  console.log('Starting session check loop...');
  setInterval(checkExpiredSessions, config.sessionCheckInterval);

  console.log('Starting blocked device sync loop (every 2 minutes)...');
  setInterval(syncBlockedDevices, 120000);

  // Run immediately on startup
  await pollCommands();
  await checkExpiredSessions();

  console.log('=== Pi Service Running ===');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');

  // Clear all timers
  for (const timer of deviceTimers.values()) {
    clearTimeout(timer);
  }

  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down...');

  // Clear all timers
  for (const timer of deviceTimers.values()) {
    clearTimeout(timer);
  }

  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit, try to continue running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, try to continue running
});

// Start the service
initialize().catch((error) => {
  console.error('Fatal error during initialization:', error);
  process.exit(1);
});
