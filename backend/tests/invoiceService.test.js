const invoiceService = require('../src/services/invoiceService');

function makeFakePool(statusRows, insertOrDeleteResult) {
  const calls = [];
  return {
    calls,
    query: async (text, params) => {
      calls.push({ text, params });
      if (/SELECT status FROM invoices/.test(text)) return { rows: statusRows };
      return insertOrDeleteResult;
    },
  };
}

describe('invoiceService.addInvoiceItem', () => {
  test('inserts an item when the invoice exists and is unpaid', async () => {
    const pool = makeFakePool([{ status: 'unpaid' }], { rows: [{ id: 'item-1' }] });
    const result = await invoiceService.addInvoiceItem(pool, 'inv-1', { description: 'Pet Fee', amount: 50 });
    expect(result).toEqual({ ok: true, id: 'item-1' });
    const insert = pool.calls.find((c) => /INSERT INTO invoice_items/.test(c.text));
    expect(insert.params).toEqual(['inv-1', 'Pet Fee', 50]);
  });

  test('records an audit log entry for the added item', async () => {
    const pool = makeFakePool([{ status: 'unpaid' }], { rows: [{ id: 'item-1' }] });
    await invoiceService.addInvoiceItem(pool, 'inv-1', { description: 'Pet Fee', amount: 50 }, {
      reason: 'api:add_item', user_id: 'owner-1', ip_address: '1.2.3.4',
    });

    const audit = pool.calls.find((c) => /INSERT INTO audit_logs/.test(c.text));
    expect(audit).toBeDefined();
    expect(audit.params[0]).toBe('invoice');
    expect(audit.params[1]).toBe('inv-1');
    expect(audit.params[2]).toBe('update');
    expect(JSON.parse(audit.params[4])).toEqual({ item_action: 'add', item_id: 'item-1', description: 'Pet Fee', amount: 50 });
    expect(audit.params[5]).toBe('api:add_item');
    expect(audit.params[6]).toBe('owner-1');
    expect(audit.params[7]).toBe('1.2.3.4');
  });

  test('does not audit-log when blocked (paid invoice)', async () => {
    const pool = makeFakePool([{ status: 'paid' }], { rows: [] });
    await invoiceService.addInvoiceItem(pool, 'inv-1', { description: 'Pet Fee', amount: 50 });
    expect(pool.calls.some((c) => /INSERT INTO audit_logs/.test(c.text))).toBe(false);
  });

  test('blocks adding an item to a paid invoice', async () => {
    const pool = makeFakePool([{ status: 'paid' }], { rows: [] });
    const result = await invoiceService.addInvoiceItem(pool, 'inv-1', { description: 'Pet Fee', amount: 50 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/paid invoice/i);
    expect(pool.calls.some((c) => /INSERT INTO invoice_items/.test(c.text))).toBe(false);
  });

  test('returns not-found when the invoice does not exist', async () => {
    const pool = makeFakePool([], { rows: [] });
    const result = await invoiceService.addInvoiceItem(pool, 'missing', { description: 'x', amount: 1 });
    expect(result).toEqual({ ok: false, error: 'Invoice not found' });
  });
});

describe('invoiceService.deleteInvoiceItem', () => {
  test('deletes when the invoice is unpaid', async () => {
    const pool = makeFakePool(
      [{ status: 'unpaid' }],
      { rowCount: 1, rows: [{ id: 'item-1', description: 'Pet Fee', amount: 50 }] }
    );
    const result = await invoiceService.deleteInvoiceItem(pool, 'inv-1', 'item-1');
    expect(result).toEqual({ ok: true });
  });

  test('blocks deleting an item from a paid invoice', async () => {
    const pool = makeFakePool([{ status: 'paid' }], { rowCount: 1, rows: [] });
    const result = await invoiceService.deleteInvoiceItem(pool, 'inv-1', 'item-1');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/paid invoice/i);
  });

  test('returns not found when no row matched the delete', async () => {
    const pool = makeFakePool([{ status: 'unpaid' }], { rowCount: 0, rows: [] });
    const result = await invoiceService.deleteInvoiceItem(pool, 'inv-1', 'missing-item');
    expect(result).toEqual({ ok: false });
  });

  test('records an audit log entry with the deleted item as "before" state', async () => {
    const pool = makeFakePool(
      [{ status: 'unpaid' }],
      { rowCount: 1, rows: [{ id: 'item-1', description: 'Pet Fee', amount: 50 }] }
    );
    await invoiceService.deleteInvoiceItem(pool, 'inv-1', 'item-1', {
      reason: 'api:delete_item', user_id: 'owner-1', ip_address: '1.2.3.4',
    });

    const audit = pool.calls.find((c) => /INSERT INTO audit_logs/.test(c.text));
    expect(audit).toBeDefined();
    expect(audit.params[1]).toBe('inv-1');
    expect(audit.params[2]).toBe('update');
    expect(JSON.parse(audit.params[3])).toEqual({
      item_action: 'delete', item: { id: 'item-1', description: 'Pet Fee', amount: 50 },
    });
    expect(audit.params[4]).toBeNull();
  });

  test('does not audit-log when blocked (paid invoice)', async () => {
    const pool = makeFakePool([{ status: 'paid' }], { rowCount: 1, rows: [] });
    await invoiceService.deleteInvoiceItem(pool, 'inv-1', 'item-1');
    expect(pool.calls.some((c) => /INSERT INTO audit_logs/.test(c.text))).toBe(false);
  });
});

