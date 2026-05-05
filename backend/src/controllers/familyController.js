const Family = require('../models/Family');

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
      minimumSavingsWithdrawal: family.minimumSavingsWithdrawal
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
