const express = require('express');
const router = express.Router();
const leasesController = require('../controllers/leasesController');

router.get('/', leasesController.getLeases);
router.post('/', leasesController.createLease);

module.exports = router;
