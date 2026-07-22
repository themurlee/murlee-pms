jest.mock('../src/config/db', () => ({ connect: jest.fn(), query: jest.fn() }));
jest.mock('../src/services/emailService', () => ({ sendNotice: jest.fn().mockResolvedValue({ status: 'logged' }) }));
jest.mock('../src/services/invoiceService', () => ({
  ...jest.requireActual('../src/services/invoiceService'),
  markInvoicePaid: jest.fn(),
}));

const invoiceController = require('../src/controllers/invoiceController');
const pool = require('../src/config/db');
const emailService = require('../src/services/emailService');
const invoiceService = require('../src/services/invoiceService');

function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

describe('invoiceController.getInvoicesByProperty (mock mode)', () => {
  let originalDatabaseUrl;

  beforeEach(() => {
    // Force the mock-data branch regardless of the host shell's env.
    originalDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (originalDatabaseUrl !== undefined) process.env.DATABASE_URL = originalDatabaseUrl;
  });

  test('buckets a property\'s invoices into current_month, previous_month, and full_lease_history', async () => {
    const req = { params: { propertyId: 'p1' }, user: { id: 'owner-1' } };
    const res = makeRes();

    await invoiceController.getInvoicesByProperty(req, res);

    expect(res.body.property_id).toBe('p1');
    // p1 owns mock invoices INV-001 (due 2026-07-01) and INV-003 (due 2026-07-01).
    expect(res.body.full_lease_history).toHaveLength(2);
    expect(res.body.full_lease_history.map((i) => i.id).sort()).toEqual(['INV-001', 'INV-003']);
  });

  test('every invoice in the response carries computed status and action flags', async () => {
    const req = { params: { propertyId: 'p2' }, user: { id: 'owner-1' } };
    const res = makeRes();

    await invoiceController.getInvoicesByProperty(req, res);

    expect(res.body.full_lease_history).toHaveLength(1);
    const invoice = res.body.full_lease_history[0];
    expect(invoice.actions).toEqual({ can_mark_as_paid: true, can_edit: true, can_delete: true });
    expect(invoice).toHaveProperty('base_rent');
    expect(invoice).toHaveProperty('late_fee');
    expect(invoice).toHaveProperty('due_date');
  });

  test('returns empty buckets for a property with no matching mock invoices', async () => {
    const req = { params: { propertyId: 'does-not-exist' }, user: { id: 'owner-1' } };
    const res = makeRes();

    await invoiceController.getInvoicesByProperty(req, res);

    expect(res.body).toEqual({
      property_id: 'does-not-exist',
      current_month: [],
      previous_month: [],
      full_lease_history: [],
    });
  });
});

