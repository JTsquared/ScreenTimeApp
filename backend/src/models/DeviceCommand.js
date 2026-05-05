const mongoose = require('mongoose');

const deviceCommandSchema = new mongoose.Schema({
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
    index: true
  },
  command: {
    type: String,
    enum: ['enable', 'disable'],
    required: true
  },
  durationMinutes: {
    type: Number,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'executed', 'failed'],
    default: 'pending',
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  executedAt: {
    type: Date
  },
  errorMessage: {
    type: String
  },
  familyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Family',
    required: true,
    index: true
  }
});

module.exports = mongoose.model('DeviceCommand', deviceCommandSchema);
