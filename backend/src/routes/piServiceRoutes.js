const express = require('express');
const router = express.Router();
const piServiceController = require('../controllers/piServiceController');
const { verifyPiService } = require('../middleware/auth');

// All routes require Pi service API key
router.use(verifyPiService);

router.get('/commands', piServiceController.getPendingCommands);
router.put('/commands/:id/status', piServiceController.updateCommandStatus);
router.get('/devices', piServiceController.getDevicesForPi);
router.post('/check-expired', piServiceController.checkExpiredSessions);

module.exports = router;
