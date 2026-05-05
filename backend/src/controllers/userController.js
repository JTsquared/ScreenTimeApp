const User = require('../models/User');

// Get all family members
exports.getFamilyMembers = async (req, res) => {
  try {
    const members = await User.find({
      familyId: req.user.familyId
    }).select('-password').sort({ role: 1, name: 1 });

    res.json(members);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.params.id;

    // Users can only update their own profile, unless they're a parent
    if (userId !== req.user._id.toString() && req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Not authorized to update this profile' });
    }

    const user = await User.findOne({
      _id: userId,
      familyId: req.user.familyId
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { name, email, allowanceRate } = req.body;

    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;

    // Only parents can update allowance rates
    if (allowanceRate !== undefined && req.user.role === 'parent') {
      user.allowanceRate = allowanceRate;
    }

    await user.save();

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user._id);

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Reset a family member's password (parents only)
exports.resetMemberPassword = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can reset passwords' });
    }

    const { newPassword } = req.body;
    const userId = req.params.id;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const user = await User.findOne({
      _id: userId,
      familyId: req.user.familyId
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role !== 'child') {
      return res.status(403).json({ message: 'Can only reset passwords for children' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: `Password reset for ${user.name}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete user (parents only)
exports.deleteUser = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can delete users' });
    }

    const userId = req.params.id;

    // Cannot delete yourself
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const user = await User.findOneAndDelete({
      _id: userId,
      familyId: req.user.familyId
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
