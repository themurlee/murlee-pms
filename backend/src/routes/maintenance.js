const express = require('express');
const router = express.Router();
const maintenanceController = require('../controllers/maintenanceController');

router.get('/', maintenanceController.getTickets);
router.post('/', maintenanceController.createTicket);
router.post('/inbound', maintenanceController.inboundEmail);
router.put('/:id/status', maintenanceController.updateTicketStatus);

module.exports = router;
