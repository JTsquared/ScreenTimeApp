const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  familyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Family',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  macAddress: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  deviceType: {
    type: String,
    enum: ['tablet', 'phone', 'computer', 'console', 'other'],
    default: 'other'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // null for shared devices
  },
  isEnabled: {
    type: Boolean,
    default: false
  },
  enabledUntil: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Device', deviceSchema);
