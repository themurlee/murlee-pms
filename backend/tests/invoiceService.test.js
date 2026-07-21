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
    const pool = makeFakePool([{ status: 'unpaid' }], { rowCount: 1 });
    const result = await invoiceService.deleteInvoiceItem(pool, 'inv-1', 'item-1');
    expect(result).toEqual({ ok: true });
  });

  test('blocks deleting an item from a paid invoice', async () => {
    const pool = makeFakePool([{ status: 'paid' }], { rowCount: 1 });
    const result = await invoiceService.deleteInvoiceItem(pool, 'inv-1', 'item-1');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/paid invoice/i);
  });
});
