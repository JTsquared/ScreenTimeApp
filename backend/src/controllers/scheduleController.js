const ScheduleRule = require('../models/ScheduleRule');

// Helper: check if current time falls within a schedule rule
function isRuleActive(rule, now = new Date()) {
  const currentDay = now.getDay();
  if (!rule.daysOfWeek.includes(currentDay)) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = rule.startTime.split(':').map(Number);
  const [endH, endM] = rule.endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  // Handle overnight ranges (e.g. 22:00 - 06:00)
  if (endMinutes <= startMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

// Get all schedule rules for a family
exports.getRules = async (req, res) => {
  try {
    const rules = await ScheduleRule.find({
      familyId: req.user.familyId
    }).sort({ type: 1, createdAt: -1 });

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

    const { type, name, startTime, endTime, daysOfWeek } = req.body;

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
      daysOfWeek,
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

    const { name, startTime, endTime, daysOfWeek, isEnabled } = req.body;

    if (name !== undefined) rule.name = name;
    if (startTime !== undefined) rule.startTime = startTime;
    if (endTime !== undefined) rule.endTime = endTime;
    if (daysOfWeek !== undefined) rule.daysOfWeek = daysOfWeek;
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
