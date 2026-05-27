const crypto = require('crypto');
const Family = require('../models/Family');
const ChoreCompletion = require('../models/ChoreCompletion');
const ScreenTimeSession = require('../models/ScreenTimeSession');
const AllowanceTransaction = require('../models/AllowanceTransaction');

// Get family settings
exports.getSettings = async (req, res) => {
  try {
    const family = await Family.findById(req.user.familyId);

    if (!family) {
      return res.status(404).json({ message: 'Family not found' });
    }

    res.json({
      familyId: family._id,
      name: family.name,
      inviteCode: family.inviteCode,
      minimumSavingsWithdrawal: family.minimumSavingsWithdrawal || 25
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update family settings (parents only)
exports.updateSettings = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can update family settings' });
    }

    const family = await Family.findById(req.user.familyId);

    if (!family) {
      return res.status(404).json({ message: 'Family not found' });
    }

    const { minimumSavingsWithdrawal } = req.body;

    if (minimumSavingsWithdrawal !== undefined) {
      if (minimumSavingsWithdrawal < 0) {
        return res.status(400).json({ message: 'Minimum savings withdrawal must be 0 or greater' });
      }
      family.minimumSavingsWithdrawal = minimumSavingsWithdrawal;
    }

    await family.save();

    res.json({
      familyId: family._id,
      name: family.name,
      inviteCode: family.inviteCode,
      minimumSavingsWithdrawal: family.minimumSavingsWithdrawal
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Regenerate invite code (parents only)
exports.regenerateInviteCode = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can regenerate invite codes' });
    }

    const family = await Family.findById(req.user.familyId);
    if (!family) {
      return res.status(404).json({ message: 'Family not found' });
    }

    family.inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    await family.save();

    res.json({ inviteCode: family.inviteCode });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get activity log for family (parents only)
exports.getActivityLog = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can view activity log' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const before = req.query.before ? new Date(req.query.before) : new Date();
    const familyId = req.user.familyId;

    // Query all three collections in parallel
    const [completions, sessions, transactions] = await Promise.all([
      ChoreCompletion.find({
        familyId,
        status: { $in: ['approved', 'rejected'] },
        approvedAt: { $lt: before }
      })
        .populate('choreId', 'name screenTimeMinutes')
        .populate('childId', 'name')
        .populate('approvedBy', 'name')
        .sort({ approvedAt: -1 })
        .limit(limit),

      ScreenTimeSession.find({
        familyId,
        startedAt: { $lt: before }
      })
        .populate('childId', 'name')
        .populate('deviceId', 'name')
        .sort({ startedAt: -1 })
        .limit(limit),

      AllowanceTransaction.find({
        familyId,
        createdAt: { $lt: before }
      })
        .populate('childId', 'name')
        .sort({ createdAt: -1 })
        .limit(limit)
    ]);

    // Normalize into unified activity entries
    const activities = [];

    for (const c of completions) {
      const choreName = c.choreId?.name || 'Chore';
      const mins = c.choreId?.screenTimeMinutes || 0;
      const childName = c.childId?.name || 'Child';
      const approverName = c.approvedBy?.name || 'Parent';

      if (c.status === 'approved') {
        activities.push({
          _id: c._id,
          type: 'chore_approved',
          timestamp: c.approvedAt,
          childName,
          description: `${choreName} approved` + (mins > 0 ? ` (+${mins} min)` : ''),
          details: { approvedBy: approverName, screenTimeMinutes: mins, notes: c.notes }
        });
      } else {
        activities.push({
          _id: c._id,
          type: 'chore_rejected',
          timestamp: c.approvedAt,
          childName,
          description: `${choreName} rejected`,
          details: { approvedBy: approverName, notes: c.notes }
        });
      }
    }

    for (const s of sessions) {
      const childName = s.childId?.name || 'Child';
      const deviceName = s.deviceId?.name || 'Device';
      activities.push({
        _id: s._id,
        type: 'screen_time',
        timestamp: s.startedAt,
        childName,
        description: `${deviceName} for ${s.minutesAllocated} min`,
        details: { deviceName, minutesAllocated: s.minutesAllocated, endsAt: s.endsAt, isActive: s.isActive }
      });
    }

    for (const t of transactions) {
      const childName = t.childId?.name || 'Child';
      let description = '';
      let type = t.type;

      switch (t.type) {
        case 'earned':
          description = `Earned $${t.amount.toFixed(2)}`;
          break;
        case 'payout':
          description = `Payout $${t.amount.toFixed(2)}`;
          break;
        case 'savings_deposit':
          description = `Saved $${t.amount.toFixed(2)}` + (t.bonusMinutes > 0 ? ` (+${t.bonusMinutes} bonus min)` : '');
          break;
        case 'savings_withdrawal':
          description = `Withdrawal $${t.amount.toFixed(2)}`;
          break;
        case 'spend_request':
          description = `Spend request $${t.amount.toFixed(2)}`;
          break;
        default:
          description = `${t.type} $${t.amount.toFixed(2)}`;
      }

      activities.push({
        _id: t._id,
        type,
        timestamp: t.createdAt,
        childName,
        description,
        details: { amount: t.amount, status: t.status, notes: t.notes, bonusMinutes: t.bonusMinutes }
      });
    }

    // Sort by timestamp descending and limit
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const page = activities.slice(0, limit);
    const hasMore = activities.length > limit || completions.length === limit || sessions.length === limit || transactions.length === limit;

    res.json({ activities: page, hasMore });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
