const express = require('express');
const router = express.Router();
const familyController = require('../controllers/familyController');
const { protect, restrictTo } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

router.get('/settings', familyController.getSettings);
router.put('/settings', restrictTo('parent'), familyController.updateSettings);
router.post('/regenerate-invite', restrictTo('parent'), familyController.regenerateInviteCode);

module.exports = router;