describe('invoiceService.getInvoicesForProperty', () => {
  function makePropertyPool({ ownsProperty, invoiceRows }) {
    const calls = [];
    return {
      calls,
      query: async (text, params) => {
        calls.push({ text, params });
        if (/FROM properties/.test(text)) {
          return { rows: ownsProperty ? [{ id: params[0] }] : [] };
        }
        return { rows: invoiceRows };
      },
    };
  }

  test('returns null when the property does not exist or is not owned by this owner', async () => {
    const pool = makePropertyPool({ ownsProperty: false, invoiceRows: [] });
    const result = await invoiceService.getInvoicesForProperty(pool, 'owner-1', 'prop-1');
    expect(result).toBeNull();
    // Ownership check must short-circuit — no invoice query should run.
    expect(pool.calls).toHaveLength(1);
  });

  test('scopes the ownership check to both property id and owner id', async () => {
    const pool = makePropertyPool({ ownsProperty: true, invoiceRows: [] });
    await invoiceService.getInvoicesForProperty(pool, 'owner-1', 'prop-1');
    const ownershipCall = pool.calls.find((c) => /FROM properties/.test(c.text));
    expect(ownershipCall.params).toEqual(['prop-1', 'owner-1']);
  });

  test('returns joined invoice rows scoped to the property when owned', async () => {
    const invoiceRows = [
      { id: 'inv-1', lease_id: 'lease-1', due_date: '2026-07-01', amount_due: '1400.00', late_fee: '0.00', status: 'unpaid' },
    ];
    const pool = makePropertyPool({ ownsProperty: true, invoiceRows });
    const result = await invoiceService.getInvoicesForProperty(pool, 'owner-1', 'prop-1');
    expect(result).toEqual(invoiceRows);
    const invoiceCall = pool.calls.find((c) => /FROM invoices/.test(c.text));
    expect(invoiceCall.params).toEqual(['prop-1']);
    expect(invoiceCall.text).toMatch(/WHERE u\.property_id = \$1/);
  });
});

