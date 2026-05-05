const Chore = require('../models/Chore');
const ChoreCompletion = require('../models/ChoreCompletion');
const AllowanceTransaction = require('../models/AllowanceTransaction');
const User = require('../models/User');

// Get all chores for family
exports.getChores = async (req, res) => {
  try {
    const chores = await Chore.find({
      familyId: req.user.familyId,
      isActive: true
    }).sort({ createdAt: -1 });

    res.json(chores);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Create new chore (parents only)
exports.createChore = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can create chores' });
    }

    const { name, description, screenTimeMinutes, estimatedMinutes, choreType } = req.body;

    const chore = await Chore.create({
      familyId: req.user.familyId,
      name,
      description,
      screenTimeMinutes,
      estimatedMinutes,
      choreType: choreType || 'recurring',
      createdBy: req.user._id
    });

    res.status(201).json(chore);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update chore (parents only)
exports.updateChore = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can update chores' });
    }

    const chore = await Chore.findOne({
      _id: req.params.id,
      familyId: req.user.familyId
    });

    if (!chore) {
      return res.status(404).json({ message: 'Chore not found' });
    }

    const { name, description, screenTimeMinutes, estimatedMinutes, choreType, isActive } = req.body;

    if (name !== undefined) chore.name = name;
    if (description !== undefined) chore.description = description;
    if (screenTimeMinutes !== undefined) chore.screenTimeMinutes = screenTimeMinutes;
    if (estimatedMinutes !== undefined) chore.estimatedMinutes = estimatedMinutes;
    if (choreType !== undefined) chore.choreType = choreType;
    if (isActive !== undefined) chore.isActive = isActive;

    await chore.save();

    res.json(chore);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete chore (parents only)
