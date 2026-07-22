const { invalidateDashboardCache } = require('../lib/cache');
const auditService = require('./auditService');
const transactionsService = require('./transactionsService');

const PROPERTY_INVOICES_QUERY = `
  SELECT i.id, i.lease_id, i.due_date, i.amount_due, i.late_fee, i.status,
         i.transfer_id, i.created_at, i.paid_at,
         l.rent_amount, l.start_date AS lease_start, l.end_date AS lease_end, l.status AS lease_status,
         t.name AS tenant_name, u.unit_number
  FROM invoices i
  JOIN leases l ON i.lease_id = l.id
  JOIN tenants t ON l.tenant_id = t.id
  JOIN units u ON l.unit_id = u.id
  WHERE u.property_id = $1
  ORDER BY i.due_date DESC
`;

/**
 * Atomically updates invoice status in database using its transfer_id identifier.
 * Records an audit log entry (before/after state) inside the same transaction,
 * so the status change and its audit trail commit or roll back together.
 * @param {object} pool
 * @param {string} transferId
 * @param {string} newStatus
 * @param {{reason?: string, user_id?: string, ip_address?: string}} context
 */
async function updateInvoiceStatus(pool, transferId, newStatus, context = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Secure ROW locks for the targeted update transaction
    const selectRes = await client.query(
      'SELECT * FROM invoices WHERE transfer_id = $1 FOR UPDATE',
      [transferId]
    );

    if (selectRes.rows.length === 0) {
      throw new Error(`Invoice with transfer_id ${transferId} not found`);
    }

    const oldInvoice = selectRes.rows[0];

    const updateRes = await client.query(
      'UPDATE invoices SET status = $1 WHERE id = $2 RETURNING *',
      [newStatus, oldInvoice.id]
    );
    const newInvoice = updateRes.rows[0];

    await auditService.log(client, {
      entity_type: 'invoice',
      entity_id: newInvoice.id,
      action: 'update',
      before: oldInvoice,
      after: newInvoice,
      reason: context.reason || 'webhook:transfer_status_update',
      user_id: context.user_id || null,
      ip_address: context.ip_address || null,
    });

    await client.query('COMMIT');
    invalidateDashboardCache();
    return newInvoice;
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
async function addInvoiceItem(pool, invoiceId, { description, amount }, context = {}) {
  const invoiceRes = await pool.query('SELECT status FROM invoices WHERE id = $1', [invoiceId]);
  if (invoiceRes.rows.length === 0) return { ok: false, error: 'Invoice not found' };
  if (invoiceRes.rows[0].status === 'paid') return { ok: false, error: 'Cannot add items to a paid invoice' };

  const res = await pool.query(
    `INSERT INTO invoice_items (invoice_id, description, amount) VALUES ($1, $2, $3) RETURNING id`,
    [invoiceId, description, amount]
  );
  const itemId = res.rows[0].id;

  await auditService.log(pool, {
    entity_type: 'invoice',
    entity_id: invoiceId,
    action: 'update',
    after: { item_action: 'add', item_id: itemId, description, amount },
    reason: context.reason || 'api:add_item',
    user_id: context.user_id || null,
    ip_address: context.ip_address || null,
  });

  invalidateDashboardCache();
  return { ok: true, id: itemId };
}

/**
 * Removes an invoice item. Blocked once the invoice is paid, for the same
 * reason additions are blocked.
 */
async function deleteInvoiceItem(pool, invoiceId, itemId, context = {}) {
  const invoiceRes = await pool.query('SELECT status FROM invoices WHERE id = $1', [invoiceId]);
  if (invoiceRes.rows.length === 0) return { ok: false, error: 'Invoice not found' };
  if (invoiceRes.rows[0].status === 'paid') return { ok: false, error: 'Cannot remove items from a paid invoice' };

  const res = await pool.query(
    'DELETE FROM invoice_items WHERE id = $1 AND invoice_id = $2 RETURNING id, description, amount',
    [itemId, invoiceId]
  );

  if (res.rows.length > 0) {
    await auditService.log(pool, {
      entity_type: 'invoice',
      entity_id: invoiceId,
      action: 'update',
      before: { item_action: 'delete', item: res.rows[0] },
      reason: context.reason || 'api:delete_item',
      user_id: context.user_id || null,
      ip_address: context.ip_address || null,
    });
  }

  invalidateDashboardCache();
  return { ok: res.rows.length > 0 };
}

/**
 * Fetches every invoice tied to a property's leases (across all its units),
 * scoped to the requesting owner so one landlord can't read another's data.
 * Returns null if the property doesn't exist or isn't owned by ownerId —
 * the caller turns that into a 404, rather than a leaked empty list.
 */
async function getInvoicesForProperty(dbPool, ownerId, propertyId) {
  const propRes = await dbPool.query(
    'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
    [propertyId, ownerId]
  );
  if (propRes.rows.length === 0) return null;

  const res = await dbPool.query(PROPERTY_INVOICES_QUERY, [propertyId]);
  return res.rows;
}

async function invoiceOwnedBy(pool, invoiceId, ownerId) {
  const res = await pool.query(
    `SELECT i.id FROM invoices i
       JOIN leases l ON i.lease_id = l.id
       JOIN units u ON l.unit_id = u.id
       JOIN properties p ON u.property_id = p.id
      WHERE i.id = $1 AND p.owner_id = $2`,
    [invoiceId, ownerId]
  );
  return res.rows.length > 0;
}

/**
 * Marks one invoice paid: ownership check, row lock, status update, audit log,
 * and ledger transaction insert, all in one DB transaction. Returns a
 * discriminated result rather than throwing for expected failure cases, so
 * callers (single-invoice and batch) can each decide how to surface them.
 */
async function markInvoicePaid(pool, ownerId, invoiceId, context = {}) {
  const owned = await invoiceOwnedBy(pool, invoiceId, ownerId);
  if (!owned) return { ok: false, error: 'not_owned' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const invoiceRes = await client.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
    if (invoiceRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'not_found' };
    }
    const oldInvoice = invoiceRes.rows[0];

    if (oldInvoice.status === 'paid') {
      await client.query('ROLLBACK');
      return { ok: false, error: 'already_paid' };
    }

    const updateRes = await client.query(
      "UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = $1 RETURNING *",
      [invoiceId]
    );
    const newInvoice = updateRes.rows[0];

    await auditService.log(client, {
      entity_type: 'invoice',
      entity_id: invoiceId,
      action: 'update',
      before: oldInvoice,
      after: newInvoice,
      reason: context.reason || 'api:mark_paid',
      user_id: context.user_id || null,
      ip_address: context.ip_address || null,
    });

    const ctx = await client.query(
      `SELECT i.amount_due, i.late_fee, t.id AS tenant_id, t.name AS tenant_name, t.email AS tenant_email,
              p.owner_id, u.property_id, p.entity_id,
              (SELECT COALESCE(SUM(amount), 0) FROM invoice_items WHERE invoice_id = i.id) AS items_total
         FROM invoices i
         JOIN leases l ON i.lease_id = l.id
         JOIN tenants t ON l.tenant_id = t.id
         JOIN units u ON l.unit_id = u.id
         JOIN properties p ON u.property_id = p.id
        WHERE i.id = $1`,
      [invoiceId]
    );
    const paidCtx = ctx.rows[0];
    const totalPaid = paidCtx
      ? parseFloat(paidCtx.amount_due) + parseFloat(paidCtx.late_fee || 0) + parseFloat(paidCtx.items_total || 0)
      : 0;

    if (paidCtx) {
      await transactionsService.insertRentReceived(client, {
        ownerId: paidCtx.owner_id,
        invoiceId,
        propertyId: paidCtx.property_id,
        entityId: paidCtx.entity_id,
        amount: totalPaid,
        date: new Date().toISOString().split('T')[0],
        paymentMethod: context.payment_method || null,
      });
    }

    await client.query('COMMIT');

    return {
      ok: true,
      invoice: newInvoice,
      emailCtx: paidCtx ? {
        ownerId: paidCtx.owner_id,
        tenantId: paidCtx.tenant_id,
        tenantName: paidCtx.tenant_name,
        tenantEmail: paidCtx.tenant_email,
        totalPaid,
      } : null,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  updateInvoiceStatus,
  addInvoiceItem,
  deleteInvoiceItem,
  getInvoicesForProperty,
  markInvoicePaid,
};
