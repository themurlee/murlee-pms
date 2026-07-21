const pool = require('../config/db');
const billingSettingsService = require('../services/billingSettingsService');
const billingService = require('../services/billingService');
const { invalidateDashboardCache } = require('../lib/cache');

let mockSettings = {
  late_fee_amount: 50, late_fee_grace_days: 5, reminder_days_before: 3,
  late_fee_enabled: true, reminders_enabled: true,
};

async function getSettings(req, res) {
  if (!process.env.DATABASE_URL) {
    return res.json(mockSettings);
  }
  try {
    res.json(await billingSettingsService.getSettings(req.user.id));
  } catch (error) {
    console.error('Failed to get billing settings:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function updateSettings(req, res) {
  const body = req.body;

  if (!process.env.DATABASE_URL) {
    mockSettings = { ...mockSettings, ...body };
    return res.json(mockSettings);
  }
  try {
    res.json(await billingSettingsService.updateSettings(req.user.id, body));
  } catch (error) {
    console.error('Failed to update billing settings:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function runCycle(req, res) {
  if (!process.env.DATABASE_URL) {
    return res.json({ generated: 0, lateFees: 0, reminders: 0, note: 'Mock mode — no persistence. Connect DATABASE_URL to run the real cycle.' });
  }
  try {
    const summary = await billingService.runDailyCycle(pool, new Date());
    invalidateDashboardCache();
    res.json(summary);
  } catch (error) {
    console.error('Failed to run billing cycle:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { getSettings, updateSettings, runCycle };
