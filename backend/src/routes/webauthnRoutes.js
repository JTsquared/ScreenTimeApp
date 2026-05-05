const express = require('express');
const router = express.Router();
const webauthnController = require('../controllers/webauthnController');
const { protect } = require('../middleware/auth');

// Registration endpoints — require authentication
router.post('/register-options', protect, webauthnController.registerOptions);
router.post('/register-verify', protect, webauthnController.registerVerify);

// Authentication endpoints — public (no auth needed)
router.post('/auth-options', webauthnController.authOptions);
router.post('/auth-verify', webauthnController.authVerify);

module.exports = router;
