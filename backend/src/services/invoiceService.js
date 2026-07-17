const pool = require('../config/db');

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
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  updateInvoiceStatus,
};
