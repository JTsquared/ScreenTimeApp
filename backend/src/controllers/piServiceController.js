const DeviceCommand = require('../models/DeviceCommand');
const Device = require('../models/Device');
const ScheduleRule = require('../models/ScheduleRule');
const { isRuleActive } = require('./scheduleController');

// Get pending commands for Pi service to execute
exports.getPendingCommands = async (req, res) => {
  try {
    const commands = await DeviceCommand.find({
      status: 'pending'
    })
      .populate('deviceId')
      .sort({ createdAt: 1 })
      .limit(50);

    res.json(commands);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update command status (Pi service reports execution status)
exports.updateCommandStatus = async (req, res) => {
  try {
    const { status, errorMessage } = req.body;
    const commandId = req.params.id;

    const command = await DeviceCommand.findById(commandId);

    if (!command) {
      return res.status(404).json({ message: 'Command not found' });
    }

    command.status = status;
    command.executedAt = new Date();

    if (errorMessage) {
      command.errorMessage = errorMessage;
    }

    await command.save();

    res.json(command);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all devices with MAC addresses (for Pi service)
exports.getDevicesForPi = async (req, res) => {
  try {
    const devices = await Device.find({})
      .select('_id name macAddress isEnabled enabledUntil familyId')
      .sort({ name: 1 });

    res.json(devices);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Check expired sessions and create disable commands
exports.checkExpiredSessions = async (req, res) => {
  try {
    const ScreenTimeSession = require('../models/ScreenTimeSession');

    // Find expired active sessions
    const expiredSessions = await ScreenTimeSession.find({
      isActive: true,
      endsAt: { $lt: new Date() }
    });

    const disableCommands = [];

    for (const session of expiredSessions) {
      // Mark session as inactive
      session.isActive = false;
      await session.save();

      // Update device status
      await Device.findByIdAndUpdate(session.deviceId, {
        isEnabled: false,
        enabledUntil: null,
        enabledBy: null,
        enabledAt: null
      });

      // Create disable command
      const command = await DeviceCommand.create({
        deviceId: session.deviceId,
        command: 'disable',
        familyId: session.familyId
      });

      disableCommands.push(command);
    }

    // --- Process schedule rules (freeplay / blackout) ---
    const scheduleActions = await processScheduleRules();

    res.json({
      expiredSessions: expiredSessions.length,
      disableCommands: disableCommands.length,
      scheduleActions
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Process freeplay and blackout schedule rules
async function processScheduleRules() {
  const now = new Date();
  const actions = { freeplayEnabled: 0, freeplayDisabled: 0, blackoutDisabled: 0 };

  // Get all enabled rules across all families
  const rules = await ScheduleRule.find({ isEnabled: true });

  // Group rules by family
  const familyRules = {};
  for (const rule of rules) {
    const fid = rule.familyId.toString();
    if (!familyRules[fid]) familyRules[fid] = [];
    familyRules[fid].push(rule);
  }

  for (const [familyId, fRules] of Object.entries(familyRules)) {
    const activeFreeplay = fRules.find(r => r.type === 'freeplay' && isRuleActive(r, now));
    const activeBlackout = fRules.find(r => r.type === 'blackout' && isRuleActive(r, now));

    const devices = await Device.find({ familyId });

    // Freeplay: enable all disabled devices
    if (activeFreeplay) {
      for (const device of devices) {
        if (!device.isEnabled && device.macAddress) {
          device.isEnabled = true;
          device.enabledBy = null;
          device.enabledAt = now;
          device.enabledUntil = null;
          device.enabledSource = 'freeplay';
          await device.save();

          await DeviceCommand.create({
            deviceId: device._id,
            command: 'enable',
            familyId,
            status: 'pending'
          });
          actions.freeplayEnabled++;
        }
      }
    }

    // If freeplay just ended: disable devices that were enabled by freeplay
    if (!activeFreeplay) {
      for (const device of devices) {
        if (device.isEnabled && device.enabledSource === 'freeplay') {
          device.isEnabled = false;
          device.enabledBy = null;
          device.enabledAt = null;
          device.enabledUntil = null;
          device.enabledSource = null;
          await device.save();

          await DeviceCommand.create({
            deviceId: device._id,
            command: 'disable',
            familyId,
            status: 'pending'
          });
          actions.freeplayDisabled++;
        }
      }
    }

    // Blackout: disable all enabled devices (except parent-enabled and excluded ones)
    if (activeBlackout) {
      const excludedIds = (activeBlackout.excludedDevices || []).map(id => id.toString());
      for (const device of devices) {
        if (device.isEnabled && device.enabledSource !== 'parent' && !excludedIds.includes(device._id.toString())) {
          device.isEnabled = false;
          device.enabledBy = null;
          device.enabledAt = null;
          device.enabledUntil = null;
          device.enabledSource = null;
          await device.save();

          await DeviceCommand.create({
            deviceId: device._id,
            command: 'disable',
            familyId,
            status: 'pending'
          });
          actions.blackoutDisabled++;
        }
      }
    }
  }

  return actions;
}
