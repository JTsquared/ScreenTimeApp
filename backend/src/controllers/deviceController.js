const Device = require('../models/Device');
const DeviceCommand = require('../models/DeviceCommand');
const ScreenTimeSession = require('../models/ScreenTimeSession');
const ChoreCompletion = require('../models/ChoreCompletion');

// Get all devices for family
exports.getDevices = async (req, res) => {
  try {
    const devices = await Device.find({
      familyId: req.user.familyId
    })
      .populate('assignedTo', 'name email')
      .sort({ name: 1 });

    res.json(devices);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Register new device (parents only)
exports.registerDevice = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can register devices' });
    }

    const { name, macAddress, deviceType, assignedTo } = req.body;

    // Check if MAC address already exists
    const existingDevice = await Device.findOne({ macAddress: macAddress.toUpperCase() });
    if (existingDevice) {
      return res.status(400).json({ message: 'Device with this MAC address already exists' });
    }

    const device = await Device.create({
      familyId: req.user.familyId,
      name,
      macAddress: macAddress.toUpperCase(),
      deviceType,
      assignedTo: assignedTo || null
    });

    const populatedDevice = await Device.findById(device._id)
      .populate('assignedTo', 'name email');

    res.status(201).json(populatedDevice);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update device (parents only)
exports.updateDevice = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can update devices' });
    }

    const device = await Device.findOne({
      _id: req.params.id,
      familyId: req.user.familyId
    });

    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    const { name, deviceType, assignedTo } = req.body;

    if (name !== undefined) device.name = name;
    if (deviceType !== undefined) device.deviceType = deviceType;
    if (assignedTo !== undefined) device.assignedTo = assignedTo;

    await device.save();

    const populatedDevice = await Device.findById(device._id)
      .populate('assignedTo', 'name email');

    res.json(populatedDevice);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete device (parents only)
exports.deleteDevice = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can delete devices' });
    }

    const device = await Device.findOneAndDelete({
      _id: req.params.id,
      familyId: req.user.familyId
    });

    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    res.json({ message: 'Device deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Enable device (child requests screen time, or parent enables directly)
exports.enableDevice = async (req, res) => {
  try {
    const { durationMinutes } = req.body;
    const deviceId = req.params.id;

    // Get device
    const device = await Device.findOne({
      _id: deviceId,
      familyId: req.user.familyId
    });

    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    // Parent override — enable without screen time checks
    if (req.user.role === 'parent') {
      device.isEnabled = true;
      device.enabledUntil = null; // No time limit for parent override
      await device.save();

      // Create device command for Pi service
      await DeviceCommand.create({
        deviceId: device._id,
        command: 'enable',
        familyId: req.user.familyId
      });

      return res.json({
        device,
        message: 'Device enabled by parent'
      });
    }

    // Child flow below — requires screen time balance

    // Check if device is already enabled
    if (device.isEnabled && device.enabledUntil && device.enabledUntil > new Date()) {
      return res.status(400).json({
        message: 'Device is already enabled',
        enabledUntil: device.enabledUntil
      });
    }

    // Calculate available screen time
    const completions = await ChoreCompletion.find({
      childId: req.user._id,
      familyId: req.user.familyId,
      status: 'approved'
    }).populate('choreId');

    const totalEarned = completions.reduce((sum, completion) => {
      return sum + completion.choreId.screenTimeMinutes;
    }, 0);

    const sessions = await ScreenTimeSession.find({
      childId: req.user._id,
      familyId: req.user.familyId
    });

    const totalUsed = sessions.reduce((sum, session) => {
      return sum + session.minutesAllocated;
    }, 0);

    const available = totalEarned - totalUsed;

    if (available < durationMinutes) {
      return res.status(400).json({
        message: 'Not enough screen time available',
        available,
        requested: durationMinutes
      });
    }

    // Create screen time session
    const endsAt = new Date(Date.now() + durationMinutes * 60 * 1000);

    const session = await ScreenTimeSession.create({
      childId: req.user._id,
      deviceId: device._id,
      minutesAllocated: durationMinutes,
      endsAt,
      familyId: req.user.familyId
    });

    // Update device status
    device.isEnabled = true;
    device.enabledUntil = endsAt;
    await device.save();

    // Create device command for Pi service
    await DeviceCommand.create({
      deviceId: device._id,
      command: 'enable',
      durationMinutes,
      familyId: req.user.familyId
    });

    res.json({
      session,
      device,
      message: 'Device enabled successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get device status
exports.getDeviceStatus = async (req, res) => {
  try {
    const device = await Device.findOne({
      _id: req.params.id,
      familyId: req.user.familyId
    }).populate('assignedTo', 'name email');

    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    // Check if device should be disabled
    if (device.isEnabled && device.enabledUntil && device.enabledUntil < new Date()) {
      device.isEnabled = false;
      device.enabledUntil = null;
      await device.save();
    }

    // Get active session if any
    const activeSession = await ScreenTimeSession.findOne({
      deviceId: device._id,
      isActive: true,
      endsAt: { $gt: new Date() }
    }).populate('childId', 'name email');

    res.json({
      device,
      activeSession,
      remainingMinutes: activeSession
        ? Math.ceil((activeSession.endsAt - new Date()) / (1000 * 60))
        : 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get screen time sessions for current child
exports.getMySessions = async (req, res) => {
  try {
    const sessions = await ScreenTimeSession.find({
      childId: req.user._id,
      familyId: req.user.familyId
    }).sort({ startedAt: -1 }).limit(100);

    res.json(sessions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Stop screen time early (child returns unused minutes)
exports.stopEarly = async (req, res) => {
  try {
    const deviceId = req.params.id;

    const device = await Device.findOne({
      _id: deviceId,
      familyId: req.user.familyId
    });

    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    if (!device.isEnabled) {
      return res.status(400).json({ message: 'Device is not currently enabled' });
    }

    // Find the active session
    const session = await ScreenTimeSession.findOne({
      deviceId: device._id,
      childId: req.user._id,
      isActive: true,
      endsAt: { $gt: new Date() }
    });

    if (!session) {
      return res.status(400).json({ message: 'No active session found for this device' });
    }

    // Calculate how many minutes were actually used
    const now = new Date();
    const minutesUsed = Math.ceil((now - session.startedAt) / (1000 * 60));
    const minutesReturned = Math.max(0, session.minutesAllocated - minutesUsed);

    // Update session to only reflect actual usage
    session.minutesAllocated = minutesUsed;
    session.endsAt = now;
    session.isActive = false;
    await session.save();

    // Disable device
    device.isEnabled = false;
    device.enabledUntil = null;
    await device.save();

    // Create disable command for Pi service
    await DeviceCommand.create({
      deviceId: device._id,
      command: 'disable',
      familyId: req.user.familyId
    });

    res.json({
      message: `Screen time stopped early. ${minutesReturned} minutes returned.`,
      minutesUsed,
      minutesReturned,
      device
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Manually disable device (parents only)
exports.disableDevice = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can manually disable devices' });
    }

    const device = await Device.findOne({
      _id: req.params.id,
      familyId: req.user.familyId
    });

    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    // Update device status
    device.isEnabled = false;
    device.enabledUntil = null;
    await device.save();

    // End active sessions
    await ScreenTimeSession.updateMany({
      deviceId: device._id,
      isActive: true
    }, {
      isActive: false
    });

    // Create device command for Pi service
    await DeviceCommand.create({
      deviceId: device._id,
      command: 'disable',
      familyId: req.user.familyId
    });

    res.json({
      device,
      message: 'Device disabled successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
