const pool = require('../config/db');
const { invalidateDashboardCache } = require('../lib/cache');

/**
 * Atomically updates invoice status in database using its transfer_id identifier
 * @param {string} transferId 
 * @param {string} newStatus 
 */
async function updateInvoiceStatus(transferId, newStatus) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Secure ROW locks for the targeted update transaction
    const selectRes = await client.query(
      'SELECT id FROM invoices WHERE transfer_id = $1 FOR UPDATE',
      [transferId]
    );

    if (selectRes.rows.length === 0) {
      throw new Error(`Invoice with transfer_id ${transferId} not found`);
    }

    const invoiceId = selectRes.rows[0].id;

    await client.query(
      'UPDATE invoices SET status = $1 WHERE id = $2',
      [newStatus, invoiceId]
    );

    await client.query('COMMIT');
    invalidateDashboardCache();
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Adds an ad hoc named charge to an invoice (e.g. "Pet Fee"). Blocked once the
 * invoice is paid — a closed invoice's total shouldn't change after the fact.
 */
async function addInvoiceItem(pool, invoiceId, { description, amount }) {
  const invoiceRes = await pool.query('SELECT status FROM invoices WHERE id = $1', [invoiceId]);
  if (invoiceRes.rows.length === 0) return { ok: false, error: 'Invoice not found' };
  if (invoiceRes.rows[0].status === 'paid') return { ok: false, error: 'Cannot add items to a paid invoice' };

  const res = await pool.query(
    `INSERT INTO invoice_items (invoice_id, description, amount) VALUES ($1, $2, $3) RETURNING id`,
    [invoiceId, description, amount]
  );
  invalidateDashboardCache();
  return { ok: true, id: res.rows[0].id };
}

/**
 * Removes an invoice item. Blocked once the invoice is paid, for the same
 * reason additions are blocked.
 */
async function deleteInvoiceItem(pool, invoiceId, itemId) {
  const invoiceRes = await pool.query('SELECT status FROM invoices WHERE id = $1', [invoiceId]);
  if (invoiceRes.rows.length === 0) return { ok: false, error: 'Invoice not found' };
  if (invoiceRes.rows[0].status === 'paid') return { ok: false, error: 'Cannot remove items from a paid invoice' };

  const res = await pool.query(
    'DELETE FROM invoice_items WHERE id = $1 AND invoice_id = $2',
    [itemId, invoiceId]
  );
  invalidateDashboardCache();
  return { ok: res.rowCount > 0 };
}

module.exports = {
  updateInvoiceStatus,
  addInvoiceItem,
  deleteInvoiceItem,
};
