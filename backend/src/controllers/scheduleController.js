const ScheduleRule = require('../models/ScheduleRule');

// Helper: check if current time falls within a schedule rule
function isRuleActive(rule, now = new Date()) {
  // Convert to the rule's timezone
  const tz = rule.timezone || 'America/New_York';
  const localStr = now.toLocaleString('en-US', { timeZone: tz });
  const localDate = new Date(localStr);

  const currentDay = localDate.getDay();
  const currentMinutes = localDate.getHours() * 60 + localDate.getMinutes();
  const [startH, startM] = rule.startTime.split(':').map(Number);
  const [endH, endM] = rule.endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  // Handle overnight ranges (e.g. 21:30 - 07:00)
  if (endMinutes <= startMinutes) {
    if (currentMinutes < endMinutes) {
      // After midnight, before end — rule started yesterday
      const yesterday = (currentDay + 6) % 7;
      return rule.daysOfWeek.includes(yesterday);
    }
    if (currentMinutes >= startMinutes) {
      // Evening portion — rule starts today
      return rule.daysOfWeek.includes(currentDay);
    }
    return false;
  }

  // Same-day range
  if (!rule.daysOfWeek.includes(currentDay)) return false;
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

// Get all schedule rules for a family
exports.getRules = async (req, res) => {
  try {
    const rules = await ScheduleRule.find({
      familyId: req.user.familyId
    }).populate('excludedDevices', 'name').sort({ type: 1, createdAt: -1 });

    res.json(rules);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Create a new schedule rule
exports.createRule = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can manage schedules' });
    }

    const { type, name, startTime, endTime, daysOfWeek, timezone, excludedDevices } = req.body;

    if (!type || !name || !startTime || !endTime || !daysOfWeek) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!['freeplay', 'blackout'].includes(type)) {
      return res.status(400).json({ message: 'Type must be freeplay or blackout' });
    }

    // Validate time format
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({ message: 'Times must be in HH:MM format (24h)' });
    }

    const rule = await ScheduleRule.create({
      familyId: req.user.familyId,
      type,
      name,
      startTime,
      endTime,
      timezone: timezone || 'America/New_York',
      daysOfWeek,
      excludedDevices: excludedDevices || [],
      createdBy: req.user._id
    });

    res.status(201).json(rule);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update a schedule rule
exports.updateRule = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can manage schedules' });
    }

    const rule = await ScheduleRule.findOne({
      _id: req.params.id,
      familyId: req.user.familyId
    });

    if (!rule) {
      return res.status(404).json({ message: 'Schedule rule not found' });
    }

    const { name, startTime, endTime, daysOfWeek, isEnabled, timezone, excludedDevices } = req.body;

    if (name !== undefined) rule.name = name;
    if (startTime !== undefined) rule.startTime = startTime;
    if (endTime !== undefined) rule.endTime = endTime;
    if (timezone !== undefined) rule.timezone = timezone;
    if (daysOfWeek !== undefined) rule.daysOfWeek = daysOfWeek;
    if (excludedDevices !== undefined) rule.excludedDevices = excludedDevices;
    if (isEnabled !== undefined) rule.isEnabled = isEnabled;

    await rule.save();
    res.json(rule);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete a schedule rule
exports.deleteRule = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can manage schedules' });
    }

    const result = await ScheduleRule.deleteOne({
      _id: req.params.id,
      familyId: req.user.familyId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Schedule rule not found' });
    }

    res.json({ message: 'Schedule rule deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get active schedule status for a family (used by devices tab)
exports.getActiveStatus = async (req, res) => {
  try {
    const rules = await ScheduleRule.find({
      familyId: req.user.familyId,
      isEnabled: true
    });

    const now = new Date();
    const activeFreeplay = rules.find(r => r.type === 'freeplay' && isRuleActive(r, now));
    const activeBlackout = rules.find(r => r.type === 'blackout' && isRuleActive(r, now));

    res.json({
      freeplayActive: !!activeFreeplay,
      freeplayRule: activeFreeplay || null,
      blackoutActive: !!activeBlackout,
      blackoutRule: activeBlackout || null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Export helper for use in other controllers
exports.isRuleActive = isRuleActive;
