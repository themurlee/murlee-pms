const transactionsService = require('../src/services/transactionsService');

// Fake pool: records the last query text + params, returns canned rows.
function makeFakePool(rows = []) {
  const calls = [];
  return {
    calls,
    query: async (text, params) => {
      calls.push({ text, params });
      return { rows, rowCount: rows.length };
    },
  };
}

describe('transactionsService.listTransactions', () => {
  test('scopes to owner and maps rows', async () => {
    const pool = makeFakePool([
      { id: 'tx1', transaction_date: '2026-07-10', description: 'Rent', amount: '1400.00',
        category: 'Rent Received', account_class: 'real_estate', source: 'manual',
        payment_method: 'check', property_id: 'p1', entity_id: null, invoice_id: 'i1',
        reviewed: true, memo: null },
    ]);
    const out = await transactionsService.listTransactions(pool, 'owner1', {});
    expect(pool.calls[0].params[0]).toBe('owner1');
    expect(out[0].amount).toBe(1400);
    expect(out[0].category).toBe('Rent Received');
  });

  test('adds an account_class filter clause and param when provided', async () => {
    const pool = makeFakePool([]);
    await transactionsService.listTransactions(pool, 'owner1', { account_class: 'personal' });
    expect(pool.calls[0].text).toMatch(/account_class = \$2/);
    expect(pool.calls[0].params).toEqual(['owner1', 'personal']);
  });
});

describe('transactionsService.createTransaction', () => {
  test('inserts with defaults and returns the new id', async () => {
    const pool = makeFakePool([{ id: 'new-id' }]);
    const id = await transactionsService.createTransaction(pool, 'owner1', {
      amount: -85, transaction_date: '2026-07-08', description: 'Home Depot', category: 'Supplies',
    });
    expect(id).toBe('new-id');
    const call = pool.calls[0];
    expect(call.text).toMatch(/INSERT INTO transactions/);
    expect(call.params[0]).toBe('owner1');
    expect(call.params).toContain('real_estate'); // default class
    expect(call.params).toContain('manual');      // default source
  });
});

describe('transactionsService.updateTransaction', () => {
  test('builds a dynamic SET from the patch and scopes by owner + id', async () => {
    const pool = makeFakePool([{ id: 'tx1' }]);
    const ok = await transactionsService.updateTransaction(pool, 'owner1', 'tx1', {
      category: 'Repairs', reviewed: true,
    });
    expect(ok).toBe(true);
    const { text, params } = pool.calls[0];
    expect(text).toMatch(/SET category = \$1, reviewed = \$2/);
    expect(text).toMatch(/WHERE id = \$3 AND owner_id = \$4/);
    expect(params).toEqual(['Repairs', true, 'tx1', 'owner1']);
  });

  test('returns false when nothing matched', async () => {
    const pool = makeFakePool([]);
    const ok = await transactionsService.updateTransaction(pool, 'owner1', 'missing', { reviewed: true });
    expect(ok).toBe(false);
  });

  test('ignores keys that are not in the allowlist', async () => {
    const pool = makeFakePool([{ id: 'tx1' }]);
    await transactionsService.updateTransaction(pool, 'owner1', 'tx1', { hacker: 'x', memo: 'ok' });
    expect(pool.calls[0].text).toMatch(/SET memo = \$1/);
    expect(pool.calls[0].text).not.toMatch(/hacker/);
  });
});

describe('transactionsService.deleteTransaction', () => {
  test('returns true when a row was deleted', async () => {
    const pool = { query: async () => ({ rowCount: 1 }) };
    expect(await transactionsService.deleteTransaction(pool, 'owner1', 'tx1')).toBe(true);
  });
});

describe('transactionsService.insertRentReceived', () => {
  test('inserts a Rent Received row when none exists for the invoice', async () => {
    const calls = [];
    const q = {
      query: async (text, params) => {
        calls.push({ text, params });
        if (/SELECT id FROM transactions WHERE invoice_id/.test(text)) return { rows: [] };
        return { rows: [{ id: 'rent-tx' }] };
      },
    };
    const id = await transactionsService.insertRentReceived(q, {
      ownerId: 'o1', invoiceId: 'i1', propertyId: 'p1', entityId: null,
      amount: 1400, date: '2026-07-10', paymentMethod: 'check',
    });
    expect(id).toBe('rent-tx');
    const insert = calls.find((c) => /INSERT INTO transactions/.test(c.text));
    expect(insert.text).toMatch(/'Rent Received'/);
    expect(insert.text).toMatch(/'real_estate'/);
    expect(insert.params).toContain('check'); // payment method passed as a param
  });

  test('returns null and does not insert when a Rent Received row already exists', async () => {
    const calls = [];
    const q = {
      query: async (text) => {
        calls.push({ text });
        if (/SELECT id FROM transactions WHERE invoice_id/.test(text)) return { rows: [{ id: 'existing' }] };
        return { rows: [{ id: 'should-not-happen' }] };
      },
    };
    const id = await transactionsService.insertRentReceived(q, {
      ownerId: 'o1', invoiceId: 'i1', propertyId: 'p1', entityId: null,
      amount: 1400, date: '2026-07-10', paymentMethod: 'check',
    });
    expect(id).toBeNull();
    expect(calls.some((c) => /INSERT INTO transactions/.test(c.text))).toBe(false);
  });
});
