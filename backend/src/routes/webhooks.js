const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const invoiceService = require('../services/invoiceService');

router.post('/plaid', async (req, res) => {
  const { webhook_type, webhook_code, item_id } = req.body;

  try {
    switch (webhook_type) {
      case 'TRANSFER':
        await handleTransferWebhook(req.body);
        break;
      
      case 'ITEM':
        if (webhook_code === 'ITEM_LOGIN_REQUIRED') {
          console.warn(`Plaid token expired for item: ${item_id}. Re-authentication required.`);
        }
        break;

      default:
        console.log(`Unhandled webhook type: ${webhook_type}`);
    }

    res.status(200).send('Webhook Received');
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

async function handleTransferWebhook(payload) {
  const { transfer_id, event_type } = payload;
  
  if (event_type === 'TRANSFER_STATUS_UPDATE') {
    const statusMap = {
      'posted': 'paid',
      'failed': 'overdue',
      'pending': 'processing'
    };

    const newStatus = statusMap[payload.status];
    if (newStatus) {
      await invoiceService.updateInvoiceStatus(pool, transfer_id, newStatus, {
        reason: `webhook:transfer_${payload.status}`,
      });
    }
  }
}

module.exports = router;
module.exports.handleTransferWebhook = handleTransferWebhook;
