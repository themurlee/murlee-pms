const cron = require('node-cron');
const pool = require('../config/db');
const billingService = require('../services/billingService');

// Runs the billing cycle once a day at 08:00 server time: generate due invoices,
// assess late fees, send rent reminders. Only meaningful against a real DB, so
// app.js starts this only when DATABASE_URL is set.
function startScheduler() {
  cron.schedule('0 8 * * *', async () => {
    try {
      const summary = await billingService.runDailyCycle(pool, new Date());
      console.log('[scheduler] daily cycle:', summary);
    } catch (err) {
      console.error('[scheduler] daily cycle failed:', err.message);
    }
  });
  console.log('Billing scheduler started (daily 08:00).');
}

module.exports = { startScheduler };
