const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');

router.get('/', invoiceController.getInvoices);
router.post('/:id/mark-paid', invoiceController.markPaid);
router.delete('/:id', invoiceController.deleteInvoice);
router.post('/:id/items', invoiceController.addInvoiceItem);
router.delete('/:id/items/:itemId', invoiceController.deleteInvoiceItem);

module.exports = router;
