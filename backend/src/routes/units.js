const express = require('express');
const router = express.Router();
const unitsController = require('../controllers/unitsController');

router.get('/', unitsController.getUnits);

module.exports = router;
