const mongoose = require('mongoose');

const scheduleRuleSchema = new mongoose.Schema({
  familyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Family',
    required: true
  },
  type: {
    type: String,
    enum: ['freeplay', 'blackout'],
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  startTime: {
    type: String, // HH:MM format (24h)
    required: true
  },
  endTime: {
    type: String, // HH:MM format (24h)
    required: true
  },
  daysOfWeek: {
    type: [Number], // 0=Sunday, 1=Monday, ..., 6=Saturday
    required: true,
    validate: {
      validator: (arr) => arr.length > 0 && arr.every(d => d >= 0 && d <= 6),
      message: 'Must have at least one valid day (0-6)'
    }
  },
  timezone: {
    type: String,
    default: 'America/New_York'
  },
  isEnabled: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient querying
scheduleRuleSchema.index({ familyId: 1, type: 1, isEnabled: 1 });

module.exports = mongoose.model('ScheduleRule', scheduleRuleSchema);
