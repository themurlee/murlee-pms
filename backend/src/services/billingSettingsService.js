const pool = require('../config/db');
const { DEFAULT_SETTINGS } = require('./billingService');

function format(row) {
  return {
    late_fee_amount: parseFloat(row.late_fee_amount),
    late_fee_grace_days: row.late_fee_grace_days,
    reminder_days_before: row.reminder_days_before,
    late_fee_enabled: row.late_fee_enabled,
    reminders_enabled: row.reminders_enabled,
  };
}

async function getSettings(ownerId) {
  const res = await pool.query('SELECT * FROM billing_settings WHERE owner_id = $1', [ownerId]);
  if (res.rows.length === 0) {
    // Lazily create the row from defaults so the UI always has something to edit.
    const created = await pool.query(
      `INSERT INTO billing_settings (owner_id) VALUES ($1) RETURNING *`,
      [ownerId]
    );
    return format(created.rows[0]);
  }
  return format(res.rows[0]);
}

async function updateSettings(ownerId, s) {
  const res = await pool.query(
    `INSERT INTO billing_settings (owner_id, late_fee_amount, late_fee_grace_days, reminder_days_before, late_fee_enabled, reminders_enabled)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (owner_id) DO UPDATE SET
       late_fee_amount = EXCLUDED.late_fee_amount,
       late_fee_grace_days = EXCLUDED.late_fee_grace_days,
       reminder_days_before = EXCLUDED.reminder_days_before,
       late_fee_enabled = EXCLUDED.late_fee_enabled,
       reminders_enabled = EXCLUDED.reminders_enabled
     RETURNING *`,
    [ownerId, s.late_fee_amount, s.late_fee_grace_days, s.reminder_days_before, s.late_fee_enabled, s.reminders_enabled]
  );
  return format(res.rows[0]);
}

module.exports = { getSettings, updateSettings, DEFAULT_SETTINGS };
