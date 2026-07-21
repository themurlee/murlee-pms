const tenantsService = require('../src/services/tenantsService');

// Fake client used inside a transaction: records every query, and lets each
// test script canned rows keyed by a regex match against the SQL text.
function makeFakeClient(responses = []) {
  const calls = [];
  let i = 0;
  return {
    calls,
    query: async (text, params) => {
      calls.push({ text, params });
      if (/^BEGIN|^COMMIT|^ROLLBACK/.test(text)) return {};
      const res = responses[i++] || { rows: [] };
      return res;
    },
    release: () => {},
  };
}

function makeFakePool(client) {
  return { connect: async () => client, query: client.query };
}

describe('tenantsService.createTenant', () => {
  test('inserts tenant, lease, and a first invoice in one transaction', async () => {
    const client = makeFakeClient([
      { rows: [{ id: 'tenant-1' }] }, // tenant insert
      { rows: [{ id: 'lease-1' }] },  // lease insert
      { rows: [] },                   // invoice insert
    ]);
    const pool = makeFakePool(client);

    const id = await tenantsService.createTenant(pool, {
      name: 'Jane Doe', email: 'jane@example.com', phone: '555-0199',
      unit_id: 'unit-1', rent: 1400, due_day: 1,
      start_date: '2026-01-01', end_date: '2026-12-31',
    });

    expect(id).toBe('tenant-1');
    expect(client.calls[0].text).toBe('BEGIN');
    expect(client.calls[1].text).toMatch(/INSERT INTO tenants/);
    expect(client.calls[2].text).toMatch(/INSERT INTO leases/);
    expect(client.calls[2].params).toContain('unit-1');
    expect(client.calls[2].params).toContain('tenant-1');
    expect(client.calls[3].text).toMatch(/INSERT INTO invoices/);
    expect(client.calls[3].params).toContain('lease-1');
    expect(client.calls[client.calls.length - 1].text).toBe('COMMIT');
  });

  test('rolls back if the lease insert fails', async () => {
    const client = {
      calls: [],
      query: async function (text) {
        this.calls.push(text);
        if (/^BEGIN$/.test(text)) return {};
        if (/INSERT INTO tenants/.test(text)) return { rows: [{ id: 'tenant-1' }] };
        if (/INSERT INTO leases/.test(text)) throw new Error('unit already leased');
        return {};
      },
      release: () => {},
    };
    const pool = { connect: async () => client };

    await expect(
      tenantsService.createTenant(pool, {
        name: 'Jane Doe', email: 'jane@example.com', unit_id: 'unit-1', rent: 1400,
        start_date: '2026-01-01', end_date: '2026-12-31',
      })
    ).rejects.toThrow('unit already leased');

    expect(client.calls).toContain('ROLLBACK');
    expect(client.calls).not.toContain('COMMIT');
  });

  test('encodes a real payment plan as JSON but stores None as null', async () => {
    const client = makeFakeClient([
      { rows: [{ id: 'tenant-1' }] },
      { rows: [{ id: 'lease-1' }] },
      { rows: [] },
    ]);
    const pool = makeFakePool(client);

    await tenantsService.createTenant(pool, {
      name: 'Jane', email: 'jane@example.com', unit_id: 'u1', rent: 1400,
      start_date: '2026-01-01', end_date: '2026-12-31', payment_plan: '$700 on 10/11',
    });

    expect(client.calls[2].params).toContain(JSON.stringify('$700 on 10/11'));
  });
});

describe('tenantsService.updateTenant', () => {
  test('updates the existing active lease when one exists', async () => {
    const client = makeFakeClient([
      { rows: [{ id: 'tenant-1' }] },   // tenant update
      { rows: [{ id: 'lease-1' }] },    // active lease lookup
      { rows: [] },                     // lease update
    ]);
    const pool = makeFakePool(client);

    const ok = await tenantsService.updateTenant(pool, 'tenant-1', {
      name: 'Jane Doe', email: 'jane@example.com', unit_id: 'unit-1', rent: 1500,
      start_date: '2026-01-01', end_date: '2026-12-31',
    });

    expect(ok).toBe(true);
    expect(client.calls[2].text).toMatch(/SELECT id FROM leases WHERE tenant_id = \$1 AND status = 'active'/);
    expect(client.calls[3].text).toMatch(/UPDATE leases SET/);
    expect(client.calls[3].params).toContain('lease-1');
  });

  test('creates a new lease when the tenant has none yet', async () => {
    const client = makeFakeClient([
      { rows: [{ id: 'tenant-1' }] }, // tenant update
      { rows: [] },                   // no active lease found
      { rows: [] },                   // lease insert
    ]);
    const pool = makeFakePool(client);

    await tenantsService.updateTenant(pool, 'tenant-1', {
      name: 'Jane', email: 'jane@example.com', unit_id: 'unit-1', rent: 1500,
      start_date: '2026-01-01', end_date: '2026-12-31',
    });

    expect(client.calls[3].text).toMatch(/INSERT INTO leases/);
  });

  test('returns false when the tenant does not exist', async () => {
    const client = makeFakeClient([{ rows: [] }]);
    const pool = makeFakePool(client);
    const ok = await tenantsService.updateTenant(pool, 'missing', { name: 'X', email: 'x@example.com' });
    expect(ok).toBe(false);
  });
});

describe('tenantsService.deleteTenant', () => {
  test('blocks deletion with a clear message when an active lease exists', async () => {
    const pool = { query: async () => ({ rows: [{ id: 'lease-1' }] }) };
    const result = await tenantsService.deleteTenant(pool, 'tenant-1');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/active lease/i);
  });

  test('deletes when there is no active lease', async () => {
    const calls = [];
    const pool = {
      query: async (text) => {
        calls.push(text);
        if (/SELECT id FROM leases/.test(text)) return { rows: [] };
        return { rowCount: 1 };
      },
    };
    const result = await tenantsService.deleteTenant(pool, 'tenant-1');
    expect(result.ok).toBe(true);
    expect(calls.some((t) => /DELETE FROM tenants/.test(t))).toBe(true);
  });
});
