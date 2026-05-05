const DeviceCommand = require('../models/DeviceCommand');
const Device = require('../models/Device');

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
        enabledUntil: null
      });

      // Create disable command
      const command = await DeviceCommand.create({
        deviceId: session.deviceId,
        command: 'disable',
        familyId: session.familyId
      });

      disableCommands.push(command);
    }

    res.json({
      expiredSessions: expiredSessions.length,
      disableCommands: disableCommands.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
