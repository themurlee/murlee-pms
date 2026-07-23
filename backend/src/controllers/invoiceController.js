const pool = require('../config/db');
const { invalidateDashboardCache } = require('../lib/cache');
const { sendNotice } = require('../services/emailService');
const invoiceService = require('../services/invoiceService');
const auditService = require('../services/auditService');
const { getInvoiceState } = require('../utils/invoiceState');
const { bucketInvoicesByDueDate } = require('../utils/dateBuckets');

// Mock-mode only: real persistence lives in the invoice_items table.
const mockInvoiceItems = {
  'INV-001': [],
  'INV-002': [{ id: 'item-1', description: 'Pet Fee', amount: 50 }],
  'INV-003': [],
};

// Mock-mode only: stand-in for the invoices table when no DATABASE_URL is set.
// Shared by getInvoices and getInvoicesByProperty so both endpoints behave
// consistently in mock mode.
const mockInvoices = [
  {
    id: 'INV-001',
    lease_id: 'L-101',
    property_id: 'p1',
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
    items: mockInvoiceItems['INV-001'],
    breakdown: { base_rent: 1400, late_fee: 0, items_total: 0, total_due: 1400, payment_method: 'ACH - Plaid' }
  },
  {
    id: 'INV-002',
    lease_id: 'L-102',
    property_id: 'p2',
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
    items: mockInvoiceItems['INV-002'],
    breakdown: { base_rent: 1350, late_fee: 50, items_total: 50, total_due: 1450, payment_method: 'ACH - Plaid' }
  },
  {
    id: 'INV-003',
    lease_id: 'L-103',
    property_id: 'p1',
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
    items: mockInvoiceItems['INV-003'],
    breakdown: { base_rent: 1500, late_fee: 0, items_total: 0, total_due: 1500, payment_method: 'ACH - Plaid' }
  }
];

