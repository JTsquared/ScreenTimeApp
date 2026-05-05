const express = require('express');
const router = express.Router();
const choreController = require('../controllers/choreController');
const { protect, restrictTo } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Chore CRUD
router.get('/', choreController.getChores);
router.post('/', restrictTo('parent'), choreController.createChore);
router.put('/:id', restrictTo('parent'), choreController.updateChore);
router.delete('/:id', restrictTo('parent'), choreController.deleteChore);

// Chore completion
router.post('/:id/complete', choreController.completeChore);
router.get('/completions/pending', restrictTo('parent'), choreController.getPendingCompletions);
router.get('/completions/my', choreController.getMyCompletions);
router.post('/completions/:id/approve', restrictTo('parent'), choreController.approveCompletion);
router.post('/completions/:id/quick-approve', choreController.quickApprove);
router.post('/completions/:id/reject', restrictTo('parent'), choreController.rejectCompletion);

// Screen time
router.get('/screen-time/available', choreController.getAvailableScreenTime);

module.exports = router;
