const AllowanceTransaction = require('../models/AllowanceTransaction');
const User = require('../models/User');
const Family = require('../models/Family');

// Get allowance balance for a child
exports.getBalance = async (req, res) => {
  try {
    const childId = req.params.childId || req.user._id.toString();

    // If getting another user's balance, must be parent
    if (childId !== req.user._id.toString() && req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Not authorized to view this balance' });
    }

    // Verify child is in same family
    const child = await User.findOne({
      _id: childId,
      familyId: req.user.familyId
    });

    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }

    // Calculate balance and total earned
    const transactions = await AllowanceTransaction.find({
      childId,
      familyId: req.user.familyId
    });

    const totalEarned = transactions
      .filter(t => t.type === 'earned')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalPaidOut = transactions
      .filter(t => t.type === 'payout')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalSavingsDeposits = transactions
      .filter(t => t.type === 'savings_deposit')
      .reduce((sum, t) => sum + t.amount, 0);

    const balance = totalEarned - totalPaidOut - totalSavingsDeposits;

    res.json({
      childId,
      childName: child.name,
      totalEarned: parseFloat(totalEarned.toFixed(2)),
      totalPaidOut: parseFloat(totalPaidOut.toFixed(2)),
      balance: parseFloat(balance.toFixed(2)),
      savingsBalance: child.savingsBalance || 0,
      allowanceRate: child.allowanceRate
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get transaction history
exports.getTransactions = async (req, res) => {
  try {
    const childId = req.params.childId || req.user._id.toString();

    // If getting another user's transactions, must be parent
    if (childId !== req.user._id.toString() && req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Not authorized to view these transactions' });
    }

    const transactions = await AllowanceTransaction.find({
      childId,
      familyId: req.user.familyId
    })
      .populate('choreCompletionId')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(transactions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Record payout (parents only)
exports.recordPayout = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can record payouts' });
    }

    const { childId, amount, notes } = req.body;

    // Verify child is in same family
    const child = await User.findOne({
      _id: childId,
      familyId: req.user.familyId
    });

    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }

    // Check if child has sufficient balance
    const transactions = await AllowanceTransaction.find({
      childId,
      familyId: req.user.familyId
    });

    const currentBalance = transactions.reduce((sum, transaction) => {
      if (transaction.type === 'earned') return sum + transaction.amount;
      if (transaction.type === 'payout' || transaction.type === 'savings_deposit') return sum - transaction.amount;
      return sum;
    }, 0);

    if (currentBalance < amount) {
      return res.status(400).json({
        message: 'Insufficient balance',
        currentBalance: parseFloat(currentBalance.toFixed(2)),
        requestedAmount: amount
      });
    }

    // Create payout transaction
    const transaction = await AllowanceTransaction.create({
      childId,
      amount,
      type: 'payout',
      familyId: req.user.familyId,
      notes
    });

    const newBalance = currentBalance - amount;

    res.json({
      transaction,
      previousBalance: parseFloat(currentBalance.toFixed(2)),
      newBalance: parseFloat(newBalance.toFixed(2))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all children's balances (parents only)
exports.getAllBalances = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can view all balances' });
    }

    const children = await User.find({
      familyId: req.user.familyId,
      role: 'child'
    });

    const balances = await Promise.all(
      children.map(async (child) => {
        const transactions = await AllowanceTransaction.find({
          childId: child._id,
          familyId: req.user.familyId
        });

        const totalEarned = transactions
          .filter(t => t.type === 'earned')
          .reduce((sum, t) => sum + t.amount, 0);

        const totalPaidOut = transactions
          .filter(t => t.type === 'payout')
          .reduce((sum, t) => sum + t.amount, 0);

        const totalSavingsDeposits = transactions
          .filter(t => t.type === 'savings_deposit')
          .reduce((sum, t) => sum + t.amount, 0);

        const balance = totalEarned - totalPaidOut - totalSavingsDeposits;

        return {
          childId: child._id,
          childName: child.name,
          totalEarned: parseFloat(totalEarned.toFixed(2)),
          totalPaidOut: parseFloat(totalPaidOut.toFixed(2)),
          balance: parseFloat(balance.toFixed(2)),
          savingsBalance: child.savingsBalance || 0,
          allowanceRate: child.allowanceRate
        };
      })
    );

    res.json(balances);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Deposit to savings (children)
exports.depositSavings = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    const childId = req.user._id;

    // Calculate current balance
    const transactions = await AllowanceTransaction.find({
      childId,
      familyId: req.user.familyId
    });

    const currentBalance = transactions.reduce((sum, transaction) => {
      if (transaction.type === 'earned') return sum + transaction.amount;
      if (transaction.type === 'payout' || transaction.type === 'savings_deposit') return sum - transaction.amount;
      return sum;
    }, 0);

    if (currentBalance < amount) {
      return res.status(400).json({
        message: 'Insufficient balance',
        currentBalance: parseFloat(currentBalance.toFixed(2)),
        requestedAmount: amount
      });
    }

    // Calculate bonus minutes: for every $0.20 saved, add 5 minutes
    const bonusMinutes = Math.floor(amount / 0.20) * 5;

    // Create savings deposit transaction
    const transaction = await AllowanceTransaction.create({
      childId,
      amount,
      type: 'savings_deposit',
      familyId: req.user.familyId,
      bonusMinutes,
      notes: `Deposited $${amount.toFixed(2)} to savings (+${bonusMinutes} bonus minutes)`
    });

    // Update savingsBalance on user
    const child = await User.findById(childId);
    child.savingsBalance = (child.savingsBalance || 0) + amount;
    await child.save();

    const newBalance = currentBalance - amount;

    res.json({
      transaction,
      previousBalance: parseFloat(currentBalance.toFixed(2)),
      newBalance: parseFloat(newBalance.toFixed(2)),
      savingsBalance: child.savingsBalance,
      bonusMinutes
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Request withdrawal from savings (children)
exports.requestWithdrawal = async (req, res) => {
  try {
    const { amount, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    const child = await User.findById(req.user._id);
    const family = await Family.findById(req.user.familyId);

    if (!family) {
      return res.status(404).json({ message: 'Family not found' });
    }

    const minimumThreshold = family.minimumSavingsWithdrawal || 25;

    if ((child.savingsBalance || 0) < minimumThreshold) {
      return res.status(400).json({
        message: `Savings must be at least $${minimumThreshold.toFixed(2)} before you can withdraw`,
        savingsBalance: child.savingsBalance || 0,
        minimumRequired: minimumThreshold
      });
    }

    if (amount > (child.savingsBalance || 0)) {
      return res.status(400).json({
        message: 'Insufficient savings balance',
        savingsBalance: child.savingsBalance || 0,
        requestedAmount: amount
      });
    }

    const transaction = await AllowanceTransaction.create({
      childId: req.user._id,
      amount,
      type: 'savings_withdrawal',
      status: 'pending',
      familyId: req.user.familyId,
      notes: notes || `Withdrawal request: $${amount.toFixed(2)}`
    });

    res.status(201).json(transaction);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Request to spend from balance (children)
exports.requestSpend = async (req, res) => {
  try {
    const { amount, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    // Calculate current balance
    const transactions = await AllowanceTransaction.find({
      childId: req.user._id,
      familyId: req.user.familyId
    });

    const currentBalance = transactions.reduce((sum, transaction) => {
      if (transaction.type === 'earned') return sum + transaction.amount;
      if (transaction.type === 'payout' || transaction.type === 'savings_deposit') return sum - transaction.amount;
      return sum;
    }, 0);

    if (currentBalance < amount) {
      return res.status(400).json({
        message: 'Insufficient balance',
        currentBalance: parseFloat(currentBalance.toFixed(2)),
        requestedAmount: amount
      });
    }

    const transaction = await AllowanceTransaction.create({
      childId: req.user._id,
      amount,
      type: 'spend_request',
      status: 'pending',
      familyId: req.user.familyId,
      notes: notes || `Spend request: $${amount.toFixed(2)}`
    });

    res.status(201).json(transaction);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Approve a pending request (parents only)
exports.approveRequest = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can approve requests' });
    }

    const transaction = await AllowanceTransaction.findOne({
      _id: req.params.id,
      familyId: req.user.familyId,
      status: 'pending'
    });

    if (!transaction) {
      return res.status(404).json({ message: 'Pending request not found' });
    }

    if (transaction.type === 'savings_withdrawal') {
      // Deduct from savingsBalance
      const child = await User.findById(transaction.childId);
      if ((child.savingsBalance || 0) < transaction.amount) {
        return res.status(400).json({ message: 'Insufficient savings balance' });
      }
      child.savingsBalance = (child.savingsBalance || 0) - transaction.amount;
      await child.save();
    } else if (transaction.type === 'spend_request') {
      // Deduct from balance by creating a payout transaction
      const transactions = await AllowanceTransaction.find({
        childId: transaction.childId,
        familyId: req.user.familyId
      });

      const currentBalance = transactions.reduce((sum, t) => {
        if (t.type === 'earned') return sum + t.amount;
        if (t.type === 'payout' || t.type === 'savings_deposit') return sum - t.amount;
        return sum;
      }, 0);

      if (currentBalance < transaction.amount) {
        return res.status(400).json({ message: 'Insufficient balance' });
      }

      // Create a payout transaction to deduct the amount
      await AllowanceTransaction.create({
        childId: transaction.childId,
        amount: transaction.amount,
        type: 'payout',
        familyId: req.user.familyId,
        notes: `Approved spend: ${transaction.notes || ''}`
      });
    }

    transaction.status = 'approved';
    await transaction.save();

    res.json(transaction);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Quick approve a request from child's device using parent credentials
exports.quickApproveRequest = async (req, res) => {
  try {
    const { parentLogin, parentPassword } = req.body;

    if (!parentLogin || !parentPassword) {
      return res.status(400).json({ message: 'Parent credentials required' });
    }

    const login = parentLogin.toLowerCase().trim();
    const parent = await User.findOne({ email: login }) || await User.findOne({ username: login });

    if (!parent || parent.role !== 'parent') {
      return res.status(401).json({ message: 'Invalid parent credentials' });
    }

    if (!(await parent.comparePassword(parentPassword))) {
      return res.status(401).json({ message: 'Invalid parent credentials' });
    }

    if (parent.familyId.toString() !== req.user.familyId.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const transaction = await AllowanceTransaction.findOne({
      _id: req.params.id,
      familyId: req.user.familyId,
      status: 'pending'
    });

    if (!transaction) {
      return res.status(404).json({ message: 'Pending request not found' });
    }

    if (transaction.type === 'savings_withdrawal') {
      const child = await User.findById(transaction.childId);
      if ((child.savingsBalance || 0) < transaction.amount) {
        return res.status(400).json({ message: 'Insufficient savings balance' });
      }
      child.savingsBalance = (child.savingsBalance || 0) - transaction.amount;
      await child.save();
    } else if (transaction.type === 'spend_request') {
      const transactions = await AllowanceTransaction.find({
        childId: transaction.childId,
        familyId: req.user.familyId
      });

      const currentBalance = transactions.reduce((sum, t) => {
        if (t.type === 'earned') return sum + t.amount;
        if (t.type === 'payout' || t.type === 'savings_deposit') return sum - t.amount;
        return sum;
      }, 0);

      if (currentBalance < transaction.amount) {
        return res.status(400).json({ message: 'Insufficient balance' });
      }

      await AllowanceTransaction.create({
        childId: transaction.childId,
        amount: transaction.amount,
        type: 'payout',
        familyId: req.user.familyId,
        notes: `Approved spend: ${transaction.notes || ''}`
      });
    }

    transaction.status = 'approved';
    await transaction.save();

    res.json({ message: 'Request approved', transaction });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Reject a pending request (parents only)
exports.rejectRequest = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can reject requests' });
    }

    const transaction = await AllowanceTransaction.findOne({
      _id: req.params.id,
      familyId: req.user.familyId,
      status: 'pending'
    });

    if (!transaction) {
      return res.status(404).json({ message: 'Pending request not found' });
    }

    transaction.status = 'rejected';
    await transaction.save();

    res.json(transaction);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get pending requests for family
exports.getPendingRequests = async (req, res) => {
  try {
    const requests = await AllowanceTransaction.find({
      familyId: req.user.familyId,
      status: 'pending',
      type: { $in: ['savings_withdrawal', 'spend_request'] }
    })
      .populate('childId', 'name email username')
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update child's allowance rate (parents only)
exports.updateAllowanceRate = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Only parents can update allowance rates' });
    }

    const { childId, allowanceRate } = req.body;

    const child = await User.findOne({
      _id: childId,
      familyId: req.user.familyId,
      role: 'child'
    });

    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }

    child.allowanceRate = allowanceRate;
    await child.save();

    res.json({
      childId: child._id,
      childName: child.name,
      allowanceRate: child.allowanceRate
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
