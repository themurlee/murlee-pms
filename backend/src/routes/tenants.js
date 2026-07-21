const express = require('express');
const router = express.Router();
const tenantsController = require('../controllers/tenantsController');

router.get('/', tenantsController.getTenants);
router.post('/', tenantsController.createTenant);
router.put('/:id', tenantsController.updateTenant);
router.delete('/:id', tenantsController.deleteTenant);

module.exports = router;
