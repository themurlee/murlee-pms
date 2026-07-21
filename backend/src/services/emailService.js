const pool = require('../config/db');

// Transport priority: Gmail (nodemailer) > Resend > log-only. Gmail reuses the
// same GMAIL_USER/GMAIL_APP_PASSWORD env vars the inbound IMAP poller uses, so
// setting up one Gmail App Password lights up both send and receive. A failed
// email is logged, never thrown back into the caller (a broken email must not
// break a payment/status write).
let gmailTransporter = null;
if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  const nodemailer = require('nodemailer');
  gmailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

let resendClient = null;
if (process.env.RESEND_API_KEY) {
  const { Resend } = require('resend');
  resendClient = new Resend(process.env.RESEND_API_KEY);
}

const FROM = process.env.RESEND_FROM || 'Murlee PMS <onboarding@resend.dev>';

async function deliver(to, subject, html) {
  if (!to) return { status: 'failed', error: 'No recipient email' };

  if (gmailTransporter) {
    try {
      const info = await gmailTransporter.sendMail({ from: process.env.GMAIL_USER, to, subject, html });
      return { status: 'sent', messageId: info.messageId };
    } catch (err) {
      return { status: 'failed', error: err.message };
    }
  }

  if (!resendClient) {
    console.log(`[EMAIL log-only] to=${to} subject="${subject}"`);
    return { status: 'logged' };
  }
  try {
    const { data, error } = await resendClient.emails.send({ from: FROM, to, subject, html });
    if (error) return { status: 'failed', error: error.message || String(error) };
    return { status: 'sent', messageId: data?.id };
  } catch (err) {
    return { status: 'failed', error: err.message };
  }
}

async function logNotice(row) {
  if (!process.env.DATABASE_URL) return;
  try {
    await pool.query(
      `INSERT INTO notices (owner_id, tenant_id, invoice_id, ticket_id, type, channel, to_email, subject, body, status, error)
       VALUES ($1, $2, $3, $4, $5, 'email', $6, $7, $8, $9, $10)`,
      [row.ownerId, row.tenantId || null, row.invoiceId || null, row.ticketId || null,
       row.type, row.to, row.subject, row.html, row.status, row.error || null]
    );
  } catch (err) {
    console.error('Failed to record notice:', err.message);
  }
}

/**
 * Sends an email (or logs it) and records it in the notices history.
 * @param {object} n { ownerId, tenantId?, invoiceId?, ticketId?, type, to, subject, html }
 * @returns {Promise<{status: string, error?: string}>}
 */
async function sendNotice(n) {
  const result = await deliver(n.to, n.subject, n.html);
  await logNotice({ ...n, status: result.status, error: result.error });
  return result;
}

module.exports = { sendNotice, deliver };
