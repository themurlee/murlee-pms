const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');

router.get('/settings', billingController.getSettings);
router.put('/settings', billingController.updateSettings);
router.post('/run', billingController.runCycle);

module.exports = router;
