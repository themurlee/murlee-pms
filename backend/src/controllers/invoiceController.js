const pool = require('../config/db');
const { invalidateDashboardCache } = require('../lib/cache');
const { sendNotice } = require('../services/emailService');
const transactionsService = require('../services/transactionsService');

// Helper to determine invoice state
const getInvoiceState = (invoice) => {
  const isPaid = invoice.status === 'paid';
  const isSettling = invoice.status === 'processing'; // in-flight ACH transfer, not late
  const isOverdue = !isPaid && !isSettling && new Date() > new Date(invoice.due_date);

  return {
    ...invoice,
    status: isOverdue ? 'overdue' : invoice.status,
    actions: {
      can_mark_as_paid: !isPaid,
      can_edit: !isPaid,
      can_delete: !isPaid
    },
    view_modes: ['payment_timeline', 'invoice_breakdown']
  };
};

async function getInvoices(req, res) {
  try {
    // If mock database is active, return mock invoices
    if (!process.env.DATABASE_URL) {
      const mockInvoices = [
        {
          id: 'INV-001',
          lease_id: 'L-101',
          due_date: '2026-07-01',
          amount_due: 1400.00,
          late_fee: 0.00,
          status: 'unpaid',
          transfer_id: 'tx_123',
          created_at: new Date().toISOString(),
          paid_at: null,
          property_nickname: 'Oakridge Manor',
          tenant_name: 'Jane Doe',
          unit_number: '101',
          lease_start: '2026-01-01',
          lease_end: '2026-12-31',
          lease_status: 'active',
          actions: { can_mark_as_paid: true, can_edit: true, can_delete: true },
          active_view: 'payment_timeline',
          timeline: [
            { timestamp: new Date().toISOString(), event: 'Invoice created', description: 'Scheduled monthly rent invoice generated.' }
          ],
          breakdown: { base_rent: 1400, late_fee: 0, total_due: 1400, payment_method: 'ACH - Plaid' }
        },
        {
          id: 'INV-002',
          lease_id: 'L-102',
          due_date: '2026-06-01',
          amount_due: 1350.00,
          late_fee: 50.00,
          status: 'overdue',
          transfer_id: 'tx_456',
          created_at: new Date().toISOString(),
          paid_at: null,
          property_nickname: 'Pacific Breeze',
          tenant_name: 'John Smith',
          unit_number: '4',
          lease_start: '2025-02-15',
          lease_end: '2027-02-14',
          lease_status: 'active',
          actions: { can_mark_as_paid: true, can_edit: true, can_delete: true },
          active_view: 'payment_timeline',
          timeline: [
            { timestamp: new Date().toISOString(), event: 'Invoice created', description: 'Scheduled monthly rent invoice generated.' },
            { timestamp: new Date().toISOString(), event: 'Late fee applied', description: '$50 late penalty assessed.' }
          ],
          breakdown: { base_rent: 1350, late_fee: 50, total_due: 1400, payment_method: 'ACH - Plaid' }
        },
        {
          id: 'INV-003',
          lease_id: 'L-103',
          due_date: '2026-07-01',
          amount_due: 1500.00,
          late_fee: 0.00,
          status: 'processing',
          transfer_id: 'tx_789',
          created_at: new Date().toISOString(),
          paid_at: null,
          property_nickname: 'Oakridge Manor',
          tenant_name: 'Alice Cooper',
          unit_number: '102',
          lease_start: '2026-03-01',
          lease_end: '2027-02-28',
          lease_status: 'active',
          actions: { can_mark_as_paid: false, can_edit: false, can_delete: false },
          active_view: 'payment_timeline',
          timeline: [
            { timestamp: new Date().toISOString(), event: 'Invoice created', description: 'Scheduled monthly rent invoice generated.' },
            { timestamp: new Date().toISOString(), event: 'ACH transfer initiated', description: 'Plaid transfer submitted, awaiting bank clearance.' }
          ],
          breakdown: { base_rent: 1500, late_fee: 0, total_due: 1500, payment_method: 'ACH - Plaid' }
        }
      ];
      return res.json(mockInvoices);
    }

    const result = await pool.query(
      `SELECT i.*, l.rent_amount, l.start_date AS lease_start, l.end_date AS lease_end, l.status AS lease_status,
              t.name as tenant_name, u.unit_number, p.nickname AS property_nickname
       FROM invoices i
       JOIN leases l ON i.lease_id = l.id
       JOIN tenants t ON l.tenant_id = t.id
       JOIN units u ON l.unit_id = u.id
       JOIN properties p ON u.property_id = p.id
       ORDER BY i.due_date DESC`
    );

    const formattedInvoices = result.rows.map(row => {
      const baseInvoice = {
        id: row.id,
        lease_id: row.lease_id,
        due_date: row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : row.due_date,
        amount_due: parseFloat(row.amount_due),
        late_fee: parseFloat(row.late_fee || 0),
        status: row.status,
        transfer_id: row.transfer_id,
        created_at: row.created_at,
        paid_at: row.paid_at,
        tenant_name: row.tenant_name,
        unit_number: row.unit_number,
        property_nickname: row.property_nickname,
        lease_start: row.lease_start instanceof Date ? row.lease_start.toISOString().split('T')[0] : row.lease_start,
        lease_end: row.lease_end instanceof Date ? row.lease_end.toISOString().split('T')[0] : row.lease_end,
        lease_status: row.lease_status,
        timeline: [
          { timestamp: row.created_at, event: 'Invoice created', description: 'Generated automatically from lease terms.' }
        ],
        breakdown: {
          base_rent: parseFloat(row.rent_amount),
          late_fee: parseFloat(row.late_fee || 0),
          total_due: parseFloat(row.amount_due) + parseFloat(row.late_fee || 0),
          payment_method: 'ACH - Plaid'
        }
      };

      if (row.status === 'paid') {
        baseInvoice.timeline.push({
          timestamp: new Date().toISOString(),
          event: 'Payment cleared',
          description: 'Cleared atomically via Plaid ledger sync.'
        });
      }

      return getInvoiceState(baseInvoice);
    });

    res.json(formattedInvoices);
  } catch (error) {
    console.error('Failed to get invoices:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function markPaid(req, res) {
  const { id } = req.params;
  
  if (!process.env.DATABASE_URL) {
    return res.json({ message: 'Mock invoice marked as paid' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const invoiceRes = await client.query('SELECT status FROM invoices WHERE id = $1 FOR UPDATE', [id]);
    if (invoiceRes.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    await client.query(
      "UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = $1",
      [id]
    );

    // Gather tenant + owner context for the confirmation email before committing.
    const ctx = await client.query(
      `SELECT i.amount_due, t.id AS tenant_id, t.name AS tenant_name, t.email AS tenant_email,
              p.owner_id, u.property_id, p.entity_id
       FROM invoices i
       JOIN leases l ON i.lease_id = l.id
       JOIN tenants t ON l.tenant_id = t.id
       JOIN units u ON l.unit_id = u.id
       JOIN properties p ON u.property_id = p.id
       WHERE i.id = $1`,
      [id]
    );

    // Post the rent income into the ledger inside the same transaction (idempotent).
    const paidCtx = ctx.rows[0];
    if (paidCtx) {
      await transactionsService.insertRentReceived(client, {
        ownerId: paidCtx.owner_id,
        invoiceId: id,
        propertyId: paidCtx.property_id,
        entityId: paidCtx.entity_id,
        amount: parseFloat(paidCtx.amount_due),
        date: new Date().toISOString().split('T')[0],
        paymentMethod: req.body.payment_method || null,
      });
    }

    await client.query('COMMIT');
    invalidateDashboardCache();

    // Fire-and-forget: a failed email must not fail the payment.
    const c = ctx.rows[0];
    if (c) {
      sendNotice({
        ownerId: c.owner_id, tenantId: c.tenant_id, invoiceId: id, type: 'payment_confirmation',
        to: c.tenant_email, subject: 'Payment received — thank you',
        html: `<p>Hi ${c.tenant_name},</p><p>We've recorded your rent payment of <strong>$${Number(c.amount_due).toFixed(2)}</strong>. Thank you!</p><p>Murlee PMS</p>`,
      }).catch((e) => console.error('Payment confirmation email failed:', e.message));
    }

    res.json({ message: 'Invoice marked as paid successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to mark paid:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    client.release();
  }
}

async function deleteInvoice(req, res) {
  const { id } = req.params;
  
  if (!process.env.DATABASE_URL) {
    return res.json({ message: 'Mock invoice deleted' });
  }

  try {
    const result = await pool.query('DELETE FROM invoices WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    invalidateDashboardCache();
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Failed to delete invoice:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = {
  getInvoices,
  markPaid,
  deleteInvoice
};
