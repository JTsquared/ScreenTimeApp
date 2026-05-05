const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    sparse: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  username: {
    type: String,
    sparse: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['parent', 'child'],
    required: true
  },
  familyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Family'
  },
  allowanceRate: {
    type: Number,
    default: 2.0, // dollars per hour, applied to chore estimated time
    min: 0
  },
  savingsBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  webauthnCredentials: [{
    credentialID: { type: String, required: true },
    credentialPublicKey: { type: String, required: true }, // base64-encoded
    counter: { type: Number, required: true, default: 0 },
    transports: [{ type: String }],
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to get public profile (exclude password)
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.model('User', userSchema);