exports.deleteChore = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can delete chores' });
    }

    const chore = await Chore.findOne({
      _id: req.params.id,
      familyId: req.user.familyId
    });

    if (!chore) {
      return res.status(404).json({ message: 'Chore not found' });
    }

    // Soft delete
    chore.isActive = false;
    await chore.save();

    res.json({ message: 'Chore deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Mark chore as complete (children)
exports.completeChore = async (req, res) => {
  try {
    const chore = await Chore.findOne({
      _id: req.params.id,
      familyId: req.user.familyId,
      isActive: true
    });

    if (!chore) {
      return res.status(404).json({ message: 'Chore not found' });
    }

    const { notes } = req.body;

    const completion = await ChoreCompletion.create({
      choreId: chore._id,
      childId: req.user._id,
      familyId: req.user.familyId,
      status: 'pending',
      notes
    });

    const populatedCompletion = await ChoreCompletion.findById(completion._id)
      .populate('choreId')
      .populate('childId', 'name email');

    res.status(201).json(populatedCompletion);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get pending chore completions (parents)
exports.getPendingCompletions = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can view pending completions' });
    }

    const completions = await ChoreCompletion.find({
      familyId: req.user.familyId,
      status: 'pending'
    })
      .populate('choreId')
      .populate('childId', 'name email')
      .sort({ completedAt: -1 });

    res.json(completions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Approve chore completion (parents)
exports.approveCompletion = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can approve completions' });
    }

    const completion = await ChoreCompletion.findOne({
      _id: req.params.id,
      familyId: req.user.familyId,
      status: 'pending'
    }).populate('choreId');

    if (!completion) {
      return res.status(404).json({ message: 'Completion not found or already processed' });
    }

    // Update completion status
    completion.status = 'approved';
    completion.approvedBy = req.user._id;
    completion.approvedAt = new Date();
    await completion.save();

    // Calculate allowance: child's hourly rate * estimated time in hours
    const child = await User.findById(completion.childId);
    const rate = child.allowanceRate != null ? child.allowanceRate : 0;
    const estimatedHours = (completion.choreId.estimatedMinutes || 0) / 60;
    const choreAllowance = parseFloat((rate * estimatedHours).toFixed(2));

    // Create allowance transaction
    if (choreAllowance > 0) {
      await AllowanceTransaction.create({
        childId: completion.childId,
        amount: choreAllowance,
        type: 'earned',
        choreCompletionId: completion._id,
        familyId: req.user.familyId,
        notes: `Earned from: ${completion.choreId.name} (${completion.choreId.estimatedMinutes}min × $${rate.toFixed(2)}/hr)`
      });
    }

    // Deactivate one-time chores after approval
    if (completion.choreId.choreType === 'one-time') {
      await Chore.findByIdAndUpdate(completion.choreId._id, { isActive: false });
    }

    const populatedCompletion = await ChoreCompletion.findById(completion._id)
      .populate('choreId')
      .populate('childId', 'name email')
      .populate('approvedBy', 'name email');

    res.json({
      completion: populatedCompletion,
      screenTimeEarned: completion.choreId.screenTimeMinutes,
      allowanceEarned: choreAllowance
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Reject chore completion (parents)
exports.rejectCompletion = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can reject completions' });
    }

    const completion = await ChoreCompletion.findOne({
      _id: req.params.id,
      familyId: req.user.familyId,
      status: 'pending'
    });

    if (!completion) {
      return res.status(404).json({ message: 'Completion not found or already processed' });
    }

    const { notes } = req.body;

    completion.status = 'rejected';
    completion.approvedBy = req.user._id;
    completion.approvedAt = new Date();
    completion.notes = notes || completion.notes;
    await completion.save();

    const populatedCompletion = await ChoreCompletion.findById(completion._id)
      .populate('choreId')
      .populate('childId', 'name email')
      .populate('approvedBy', 'name email');

    res.json(populatedCompletion);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Quick approve - allows a parent to approve from a child's session using parent credentials
exports.quickApprove = async (req, res) => {
  try {
    const { parentLogin, parentPassword } = req.body;

    if (!parentLogin || !parentPassword) {
      return res.status(400).json({ message: 'Parent credentials required' });
    }

    // Authenticate the parent
    const login = parentLogin.toLowerCase().trim();
    const parent = await User.findOne({ email: login }) || await User.findOne({ username: login });

    if (!parent || parent.role !== 'parent') {
      return res.status(401).json({ message: 'Invalid parent credentials' });
    }

    if (!(await parent.comparePassword(parentPassword))) {
      return res.status(401).json({ message: 'Invalid parent credentials' });
    }

    // Verify parent is in the same family as the requesting user
    if (parent.familyId.toString() !== req.user.familyId.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Now perform the approval as the parent
    const completion = await ChoreCompletion.findOne({
      _id: req.params.id,
      familyId: req.user.familyId,
      status: 'pending'
    }).populate('choreId');

    if (!completion) {
      return res.status(404).json({ message: 'Completion not found or already processed' });
    }

    completion.status = 'approved';
    completion.approvedBy = parent._id;
    completion.approvedAt = new Date();
    await completion.save();

    // Calculate allowance
    const child = await User.findById(completion.childId);
    const rate = child.allowanceRate != null ? child.allowanceRate : 0;
    const estimatedHours = (completion.choreId.estimatedMinutes || 0) / 60;
    const choreAllowance = parseFloat((rate * estimatedHours).toFixed(2));

    if (choreAllowance > 0) {
      await AllowanceTransaction.create({
        childId: completion.childId,
        amount: choreAllowance,
        type: 'earned',
        choreCompletionId: completion._id,
        familyId: req.user.familyId,
        notes: `Earned from: ${completion.choreId.name} (${completion.choreId.estimatedMinutes}min × $${rate.toFixed(2)}/hr)`
      });
    }

    // Deactivate one-time chores
    if (completion.choreId.choreType === 'one-time') {
      await Chore.findByIdAndUpdate(completion.choreId._id, { isActive: false });
    }

    res.json({
      message: 'Chore approved',
      screenTimeEarned: completion.choreId.screenTimeMinutes,
      allowanceEarned: choreAllowance
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get child's completed chores history
exports.getMyCompletions = async (req, res) => {
  try {
    const completions = await ChoreCompletion.find({
      childId: req.user._id,
      familyId: req.user.familyId
    })
      .populate('choreId')
      .populate('approvedBy', 'name email')
      .sort({ completedAt: -1 })
      .limit(50);

    res.json(completions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get available screen time for child
exports.getAvailableScreenTime = async (req, res) => {
  try {
    // Get all approved completions
    const completions = await ChoreCompletion.find({
      childId: req.user._id,
      familyId: req.user.familyId,
      status: 'approved'
    }).populate('choreId');

    // Calculate total earned screen time from chores
    const choreMinutes = completions.reduce((sum, completion) => {
      return sum + completion.choreId.screenTimeMinutes;
    }, 0);

    // Calculate bonus minutes from savings deposits
    const savingsDeposits = await AllowanceTransaction.find({
      childId: req.user._id,
      familyId: req.user.familyId,
      type: 'savings_deposit'
    });

    const bonusMinutes = savingsDeposits.reduce((sum, t) => {
      return sum + (t.bonusMinutes || 0);
    }, 0);

    const totalEarned = choreMinutes + bonusMinutes;

    // Get total used screen time from sessions
    const ScreenTimeSession = require('../models/ScreenTimeSession');
    const sessions = await ScreenTimeSession.find({
      childId: req.user._id,
      familyId: req.user.familyId
    });

    const totalUsed = sessions.reduce((sum, session) => {
      return sum + session.minutesAllocated;
    }, 0);

    const available = totalEarned - totalUsed;

    res.json({
      totalEarned,
      totalUsed,
      bonusMinutes,
      available: Math.max(0, available)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
