const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');
const { protect, restrictTo } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Device CRUD
router.get('/', deviceController.getDevices);
router.post('/', restrictTo('parent'), deviceController.registerDevice);
router.put('/:id', restrictTo('parent'), deviceController.updateDevice);
router.delete('/:id', restrictTo('parent'), deviceController.deleteDevice);

// Sessions
router.get('/sessions/my', deviceController.getMySessions);

// Device control
router.post('/:id/enable', deviceController.enableDevice);
router.post('/:id/disable', restrictTo('parent'), deviceController.disableDevice);
router.get('/:id/status', deviceController.getDeviceStatus);

module.exports = router;
