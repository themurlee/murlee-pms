const auditService = require('../src/services/auditService');

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

describe('auditService.log', () => {
  test('inserts a row with before/after JSON and returns the new id', async () => {
    const pool = makeFakePool([{ id: 'audit-1' }]);
    const id = await auditService.log(pool, {
      entity_type: 'invoice',
      entity_id: 'inv-1',
      action: 'update',
      before: { status: 'unpaid' },
      after: { status: 'paid' },
      reason: 'api:mark_paid',
      user_id: 'owner-1',
      ip_address: '1.2.3.4',
    });

    expect(id).toBe('audit-1');
    const { text, params } = pool.calls[0];
    expect(text).toMatch(/INSERT INTO audit_logs/);
    expect(params).toEqual([
      'invoice', 'inv-1', 'update',
      JSON.stringify({ status: 'unpaid' }), JSON.stringify({ status: 'paid' }),
      'api:mark_paid', 'owner-1', '1.2.3.4',
    ]);
  });

  test('defaults before/reason/user_id/ip_address to null when omitted', async () => {
    const pool = makeFakePool([{ id: 'audit-2' }]);
    await auditService.log(pool, {
      entity_type: 'invoice',
      entity_id: 'inv-2',
      action: 'create',
      after: { status: 'unpaid' },
    });

    const { params } = pool.calls[0];
    expect(params).toEqual([
      'invoice', 'inv-2', 'create',
      null, JSON.stringify({ status: 'unpaid' }),
      null, null, null,
    ]);
  });

  test('never issues an UPDATE statement (append-only)', async () => {
    const pool = makeFakePool([{ id: 'audit-3' }]);
    await auditService.log(pool, { entity_type: 'invoice', entity_id: 'inv-3', action: 'delete', after: null });
    expect(pool.calls.some((c) => /UPDATE audit_logs/i.test(c.text))).toBe(false);
  });
});

describe('auditService.queryLog', () => {
  test('with no filters, queries all rows ordered by timestamp desc', async () => {
    const pool = makeFakePool([]);
    await auditService.queryLog(pool, {});
    const { text, params } = pool.calls[0];
    expect(text).toMatch(/FROM audit_logs/);
    expect(text).toMatch(/ORDER BY "timestamp" DESC/);
    expect(text).not.toMatch(/WHERE/);
    expect(params).toEqual([100, 0]);
  });

  test('filters by entity_type and entity_id', async () => {
    const pool = makeFakePool([]);
    await auditService.queryLog(pool, { entity_type: 'invoice', entity_id: 'inv-1' });
    const { text, params } = pool.calls[0];
    expect(text).toMatch(/entity_type = \$1/);
    expect(text).toMatch(/entity_id = \$2/);
    expect(params).toEqual(['invoice', 'inv-1', 100, 0]);
  });

  test('filters by user_id, action, and since', async () => {
    const pool = makeFakePool([]);
    await auditService.queryLog(pool, { user_id: 'owner-1', action: 'update', since: '2026-01-01' });
    const { text, params } = pool.calls[0];
    expect(text).toMatch(/user_id = \$1/);
    expect(text).toMatch(/action = \$2/);
    expect(text).toMatch(/"timestamp" >= \$3/);
    expect(params).toEqual(['owner-1', 'update', '2026-01-01', 100, 0]);
  });

  test('respects custom limit and offset', async () => {
    const pool = makeFakePool([]);
    await auditService.queryLog(pool, { limit: 10, offset: 20 });
    const { params } = pool.calls[0];
    expect(params).toEqual([10, 20]);
  });

  test('returns the rows from the query', async () => {
    const rows = [{ id: 'audit-1', action: 'update' }];
    const pool = makeFakePool(rows);
    const result = await auditService.queryLog(pool, {});
    expect(result).toEqual(rows);
  });
});
