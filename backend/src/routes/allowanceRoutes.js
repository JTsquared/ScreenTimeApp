const express = require('express');
const router = express.Router();
const allowanceController = require('../controllers/allowanceController');
const { protect, restrictTo } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Balance and transactions
router.get('/balance/:childId', allowanceController.getBalance);
router.get('/balance', allowanceController.getBalance); // Get own balance
router.get('/transactions/:childId', allowanceController.getTransactions);
router.get('/transactions', allowanceController.getTransactions); // Get own transactions

// Savings and spend requests (children)
router.post('/deposit-savings', restrictTo('child'), allowanceController.depositSavings);
router.post('/request-withdrawal', restrictTo('child'), allowanceController.requestWithdrawal);
router.post('/request-spend', restrictTo('child'), allowanceController.requestSpend);

// Pending requests
router.get('/pending-requests', allowanceController.getPendingRequests);

// Parent only routes
router.post('/payout', restrictTo('parent'), allowanceController.recordPayout);
router.post('/approve-request/:id', restrictTo('parent'), allowanceController.approveRequest);
router.post('/quick-approve-request/:id', allowanceController.quickApproveRequest);
router.post('/reject-request/:id', restrictTo('parent'), allowanceController.rejectRequest);
router.get('/all-balances', restrictTo('parent'), allowanceController.getAllBalances);
router.put('/rate', restrictTo('parent'), allowanceController.updateAllowanceRate);

module.exports = router;
