const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Family = require('../models/Family');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// Master registration code — required to create new families
const MASTER_REGISTRATION_CODE = process.env.REGISTRATION_CODE || 'SCREENTIME2026';

// Register new user (create new family or join existing)
exports.register = async (req, res) => {
  try {
    const { email, password, name, role, familyName, inviteCode, registrationCode } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    let family;

    if (inviteCode) {
      // Join existing family via invite code
      family = await Family.findOne({ inviteCode: inviteCode.toUpperCase().trim() });
      if (!family) {
        return res.status(400).json({ message: 'Invalid invite code' });
      }
    } else {
      // Create new family — requires master registration code
      if (!registrationCode || registrationCode !== MASTER_REGISTRATION_CODE) {
        return res.status(403).json({ message: 'Registration code required to create a new family' });
      }
      if (!familyName) {
        return res.status(400).json({ message: 'Family name is required' });
      }

      // Create a temp user ID placeholder for family creation
      const tempUser = await User.create({
        email,
        password,
        name,
        role: role || 'parent',
        allowanceRate: 0
      });

      family = await Family.create({
        name: familyName,
        createdBy: tempUser._id
      });

      tempUser.familyId = family._id;
      await tempUser.save();

      return res.status(201).json({
        _id: tempUser._id,
        name: tempUser.name,
        email: tempUser.email,
        role: tempUser.role,
        familyId: tempUser.familyId,
        token: generateToken(tempUser._id)
      });
    }

    // Join existing family
    const user = await User.create({
      email,
      password,
      name,
      role: role || 'parent',
      familyId: family._id,
      allowanceRate: role === 'child' ? 2.0 : 0
    });

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