describe('invoiceController.markPaid (real DB mode)', () => {
  let originalDatabaseUrl;

  beforeEach(() => {
    originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://test';
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  test('delegates to invoiceService.markInvoicePaid with the owner id and request context', async () => {
    invoiceService.markInvoicePaid.mockResolvedValue({
      ok: true,
      invoice: { id: 'inv-1', status: 'paid' },
      emailCtx: { ownerId: 'owner-1', tenantId: 't1', tenantName: 'Jane', tenantEmail: 'jane@example.com', totalPaid: 1400 },
    });

    const req = { params: { id: 'inv-1' }, body: {}, user: { id: 'owner-1' }, ip: '1.2.3.4' };
    const res = makeRes();

    await invoiceController.markPaid(req, res);

    expect(invoiceService.markInvoicePaid).toHaveBeenCalledWith(pool, 'owner-1', 'inv-1', {
      reason: 'api:mark_paid', user_id: 'owner-1', ip_address: '1.2.3.4', payment_method: null,
    });
    expect(res.body).toEqual({ message: 'Invoice marked as paid successfully' });
  });

  test('sends a payment confirmation email on success', async () => {
    invoiceService.markInvoicePaid.mockResolvedValue({
      ok: true,
      invoice: { id: 'inv-1', status: 'paid' },
      emailCtx: { ownerId: 'owner-1', tenantId: 't1', tenantName: 'Jane', tenantEmail: 'jane@example.com', totalPaid: 1400 },
    });

    const req = { params: { id: 'inv-1' }, body: {}, user: { id: 'owner-1' }, ip: '1.2.3.4' };
    await invoiceController.markPaid(req, makeRes());

    expect(emailService.sendNotice).toHaveBeenCalledWith(expect.objectContaining({
      to: 'jane@example.com', type: 'payment_confirmation', invoiceId: 'inv-1',
    }));
  });

  test('returns 404 when the service reports not_found', async () => {
    invoiceService.markInvoicePaid.mockResolvedValue({ ok: false, error: 'not_found' });
    const req = { params: { id: 'missing' }, body: {}, user: { id: 'owner-1' }, ip: '1.2.3.4' };
    const res = makeRes();

    await invoiceController.markPaid(req, res);

    expect(res.statusCode).toBe(404);
    expect(emailService.sendNotice).not.toHaveBeenCalled();
  });

  test('returns 404 when the service reports not_owned', async () => {
    invoiceService.markInvoicePaid.mockResolvedValue({ ok: false, error: 'not_owned' });
    const req = { params: { id: 'inv-1' }, body: {}, user: { id: 'owner-1' }, ip: '1.2.3.4' };
    const res = makeRes();

    await invoiceController.markPaid(req, res);

    expect(res.statusCode).toBe(404);
  });

  test('returns 409 when the service reports already_paid', async () => {
    invoiceService.markInvoicePaid.mockResolvedValue({ ok: false, error: 'already_paid' });
    const req = { params: { id: 'inv-1' }, body: {}, user: { id: 'owner-1' }, ip: '1.2.3.4' };
    const res = makeRes();

    await invoiceController.markPaid(req, res);

    expect(res.statusCode).toBe(409);
  });
});

describe('invoiceController.deleteInvoice (real DB mode)', () => {
  let originalDatabaseUrl;

  beforeEach(() => {
    originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://test';
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  function makeFakeClient(deletedRow) {
    const calls = [];
    const client = {
      calls,
      query: jest.fn(async (text, params) => {
        calls.push({ text, params });
        if (/DELETE FROM invoices WHERE id = \$1 RETURNING \*/.test(text)) {
          return { rows: deletedRow ? [deletedRow] : [] };
        }
        if (/INSERT INTO audit_logs/.test(text)) {
          return { rows: [{ id: 'audit-1' }] };
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    return client;
  }

  test('records an audit log entry with the deleted invoice as "before" state', async () => {
    const deletedRow = { id: 'inv-1', status: 'unpaid', amount_due: '1400.00' };
    const client = makeFakeClient(deletedRow);
    pool.connect.mockResolvedValue(client);

    const req = { params: { id: 'inv-1' }, user: { id: 'owner-1' }, ip: '1.2.3.4' };
    const res = makeRes();

    await invoiceController.deleteInvoice(req, res);

    expect(res.body).toEqual({ message: 'Invoice deleted successfully' });

    const audit = client.calls.find((c) => /INSERT INTO audit_logs/.test(c.text));
    expect(audit).toBeDefined();
    expect(audit.params[1]).toBe('inv-1');
    expect(audit.params[2]).toBe('delete');
    expect(JSON.parse(audit.params[3])).toEqual(deletedRow);
    expect(audit.params[4]).toBeNull();
  });

  test('returns 404 and does not audit-log when the invoice does not exist', async () => {
    const client = makeFakeClient(null);
    pool.connect.mockResolvedValue(client);

    const req = { params: { id: 'missing' }, user: { id: 'owner-1' }, ip: '1.2.3.4' };
    const res = makeRes();

    await invoiceController.deleteInvoice(req, res);

    expect(res.statusCode).toBe(404);
    expect(client.calls.some((c) => /INSERT INTO audit_logs/.test(c.text))).toBe(false);
  });
});