describe('invoiceService.updateInvoiceStatus', () => {
  // A fake transactional pool: pool.connect() hands back a client whose
  // .query() is scripted to answer the SELECT ... FOR UPDATE and the
  // UPDATE ... RETURNING * in sequence.
  function makeFakeTransactionalPool({ oldInvoice, newInvoice }) {
    const calls = [];
    let released = false;
    const client = {
      query: async (text, params) => {
        calls.push({ text, params });
        if (/SELECT \* FROM invoices WHERE transfer_id/.test(text)) {
          return { rows: oldInvoice ? [oldInvoice] : [] };
        }
        if (/UPDATE invoices SET status/.test(text)) {
          return { rows: [newInvoice] };
        }
        if (/INSERT INTO audit_logs/.test(text)) {
          return { rows: [{ id: 'audit-1' }] };
        }
        return { rows: [] };
      },
      release: () => { released = true; },
    };
    return {
      calls,
      isReleased: () => released,
      connect: async () => client,
    };
  }

  test('updates status and records an audit log entry inside the same transaction', async () => {
    const oldInvoice = { id: 'inv-1', transfer_id: 'tx_123', status: 'processing' };
    const newInvoice = { id: 'inv-1', transfer_id: 'tx_123', status: 'paid' };
    const pool = makeFakeTransactionalPool({ oldInvoice, newInvoice });

    const result = await invoiceService.updateInvoiceStatus(pool, 'tx_123', 'paid');

    expect(result).toEqual(newInvoice);
    expect(pool.calls.some((c) => c.text === 'BEGIN')).toBe(true);
    expect(pool.calls.some((c) => c.text === 'COMMIT')).toBe(true);

    const audit = pool.calls.find((c) => /INSERT INTO audit_logs/.test(c.text));
    expect(audit).toBeDefined();
    expect(audit.params[0]).toBe('invoice');
    expect(audit.params[1]).toBe('inv-1');
    expect(audit.params[2]).toBe('update');
    expect(JSON.parse(audit.params[3])).toEqual(oldInvoice);
    expect(JSON.parse(audit.params[4])).toEqual(newInvoice);
    expect(pool.isReleased()).toBe(true);
  });

  test('defaults reason to webhook:transfer_status_update when no context given', async () => {
    const oldInvoice = { id: 'inv-1', transfer_id: 'tx_123', status: 'processing' };
    const newInvoice = { id: 'inv-1', transfer_id: 'tx_123', status: 'paid' };
    const pool = makeFakeTransactionalPool({ oldInvoice, newInvoice });

    await invoiceService.updateInvoiceStatus(pool, 'tx_123', 'paid');

    const audit = pool.calls.find((c) => /INSERT INTO audit_logs/.test(c.text));
    expect(audit.params[5]).toBe('webhook:transfer_status_update');
    expect(audit.params[6]).toBeNull();
  });

  test('uses reason/user_id/ip_address from context when provided', async () => {
    const oldInvoice = { id: 'inv-1', transfer_id: 'tx_123', status: 'processing' };
    const newInvoice = { id: 'inv-1', transfer_id: 'tx_123', status: 'paid' };
    const pool = makeFakeTransactionalPool({ oldInvoice, newInvoice });

    await invoiceService.updateInvoiceStatus(pool, 'tx_123', 'paid', {
      reason: 'api:patch', user_id: 'owner-1', ip_address: '1.2.3.4',
    });

    const audit = pool.calls.find((c) => /INSERT INTO audit_logs/.test(c.text));
    expect(audit.params[5]).toBe('api:patch');
    expect(audit.params[6]).toBe('owner-1');
    expect(audit.params[7]).toBe('1.2.3.4');
  });

  test('rolls back and releases the client when the transfer_id is not found', async () => {
    const pool = makeFakeTransactionalPool({ oldInvoice: null, newInvoice: null });

    await expect(invoiceService.updateInvoiceStatus(pool, 'missing', 'paid')).rejects.toThrow(/not found/);

    expect(pool.calls.some((c) => c.text === 'ROLLBACK')).toBe(true);
    expect(pool.isReleased()).toBe(true);
    expect(pool.calls.some((c) => /INSERT INTO audit_logs/.test(c.text))).toBe(false);
  });
});

