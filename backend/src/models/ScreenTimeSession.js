const mongoose = require('mongoose');

const screenTimeSessionSchema = new mongoose.Schema({
  childId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
    index: true
  },
  minutesAllocated: {
    type: Number,
    required: true,
    min: 0
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  endsAt: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  familyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Family',
    required: true,
    index: true
  }
});

module.exports = mongoose.model('ScreenTimeSession', screenTimeSessionSchema);
