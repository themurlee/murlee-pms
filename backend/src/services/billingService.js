const { sendNotice } = require('./emailService');

// --- date helpers (UTC to match DATE columns) ---
const firstOfMonth = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const daysInMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
const iso = (d) => d.toISOString().split('T')[0];

function dueDateFor(date, dueDay) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = Math.min(dueDay, daysInMonth(year, month)); // clamp e.g. due_day 31 in Feb
  return new Date(Date.UTC(year, month, day));
}

const money = (n) => `$${Number(n).toFixed(2)}`;

// --- email bodies ---
const reminderHtml = (tenant, inv) =>
  `<p>Hi ${tenant},</p><p>This is a friendly reminder that rent of <strong>${money(inv.amount_due)}</strong> is due on <strong>${inv.due_date}</strong>.</p><p>Thank you,<br/>Murlee PMS</p>`;
const lateHtml = (tenant, inv, fee) =>
  `<p>Hi ${tenant},</p><p>Our records show rent of <strong>${money(inv.amount_due)}</strong> due on <strong>${inv.due_date}</strong> is past due. A late fee of <strong>${money(fee)}</strong> has been applied.</p><p>Please arrange payment at your earliest convenience.</p><p>Murlee PMS</p>`;

/**
 * Create this month's invoice for every active lease whose due_day falls on `date`.
 * Idempotent via UNIQUE(lease_id, billing_period). Returns count created.
 */
async function generateInvoicesForDate(pool, date) {
  const dayOfMonth = date.getUTCDate();
  const period = iso(firstOfMonth(date));

  const leases = await pool.query(
    `SELECT id, rent_amount, due_day FROM leases WHERE status = 'active' AND due_day = $1`,
    [dayOfMonth]
  );

  let created = 0;
  for (const lease of leases.rows) {
    const dueDate = iso(dueDateFor(date, lease.due_day));
    const res = await pool.query(
      `INSERT INTO invoices (lease_id, due_date, amount_due, billing_period, status)
       VALUES ($1, $2, $3, $4, 'unpaid')
       ON CONFLICT (lease_id, billing_period) DO NOTHING
       RETURNING id`,
      [lease.id, dueDate, lease.rent_amount, period]
    );
    if (res.rows.length > 0) created += 1;
  }
  return created;
}

// Join used by both late-fee and reminder passes to reach tenant + owner.
const INVOICE_CONTEXT = `
  SELECT i.id, i.amount_due, i.due_date, i.late_fee, i.late_fee_waived, i.late_fee_applied_at, i.status,
         t.id AS tenant_id, t.name AS tenant_name, t.email AS tenant_email,
         p.owner_id
  FROM invoices i
  JOIN leases l ON i.lease_id = l.id
  JOIN tenants t ON l.tenant_id = t.id
  JOIN units u ON l.unit_id = u.id
  JOIN properties p ON u.property_id = p.id
`;

/**
 * Apply the configured late fee to unpaid invoices past their grace period
 * (once each, tracked by late_fee_applied_at) and email the tenant a late notice.
 */
async function assessLateFees(pool, date, settings) {
  const graceCutoff = new Date(date);
  graceCutoff.setUTCDate(graceCutoff.getUTCDate() - settings.late_fee_grace_days);

  const rows = (await pool.query(
    `${INVOICE_CONTEXT}
     WHERE i.status IN ('unpaid', 'overdue')
       AND i.late_fee_waived = FALSE
       AND i.late_fee_applied_at IS NULL
       AND i.due_date < $1`,
    [iso(graceCutoff)]
  )).rows;

  let applied = 0;
  for (const inv of rows) {
    await pool.query(
      `UPDATE invoices SET late_fee = $1, late_fee_applied_at = CURRENT_TIMESTAMP, status = 'overdue' WHERE id = $2`,
      [settings.late_fee_amount, inv.id]
    );
    applied += 1;
    await sendNotice({
      ownerId: inv.owner_id, tenantId: inv.tenant_id, invoiceId: inv.id, type: 'late_notice',
      to: inv.tenant_email, subject: `Rent past due — late fee applied`,
      html: lateHtml(inv.tenant_name, inv, settings.late_fee_amount),
    });
  }
  return applied;
}

/**
 * Email a rent reminder for unpaid invoices due exactly `reminder_days_before` from `date`.
 */
async function sendReminders(pool, date, settings) {
  const target = new Date(date);
  target.setUTCDate(target.getUTCDate() + settings.reminder_days_before);

  const rows = (await pool.query(
    `${INVOICE_CONTEXT} WHERE i.status = 'unpaid' AND i.due_date = $1`,
    [iso(target)]
  )).rows;

  let sent = 0;
  for (const inv of rows) {
    await sendNotice({
      ownerId: inv.owner_id, tenantId: inv.tenant_id, invoiceId: inv.id, type: 'rent_reminder',
      to: inv.tenant_email, subject: `Rent reminder — due ${inv.due_date}`,
      html: reminderHtml(inv.tenant_name, inv),
    });
    sent += 1;
  }
  return sent;
}

const DEFAULT_SETTINGS = {
  late_fee_amount: 50, late_fee_grace_days: 5, reminder_days_before: 3,
  late_fee_enabled: true, reminders_enabled: true,
};

async function loadSettings(pool) {
  const res = await pool.query('SELECT * FROM billing_settings LIMIT 1');
  return res.rows[0] || DEFAULT_SETTINGS;
}

/**
 * The full daily cycle: generate invoices, assess late fees, send reminders.
 * Called by the scheduler and by POST /api/billing/run. Returns a summary.
 */
async function runDailyCycle(pool, date = new Date()) {
  const settings = await loadSettings(pool);
  const generated = await generateInvoicesForDate(pool, date);
  const lateFees = settings.late_fee_enabled ? await assessLateFees(pool, date, settings) : 0;
  const reminders = settings.reminders_enabled ? await sendReminders(pool, date, settings) : 0;
  return { generated, lateFees, reminders };
}

module.exports = {
  generateInvoicesForDate,
  assessLateFees,
  sendReminders,
  runDailyCycle,
  loadSettings,
  DEFAULT_SETTINGS,
};