describe('invoiceService.markInvoicePaid', () => {
  function makeFakePool({ owned = true, invoiceRow } = {}) {
    const calls = [];
    let released = false;
    const client = {
      query: async (text, params) => {
        calls.push({ text, params, viaClient: true });
        if (/SELECT \* FROM invoices WHERE id = \$1 FOR UPDATE/.test(text)) {
          return { rows: invoiceRow ? [invoiceRow] : [] };
        }
        if (/UPDATE invoices SET status = 'paid'/.test(text)) {
          return { rows: [{ ...invoiceRow, status: 'paid', paid_at: '2026-07-22T00:00:00.000Z' }] };
        }
        if (/FROM invoices i\s+JOIN leases/.test(text)) {
          return {
            rows: [{
              amount_due: '1400.00', late_fee: '0.00', tenant_id: 't1', tenant_name: 'Jane',
              tenant_email: 'jane@example.com', owner_id: 'owner-1', property_id: 'p1',
              entity_id: null, items_total: '0',
            }],
          };
        }
        if (/SELECT id FROM transactions WHERE invoice_id/.test(text)) return { rows: [] };
        if (/INSERT INTO transactions/.test(text)) return { rows: [{ id: 'tx-1' }] };
        if (/INSERT INTO audit_logs/.test(text)) return { rows: [{ id: 'audit-1' }] };
        return { rows: [] };
      },
      release: () => { released = true; },
    };

    return {
      calls,
      isReleased: () => released,
      query: async (text, params) => {
        calls.push({ text, params });
        if (/WHERE i\.id = \$1 AND p\.owner_id = \$2/.test(text)) {
          return { rows: owned ? [{ id: params[0] }] : [] };
        }
        return { rows: [] };
      },
      connect: async () => client,
    };
  }

  test('rejects when the invoice is not owned by this account, without opening a transaction', async () => {
    const pool = makeFakePool({ owned: false });
    const result = await invoiceService.markInvoicePaid(pool, 'owner-1', 'inv-1');

    expect(result).toEqual({ ok: false, error: 'not_owned' });
    expect(pool.calls.some((c) => c.viaClient)).toBe(false);
  });

  test('returns not_found when the invoice does not exist', async () => {
    const pool = makeFakePool({ owned: true, invoiceRow: null });
    const result = await invoiceService.markInvoicePaid(pool, 'owner-1', 'inv-1');

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(pool.calls.some((c) => c.text === 'ROLLBACK')).toBe(true);
    expect(pool.isReleased()).toBe(true);
  });

  test('returns already_paid without re-updating when the invoice is already paid', async () => {
    const pool = makeFakePool({ owned: true, invoiceRow: { id: 'inv-1', status: 'paid', amount_due: '1400.00', late_fee: '0.00' } });
    const result = await invoiceService.markInvoicePaid(pool, 'owner-1', 'inv-1');

    expect(result).toEqual({ ok: false, error: 'already_paid' });
    expect(pool.calls.some((c) => c.text === 'ROLLBACK')).toBe(true);
    expect(pool.calls.some((c) => /UPDATE invoices SET status = 'paid'/.test(c.text))).toBe(false);
  });

  test('marks the invoice paid, records an audit entry and ledger transaction, and commits', async () => {
    const pool = makeFakePool({ owned: true, invoiceRow: { id: 'inv-1', status: 'unpaid', amount_due: '1400.00', late_fee: '0.00' } });

    const result = await invoiceService.markInvoicePaid(pool, 'owner-1', 'inv-1', {
      reason: 'api:mark_paid', user_id: 'owner-1', ip_address: '1.2.3.4',
    });

    expect(result.ok).toBe(true);
    expect(result.invoice.status).toBe('paid');
    expect(result.emailCtx).toEqual({
      ownerId: 'owner-1', tenantId: 't1', tenantName: 'Jane', tenantEmail: 'jane@example.com', totalPaid: 1400,
    });

    expect(pool.calls.some((c) => c.text === 'COMMIT')).toBe(true);
    expect(pool.isReleased()).toBe(true);

    const audit = pool.calls.find((c) => /INSERT INTO audit_logs/.test(c.text));
    expect(audit.params[0]).toBe('invoice');
    expect(audit.params[2]).toBe('update');
    expect(audit.params[5]).toBe('api:mark_paid');
    expect(audit.params[6]).toBe('owner-1');
    expect(audit.params[7]).toBe('1.2.3.4');

    expect(pool.calls.some((c) => /INSERT INTO transactions/.test(c.text))).toBe(true);
  });

  test('rolls back and releases the client if a write throws mid-transaction', async () => {
    const pool = makeFakePool({ owned: true, invoiceRow: { id: 'inv-1', status: 'unpaid', amount_due: '1400.00', late_fee: '0.00' } });
    const client = await pool.connect();
    const originalQuery = client.query;
    client.query = async (text, params) => {
      if (/INSERT INTO audit_logs/.test(text)) throw new Error('simulated audit failure');
      return originalQuery(text, params);
    };

    await expect(invoiceService.markInvoicePaid(pool, 'owner-1', 'inv-1')).rejects.toThrow('simulated audit failure');
    expect(pool.calls.some((c) => c.text === 'ROLLBACK')).toBe(true);
  });
});
