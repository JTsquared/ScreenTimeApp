const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect, restrictTo } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

router.get('/family', userController.getFamilyMembers);
router.put('/change-password', userController.changePassword);
router.put('/:id/reset-password', restrictTo('parent'), userController.resetMemberPassword);
router.put('/:id', userController.updateProfile);
router.delete('/:id', restrictTo('parent'), userController.deleteUser);

module.exports = router;