async function getInvoices(req, res) {
  try {
    // If mock database is active, return mock invoices
    if (!process.env.DATABASE_URL) {
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

    const invoiceIds = result.rows.map(row => row.id);
    const itemsByInvoice = {};
    if (invoiceIds.length > 0) {
      const itemsRes = await pool.query(
        `SELECT id, invoice_id, description, amount FROM invoice_items WHERE invoice_id = ANY($1) ORDER BY created_at`,
        [invoiceIds]
      );
      for (const item of itemsRes.rows) {
        (itemsByInvoice[item.invoice_id] ||= []).push({
          id: item.id, description: item.description, amount: parseFloat(item.amount),
        });
      }
    }

    const formattedInvoices = result.rows.map(row => {
      const items = itemsByInvoice[row.id] || [];
      const itemsTotal = items.reduce((sum, it) => sum + it.amount, 0);
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
        items,
        breakdown: {
          base_rent: parseFloat(row.rent_amount),
          late_fee: parseFloat(row.late_fee || 0),
          items_total: itemsTotal,
          total_due: parseFloat(row.amount_due) + parseFloat(row.late_fee || 0) + itemsTotal,
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

// Shapes one raw joined invoice row (property-query or mock) into the
// response format, then layers on the derived status/action flags.
function formatPropertyInvoiceRow(row) {
  return getInvoiceState({
    id: row.id,
    lease_id: row.lease_id,
    tenant_name: row.tenant_name,
    unit_number: row.unit_number,
    due_date: row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : row.due_date,
    base_rent: parseFloat(row.rent_amount ?? row.base_rent ?? 0),
    amount_due: parseFloat(row.amount_due),
    late_fee: parseFloat(row.late_fee || 0),
    status: row.status,
    paid_at: row.paid_at,
    lease_start: row.lease_start instanceof Date ? row.lease_start.toISOString().split('T')[0] : row.lease_start,
    lease_end: row.lease_end instanceof Date ? row.lease_end.toISOString().split('T')[0] : row.lease_end,
    lease_status: row.lease_status,
  });
}

// Invoices for one property (across all its units), bucketed into the
// current month, the previous month, and the full history spanning every
// lease's start-to-end duration on that property — feeds the Properties
// drilldown's payment history view.
async function getInvoicesByProperty(req, res) {
  const { propertyId } = req.params;

  try {
    if (!process.env.DATABASE_URL) {
      const rows = mockInvoices.filter((inv) => inv.property_id === propertyId);
      const full_lease_history = rows.map(formatPropertyInvoiceRow);
      const { current_month, previous_month } = bucketInvoicesByDueDate(full_lease_history);
      return res.json({ property_id: propertyId, current_month, previous_month, full_lease_history });
    }

    const rows = await invoiceService.getInvoicesForProperty(pool, req.user.id, propertyId);
    if (rows === null) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const full_lease_history = rows.map(formatPropertyInvoiceRow);
    const { current_month, previous_month } = bucketInvoicesByDueDate(full_lease_history);
    res.json({ property_id: propertyId, current_month, previous_month, full_lease_history });
  } catch (error) {
    console.error('Failed to get property invoices:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function markPaid(req, res) {
  const { id } = req.params;

  if (!process.env.DATABASE_URL) {
    return res.json({ message: 'Mock invoice marked as paid' });
  }

  try {
    const result = await invoiceService.markInvoicePaid(pool, req.user.id, id, {
      reason: 'api:mark_paid',
      user_id: req.user?.id || null,
      ip_address: req.ip || null,
      payment_method: req.body.payment_method || null,
    });

    if (!result.ok) {
      if (result.error === 'already_paid') {
        return res.status(409).json({ error: 'Invoice is already paid' });
      }
      return res.status(404).json({ error: 'Invoice not found' });
    }

    invalidateDashboardCache();

    if (result.emailCtx) {
      sendNotice({
        ownerId: result.emailCtx.ownerId, tenantId: result.emailCtx.tenantId, invoiceId: id, type: 'payment_confirmation',
        to: result.emailCtx.tenantEmail, subject: 'Payment received — thank you',
        html: `<p>Hi ${result.emailCtx.tenantName},</p><p>We've recorded your rent payment of <strong>$${result.emailCtx.totalPaid.toFixed(2)}</strong>. Thank you!</p><p>Murlee PMS</p>`,
      }).catch((e) => console.error('Payment confirmation email failed:', e.message));
    }

    res.json({ message: 'Invoice marked as paid successfully' });
  } catch (error) {
    console.error('Failed to mark paid:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

const BATCH_ERROR_MESSAGES = {
  not_found: 'Invoice not found',
  not_owned: 'Invoice not found or not owned by this account',
  already_paid: 'Invoice is already paid',
};

async function batchMarkPaid(req, res) {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }

  if (!process.env.DATABASE_URL) {
    return res.json({ success_count: ids.length, error_count: 0, results: ids.map((id) => ({ id, ok: true })) });
  }

  const results = [];
  let success_count = 0;
  let error_count = 0;

  for (const id of ids) {
    try {
      const result = await invoiceService.markInvoicePaid(pool, req.user.id, id, {
        reason: 'api:batch_mark_paid',
        user_id: req.user?.id || null,
        ip_address: req.ip || null,
      });

      if (!result.ok) {
        error_count += 1;
        results.push({ id, ok: false, error: BATCH_ERROR_MESSAGES[result.error] || result.error });
        continue;
      }

      if (result.emailCtx) {
        sendNotice({
          ownerId: result.emailCtx.ownerId, tenantId: result.emailCtx.tenantId, invoiceId: id, type: 'payment_confirmation',
          to: result.emailCtx.tenantEmail, subject: 'Payment received — thank you',
          html: `<p>Hi ${result.emailCtx.tenantName},</p><p>We've recorded your rent payment of <strong>$${result.emailCtx.totalPaid.toFixed(2)}</strong>. Thank you!</p><p>Murlee PMS</p>`,
        }).catch((e) => console.error('Payment confirmation email failed:', e.message));
      }

      success_count += 1;
      results.push({ id, ok: true });
    } catch (error) {
      console.error(`Failed to mark invoice ${id} paid:`, error);
      error_count += 1;
      results.push({ id, ok: false, error: 'Internal error' });
    }
  }

  invalidateDashboardCache();

  res.json({ success_count, error_count, results });
}

async function deleteInvoice(req, res) {
  const { id } = req.params;

  if (!process.env.DATABASE_URL) {
    return res.json({ message: 'Mock invoice deleted' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query('DELETE FROM invoices WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    await auditService.log(client, {
      entity_type: 'invoice',
      entity_id: id,
      action: 'delete',
      before: result.rows[0],
      after: null,
      reason: 'api:delete_invoice',
      user_id: req.user?.id || null,
      ip_address: req.ip || null,
    });

    await client.query('COMMIT');
    invalidateDashboardCache();
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to delete invoice:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    client.release();
  }
}

async function addInvoiceItem(req, res) {
  const { id } = req.params;
  const { description, amount } = req.body;
  if (!description || !description.trim() || amount === undefined || Number.isNaN(Number(amount))) {
    return res.status(400).json({ error: 'description and amount are required' });
  }

  if (!process.env.DATABASE_URL) {
    const items = mockInvoiceItems[id];
    if (!items) return res.status(404).json({ error: 'Invoice not found' });
    const item = { id: `item-${Date.now()}`, description: description.trim(), amount: Number(amount) };
    items.push(item);
    return res.status(201).json(item);
  }

  try {
    const result = await invoiceService.addInvoiceItem(pool, id, { description: description.trim(), amount: Number(amount) }, {
      reason: 'api:add_item', user_id: req.user?.id || null, ip_address: req.ip || null,
    });
    if (!result.ok) return res.status(result.error === 'Invoice not found' ? 404 : 409).json({ error: result.error });
    invalidateDashboardCache();
    res.status(201).json({ id: result.id });
  } catch (error) {
    console.error('Failed to add invoice item:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function deleteInvoiceItem(req, res) {
  const { id, itemId } = req.params;

  if (!process.env.DATABASE_URL) {
    const items = mockInvoiceItems[id];
    if (!items) return res.status(404).json({ error: 'Invoice not found' });
    mockInvoiceItems[id] = items.filter((it) => it.id !== itemId);
    return res.json({ message: 'Mock invoice item deleted' });
  }

  try {
    const result = await invoiceService.deleteInvoiceItem(pool, id, itemId, {
      reason: 'api:delete_item', user_id: req.user?.id || null, ip_address: req.ip || null,
    });
    if (!result.ok) {
      if (result.error) return res.status(result.error === 'Invoice not found' ? 404 : 409).json({ error: result.error });
      return res.status(404).json({ error: 'Item not found' });
    }
    invalidateDashboardCache();
    res.json({ message: 'Invoice item deleted successfully' });
  } catch (error) {
    console.error('Failed to delete invoice item:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = {
  getInvoices,
  getInvoicesByProperty,
  markPaid,
  batchMarkPaid,
  deleteInvoice,
  addInvoiceItem,
  deleteInvoiceItem,
};
