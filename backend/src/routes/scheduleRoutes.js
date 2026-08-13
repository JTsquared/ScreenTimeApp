const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/scheduleController');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect);

router.get('/', scheduleController.getRules);
router.get('/status', scheduleController.getActiveStatus);
router.post('/', restrictTo('parent'), scheduleController.createRule);
router.put('/:id', restrictTo('parent'), scheduleController.updateRule);
router.delete('/:id', restrictTo('parent'), scheduleController.deleteRule);

module.exports = router;
