const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Family = require('../models/Family');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// Register new user (first user creates family)
exports.register = async (req, res) => {
  try {
    const { email, password, name, role, familyName } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    if (!familyName) {
      return res.status(400).json({ message: 'Family name is required for registration' });
    }

    // Create user first (without familyId)
    const user = await User.create({
      email,
      password,
      name,
      role: role || 'parent',
      allowanceRate: role === 'child' ? 2.0 : 0
    });

    // Now create family with the user's ID
    const family = await Family.create({
      name: familyName,
      createdBy: user._id
    });

    // Update user with familyId
    user.familyId = family._id;
    await user.save();

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      familyId: user.familyId,
      token: generateToken(user._id)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Add family member (requires parent role)
exports.addFamilyMember = async (req, res) => {
  try {
    const { email, username, password, name, role, allowanceRate } = req.body;

    // Check if requester is a parent
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can add family members' });
    }

    // Children use username, parents use email
    if (role === 'child') {
      if (!username) {
        return res.status(400).json({ message: 'Username is required for children' });
      }
      const usernameExists = await User.findOne({ username: username.toLowerCase() });
      if (usernameExists) {
        return res.status(400).json({ message: 'Username already taken' });
      }
    } else {
      if (!email) {
        return res.status(400).json({ message: 'Email is required for parents' });
      }
      const emailExists = await User.findOne({ email: email.toLowerCase() });
      if (emailExists) {
        return res.status(400).json({ message: 'User with this email already exists' });
      }
    }

    // Create user with same family ID
    const userData = {
      password,
      name,
      role,
      familyId: req.user.familyId,
      allowanceRate: role === 'child' ? (allowanceRate || 2.0) : 0
    };

    if (role === 'child') {
      userData.username = username.toLowerCase();
    } else {
      userData.email = email.toLowerCase();
    }

    const user = await User.create(userData);

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      familyId: user.familyId,
      allowanceRate: user.allowanceRate
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Login user (accepts email or username)
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const login = email ? email.toLowerCase().trim() : '';

    // Try email first, then username
    const user = await User.findOne({ email: login }) || await User.findOne({ username: login });

    if (user && (await user.comparePassword(password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        familyId: user.familyId,
        allowanceRate: user.allowanceRate,
        token: generateToken(user._id)
      });
    } else {
      res.status(401).json({ message: 'Invalid email/username or password' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get current user
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
