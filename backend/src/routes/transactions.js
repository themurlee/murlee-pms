const express = require('express');
const router = express.Router();
const transactionsController = require('../controllers/transactionsController');

router.get('/', transactionsController.getTransactions);
router.post('/', transactionsController.createTransaction);
router.patch('/:id', transactionsController.updateTransaction);
router.delete('/:id', transactionsController.deleteTransaction);

module.exports = router;
