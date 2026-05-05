const mongoose = require('mongoose');

const allowanceTransactionSchema = new mongoose.Schema({
  childId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['earned', 'payout', 'savings_deposit', 'savings_withdrawal', 'spend_request'],
    required: true
  },
  status: {
    type: String,
    enum: ['completed', 'pending', 'approved', 'rejected'],
    default: 'completed'
  },
  bonusMinutes: {
    type: Number,
    default: 0
  },
  choreCompletionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChoreCompletion'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    trim: true
  },
  familyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Family',
    required: true,
    index: true
  }
});

module.exports = mongoose.model('AllowanceTransaction', allowanceTransactionSchema);
