const importService = require('../src/services/importService');

function makeFakePool({ ownedLeaseIds = new Set(['lease-1']) } = {}) {
  const calls = [];
  const dedupKeys = new Set();
  let invoiceSeq = 0;

  return {
    calls,
    query: async (text, params) => {
      calls.push({ text, params });

      if (/INSERT INTO import_batches/.test(text)) return { rows: [] };
      if (/UPDATE import_batches/.test(text)) return { rows: [] };

      if (/SELECT entity_id FROM import_dedup/.test(text)) {
        const [batchId, , externalId] = params;
        return { rows: dedupKeys.has(`${batchId}::${externalId}`) ? [{ entity_id: 'existing-invoice' }] : [] };
      }

      if (/FROM leases l/.test(text)) {
        const [leaseId] = params;
        return { rows: ownedLeaseIds.has(leaseId) ? [{ id: leaseId }] : [] };
      }

      if (/INSERT INTO invoices/.test(text)) {
        invoiceSeq += 1;
        return { rows: [{ id: `inv-${invoiceSeq}`, lease_id: params[0], due_date: params[1], amount_due: params[2], status: 'unpaid' }] };
      }

      if (/INSERT INTO import_dedup/.test(text)) {
        const [batchId, , externalId] = params;
        dedupKeys.add(`${batchId}::${externalId}`);
        return { rows: [] };
      }

      if (/INSERT INTO audit_logs/.test(text)) return { rows: [{ id: 'audit-1' }] };

      return { rows: [] };
    },
  };
}

const validCsv = 'external_id,lease_id,amount_due,due_date\next-1,lease-1,1400,2026-08-01\next-2,lease-1,1400,2026-09-01';

describe('importService.importInvoicesFromCSV — dry run', () => {
  test('validates rows without writing anything', async () => {
    const pool = makeFakePool();
    const result = await importService.importInvoicesFromCSV(pool, 'owner-1', validCsv, { dryRun: true });

    expect(result.dry_run).toBe(true);
    expect(result.row_count).toBe(2);
    expect(result.success_count).toBe(2);
    expect(result.error_count).toBe(0);
    expect(pool.calls.some((c) => /INSERT INTO invoices/.test(c.text))).toBe(false);
    expect(pool.calls.some((c) => /INSERT INTO import_batches/.test(c.text))).toBe(false);
    expect(pool.calls.some((c) => /INSERT INTO import_dedup/.test(c.text))).toBe(false);
    expect(pool.calls.some((c) => /INSERT INTO audit_logs/.test(c.text))).toBe(false);
  });

  test('still reports validation errors in dry-run mode', async () => {
    const pool = makeFakePool();
    const csv = 'external_id,lease_id,amount_due,due_date\next-1,lease-999,1400,2026-08-01';
    const result = await importService.importInvoicesFromCSV(pool, 'owner-1', csv, { dryRun: true });

    expect(result.success_count).toBe(0);
    expect(result.error_count).toBe(1);
    expect(result.errors[0]).toMatchObject({ row: 2 });
  });
});

describe('importService.importInvoicesFromCSV — full import', () => {
  test('writes invoices, dedup rows, and audit log create entries', async () => {
    const pool = makeFakePool();
    const result = await importService.importInvoicesFromCSV(pool, 'owner-1', validCsv, { dryRun: false });

    expect(result.dry_run).toBe(false);
    expect(result.success_count).toBe(2);
    expect(result.error_count).toBe(0);

    const invoiceInserts = pool.calls.filter((c) => /INSERT INTO invoices/.test(c.text));
    expect(invoiceInserts).toHaveLength(2);

    const dedupInserts = pool.calls.filter((c) => /INSERT INTO import_dedup/.test(c.text));
    expect(dedupInserts).toHaveLength(2);

    const auditInserts = pool.calls.filter((c) => /INSERT INTO audit_logs/.test(c.text));
    expect(auditInserts).toHaveLength(2);
    expect(auditInserts[0].params[2]).toBe('create');
    expect(auditInserts[0].params[5]).toMatch(/^import:batch_/);
  });

  test('records a batch row up front and a final status update', async () => {
    const pool = makeFakePool();
    await importService.importInvoicesFromCSV(pool, 'owner-1', validCsv, { dryRun: false });

    expect(pool.calls.some((c) => /INSERT INTO import_batches/.test(c.text))).toBe(true);
    const update = pool.calls.find((c) => /UPDATE import_batches/.test(c.text));
    expect(update).toBeDefined();
    expect(update.text).toMatch(/status = \$1/);
  });

  test('marks the batch as partial when some rows fail and others succeed', async () => {
    const pool = makeFakePool();
    const csv = 'external_id,lease_id,amount_due,due_date\next-1,lease-1,1400,2026-08-01\next-2,lease-999,1400,2026-09-01';
    const result = await importService.importInvoicesFromCSV(pool, 'owner-1', csv, { dryRun: false });

    expect(result.success_count).toBe(1);
    expect(result.error_count).toBe(1);
    const update = pool.calls.find((c) => /UPDATE import_batches/.test(c.text));
    expect(update.params).toContain('partial');
  });

  test('rejects a row referencing a lease not owned by this account', async () => {
    const pool = makeFakePool({ ownedLeaseIds: new Set() });
    const csv = 'external_id,lease_id,amount_due,due_date\next-1,lease-1,1400,2026-08-01';
    const result = await importService.importInvoicesFromCSV(pool, 'owner-1', csv, { dryRun: false });

    expect(result.success_count).toBe(0);
    expect(result.error_count).toBe(1);
    expect(result.errors[0].error).toMatch(/lease/i);
    expect(pool.calls.some((c) => /INSERT INTO invoices/.test(c.text))).toBe(false);
  });

  test('rejects a row missing a required field, with a 1-indexed-plus-header row number', async () => {
    const pool = makeFakePool();
    const csv = 'external_id,lease_id,amount_due,due_date\n,lease-1,1400,2026-08-01';
    const result = await importService.importInvoicesFromCSV(pool, 'owner-1', csv, { dryRun: false });

    expect(result.error_count).toBe(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].error).toMatch(/required/i);
  });

  test('generates a batch_id when none is provided', async () => {
    const pool = makeFakePool();
    const result = await importService.importInvoicesFromCSV(pool, 'owner-1', validCsv, { dryRun: false });
    expect(result.batch_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  test('a DB error on one row does not abort the rest of the batch', async () => {
    const pool = makeFakePool();
    const originalQuery = pool.query;
    pool.query = async (text, params) => {
      if (/INSERT INTO invoices/.test(text) && params[0] === 'lease-1' && params[1] === '2026-09-01') {
        throw new Error('simulated DB failure');
      }
      return originalQuery(text, params);
    };
    const csv = 'external_id,lease_id,amount_due,due_date\next-1,lease-1,1400,2026-08-01\next-2,lease-1,1400,2026-09-01';
    const result = await importService.importInvoicesFromCSV(pool, 'owner-1', csv, { dryRun: false });

    expect(result.success_count).toBe(1);
    expect(result.error_count).toBe(1);
    expect(result.errors[0]).toMatchObject({ row: 3, error: 'simulated DB failure' });
  });
});

describe('importService.importInvoicesFromCSV — idempotent retry', () => {
  test('retrying the same batch_id + CSV does not create duplicate invoices', async () => {
    const pool = makeFakePool();
    const batchId = 'batch-fixed-1';

    const first = await importService.importInvoicesFromCSV(pool, 'owner-1', validCsv, { dryRun: false, batchId });
    expect(first.success_count).toBe(2);
    expect(pool.calls.filter((c) => /INSERT INTO invoices/.test(c.text))).toHaveLength(2);

    const second = await importService.importInvoicesFromCSV(pool, 'owner-1', validCsv, { dryRun: false, batchId });
    expect(second.success_count).toBe(2);
    expect(second.error_count).toBe(0);
    // Still only the original 2 invoice inserts — the retry is a no-op.
    expect(pool.calls.filter((c) => /INSERT INTO invoices/.test(c.text))).toHaveLength(2);
  });
});

describe('importService.importPropertiesFromCSV — dry run', () => {
  function makeFakePool({ ownedEntityIds = new Set(['entity-1']) } = {}) {
    const calls = [];
    return {
      calls,
      query: async (text, params) => {
        calls.push({ text, params });
        if (/SELECT id FROM entities WHERE/.test(text)) {
          const [entityId] = params;
          return { rows: ownedEntityIds.has(entityId) ? [{ id: entityId }] : [] };
        }
        if (/INSERT INTO import_batches/.test(text)) return { rows: [] };
        if (/UPDATE import_batches/.test(text)) return { rows: [] };
        if (/SELECT entity_id FROM import_dedup/.test(text)) return { rows: [] };
        if (/INSERT INTO properties/.test(text)) {
          return { rows: [{ id: 'prop-1', nickname: params[2] }] };
        }
        if (/INSERT INTO units/.test(text)) return { rows: [] };
        if (/INSERT INTO import_dedup/.test(text)) return { rows: [] };
        if (/INSERT INTO audit_logs/.test(text)) return { rows: [{ id: 'audit-1' }] };
        return { rows: [] };
      },
    };
  }

  const validCsv = 'external_id,nickname,street,city,state,zip\next-1,Maple House,12 Maple St,Austin,TX,78701';

  test('validates rows without writing anything', async () => {
    const pool = makeFakePool();
    const result = await importService.importPropertiesFromCSV(pool, 'owner-1', validCsv, { dryRun: true });

    expect(result.dry_run).toBe(true);
    expect(result.entity_type).toBe('properties');
    expect(result.row_count).toBe(1);
    expect(result.success_count).toBe(1);
    expect(result.error_count).toBe(0);
    expect(pool.calls.some((c) => /INSERT INTO properties/.test(c.text))).toBe(false);
  });

  test('rejects a row missing a required field', async () => {
    const pool = makeFakePool();
    const csv = 'external_id,nickname,street,city,state,zip\next-1,,12 Maple St,Austin,TX,78701';
    const result = await importService.importPropertiesFromCSV(pool, 'owner-1', csv, { dryRun: true });

    expect(result.error_count).toBe(1);
    expect(result.errors[0]).toMatchObject({ row: 2, error: 'Missing required field: nickname' });
  });
});

describe('importService.importPropertiesFromCSV — full import', () => {
  function makeFakePool({ ownedEntityIds = new Set(['entity-1']) } = {}) {
    const calls = [];
    const dedupKeys = new Set();
    let seq = 0;
    let unitSeq = 0;
    return {
      calls,
      query: async (text, params) => {
        calls.push({ text, params });
        if (/SELECT id FROM entities WHERE/.test(text)) {
          const [entityId] = params;
          return { rows: ownedEntityIds.has(entityId) ? [{ id: entityId }] : [] };
        }
        if (/INSERT INTO import_batches/.test(text)) return { rows: [] };
        if (/UPDATE import_batches/.test(text)) return { rows: [] };
        if (/SELECT entity_id FROM import_dedup/.test(text)) {
          const [batchId, , externalId] = params;
          return { rows: dedupKeys.has(`${batchId}::${externalId}`) ? [{ entity_id: 'existing' }] : [] };
        }
        if (/INSERT INTO properties/.test(text)) {
          seq += 1;
          return { rows: [{ id: `prop-${seq}`, owner_id: params[0], entity_id: params[1], nickname: params[2] }] };
        }
        if (/INSERT INTO units/.test(text)) {
          unitSeq += 1;
          return { rows: [{ id: `unit-${unitSeq}`, property_id: params[0], unit_number: params[1], market_rent: params[2] }] };
        }
        if (/INSERT INTO import_dedup/.test(text)) {
          const [batchId, , externalId] = params;
          dedupKeys.add(`${batchId}::${externalId}`);
          return { rows: [] };
        }
        if (/INSERT INTO audit_logs/.test(text)) return { rows: [{ id: 'audit-1' }] };
        return { rows: [] };
      },
    };
  }

  const validCsv = 'external_id,nickname,street,city,state,zip,entity_id\next-1,Maple House,12 Maple St,Austin,TX,78701,entity-1';

  test('writes property, default unit, dedup row, and audit log entry', async () => {
    const pool = makeFakePool();
    const result = await importService.importPropertiesFromCSV(pool, 'owner-1', validCsv, { dryRun: false });

    expect(result.success_count).toBe(1);
    expect(result.error_count).toBe(0);
    expect(pool.calls.filter((c) => /INSERT INTO properties/.test(c.text))).toHaveLength(1);
    expect(pool.calls.filter((c) => /INSERT INTO units/.test(c.text))).toHaveLength(1);
    expect(pool.calls.filter((c) => /INSERT INTO import_dedup/.test(c.text))).toHaveLength(1);
    const auditInserts = pool.calls.filter((c) => /INSERT INTO audit_logs/.test(c.text));
    expect(auditInserts).toHaveLength(2);
    expect(auditInserts[0].params[2]).toBe('create');
    expect(auditInserts[1].params[2]).toBe('create');
    // One audit entry for 'unit', one for 'property'
    const entityTypes = auditInserts.map((a) => a.params[0]);
    expect(entityTypes).toContain('unit');
    expect(entityTypes).toContain('property');
  });

  test('rejects a row referencing an entity_id not owned by this account', async () => {
    const pool = makeFakePool({ ownedEntityIds: new Set() });
    const result = await importService.importPropertiesFromCSV(pool, 'owner-1', validCsv, { dryRun: false });

    expect(result.success_count).toBe(0);
    expect(result.error_count).toBe(1);
    expect(result.errors[0].error).toMatch(/entity/i);
    expect(pool.calls.some((c) => /INSERT INTO properties/.test(c.text))).toBe(false);
  });

  test('retrying the same batch_id does not create duplicate properties', async () => {
    const pool = makeFakePool();
    const batchId = 'batch-props-1';

    await importService.importPropertiesFromCSV(pool, 'owner-1', validCsv, { dryRun: false, batchId });
    await importService.importPropertiesFromCSV(pool, 'owner-1', validCsv, { dryRun: false, batchId });

    expect(pool.calls.filter((c) => /INSERT INTO properties/.test(c.text))).toHaveLength(1);
  });

  test('a DB error on one row does not abort the rest of the batch', async () => {
    const pool = makeFakePool();
    const originalQuery = pool.query;
    pool.query = async (text, params) => {
      if (/INSERT INTO properties/.test(text) && params[2] === 'Bad House') {
        throw new Error('simulated DB failure');
      }
      return originalQuery(text, params);
    };
    const csv = 'external_id,nickname,street,city,state,zip,entity_id\next-1,Maple House,12 Maple St,Austin,TX,78701,entity-1\next-2,Bad House,9 Oak St,Austin,TX,78701,entity-1';
    const result = await importService.importPropertiesFromCSV(pool, 'owner-1', csv, { dryRun: false });

    expect(result.success_count).toBe(1);
    expect(result.error_count).toBe(1);
    expect(result.errors[0]).toMatchObject({ row: 3, error: 'simulated DB failure' });
  });
});

describe('importService.importLeasesFromCSV', () => {
  function makeFakePool({ ownedUnitIds = new Set(['unit-1']), tenantIds = new Set(['tenant-1']) } = {}) {
    const calls = [];
    const dedupKeys = new Set();
    let seq = 0;
    return {
      calls,
      query: async (text, params) => {
        calls.push({ text, params });
        if (/FROM units u JOIN properties p/.test(text)) {
          const [unitId] = params;
          return { rows: ownedUnitIds.has(unitId) ? [{ id: unitId }] : [] };
        }
        if (/SELECT id FROM tenants WHERE/.test(text)) {
          const [tenantId] = params;
          return { rows: tenantIds.has(tenantId) ? [{ id: tenantId }] : [] };
        }
        if (/INSERT INTO import_batches/.test(text)) return { rows: [] };
        if (/UPDATE import_batches/.test(text)) return { rows: [] };
        if (/SELECT entity_id FROM import_dedup/.test(text)) {
          const [batchId, , externalId] = params;
          return { rows: dedupKeys.has(`${batchId}::${externalId}`) ? [{ entity_id: 'existing' }] : [] };
        }
        if (/INSERT INTO leases/.test(text)) {
          seq += 1;
          return { rows: [{ id: `lease-${seq}`, unit_id: params[0], tenant_id: params[1] }] };
        }
        if (/INSERT INTO import_dedup/.test(text)) {
          const [batchId, , externalId] = params;
          dedupKeys.add(`${batchId}::${externalId}`);
          return { rows: [] };
        }
        if (/INSERT INTO audit_logs/.test(text)) return { rows: [{ id: 'audit-1' }] };
        return { rows: [] };
      },
    };
  }

  const validCsv = 'external_id,unit_id,tenant_id,rent_amount,start_date,end_date\next-1,unit-1,tenant-1,1400,2026-08-01,2027-07-31';

  test('writes a lease, dedup row, and audit log entry', async () => {
    const pool = makeFakePool();
    const result = await importService.importLeasesFromCSV(pool, 'owner-1', validCsv, { dryRun: false });

    expect(result.entity_type).toBe('leases');
    expect(result.success_count).toBe(1);
    expect(result.error_count).toBe(0);
    expect(pool.calls.filter((c) => /INSERT INTO leases/.test(c.text))).toHaveLength(1);
    expect(pool.calls.filter((c) => /INSERT INTO import_dedup/.test(c.text))).toHaveLength(1);
    const auditInserts = pool.calls.filter((c) => /INSERT INTO audit_logs/.test(c.text));
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0].params[2]).toBe('create');
  });

  test('rejects a row whose unit is not owned by this account', async () => {
    const pool = makeFakePool({ ownedUnitIds: new Set() });
    const result = await importService.importLeasesFromCSV(pool, 'owner-1', validCsv, { dryRun: false });

    expect(result.error_count).toBe(1);
    expect(result.errors[0].error).toMatch(/unit/i);
    expect(pool.calls.some((c) => /INSERT INTO leases/.test(c.text))).toBe(false);
  });

  test('rejects a row referencing a tenant that does not exist', async () => {
    const pool = makeFakePool({ tenantIds: new Set() });
    const result = await importService.importLeasesFromCSV(pool, 'owner-1', validCsv, { dryRun: false });

    expect(result.error_count).toBe(1);
    expect(result.errors[0].error).toMatch(/tenant/i);
  });

  test('dry run validates without writing', async () => {
    const pool = makeFakePool();
    const result = await importService.importLeasesFromCSV(pool, 'owner-1', validCsv, { dryRun: true });

    expect(result.dry_run).toBe(true);
    expect(result.success_count).toBe(1);
    expect(pool.calls.some((c) => /INSERT INTO leases/.test(c.text))).toBe(false);
  });

  test('retrying the same batch_id does not create duplicate leases', async () => {
    const pool = makeFakePool();
    const batchId = 'batch-leases-1';

    await importService.importLeasesFromCSV(pool, 'owner-1', validCsv, { dryRun: false, batchId });
    await importService.importLeasesFromCSV(pool, 'owner-1', validCsv, { dryRun: false, batchId });

    expect(pool.calls.filter((c) => /INSERT INTO leases/.test(c.text))).toHaveLength(1);
  });

  test('a DB error on one row does not abort the rest of the batch', async () => {
    const pool = makeFakePool();
    const originalQuery = pool.query;
    pool.query = async (text, params) => {
      if (/INSERT INTO leases/.test(text) && params[2] === 9999) {
        throw new Error('simulated DB failure');
      }
      return originalQuery(text, params);
    };
    const csv = 'external_id,unit_id,tenant_id,rent_amount,start_date,end_date\next-1,unit-1,tenant-1,1400,2026-08-01,2027-07-31\next-2,unit-1,tenant-1,9999,2026-09-01,2027-08-31';
    const result = await importService.importLeasesFromCSV(pool, 'owner-1', csv, { dryRun: false });

    expect(result.success_count).toBe(1);
    expect(result.error_count).toBe(1);
    expect(result.errors[0]).toMatchObject({ row: 3, error: 'simulated DB failure' });
  });
});

describe('importService.importTenantsFromCSV', () => {
  function makeFakePool({ ownedUnitIds = new Set(['unit-1']) } = {}) {
    const calls = [];
    const dedupKeys = new Set();
    let tenantSeq = 0;

    const client = {
      query: async (text, params) => {
        calls.push({ text, params, viaClient: true });
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
        if (/INSERT INTO tenants/.test(text)) {
          tenantSeq += 1;
          return { rows: [{ id: `tenant-${tenantSeq}`, name: params[0], email: params[1] }] };
        }
        if (/INSERT INTO leases/.test(text)) return { rows: [{ id: `lease-${tenantSeq}` }] };
        if (/INSERT INTO import_dedup/.test(text)) {
          const [batchId, , externalId] = params;
          dedupKeys.add(`${batchId}::${externalId}`);
          return { rows: [] };
        }
        if (/INSERT INTO audit_logs/.test(text)) return { rows: [{ id: 'audit-1' }] };
        return { rows: [] };
      },
      release: () => {},
    };

    return {
      calls,
      connect: async () => client,
      query: async (text, params) => {
        calls.push({ text, params });
        if (/FROM units u JOIN properties p/.test(text)) {
          const [unitId] = params;
          return { rows: ownedUnitIds.has(unitId) ? [{ id: unitId }] : [] };
        }
        if (/INSERT INTO import_batches/.test(text)) return { rows: [] };
        if (/UPDATE import_batches/.test(text)) return { rows: [] };
        if (/SELECT entity_id FROM import_dedup/.test(text)) {
          const [batchId, , externalId] = params;
          return { rows: dedupKeys.has(`${batchId}::${externalId}`) ? [{ entity_id: 'existing' }] : [] };
        }
        if (/INSERT INTO import_dedup/.test(text)) {
          const [batchId, , externalId] = params;
          dedupKeys.add(`${batchId}::${externalId}`);
          return { rows: [] };
        }
        if (/INSERT INTO audit_logs/.test(text)) return { rows: [{ id: 'audit-1' }] };
        return { rows: [] };
      },
    };
  }

  const validCsv = 'external_id,name,email,unit_id,rent,start_date,end_date\next-1,Jane Doe,jane@example.com,unit-1,1400,2026-08-01,2027-07-31';

  test('writes a tenant + lease in one transaction, dedup row, and audit log entry', async () => {
    const pool = makeFakePool();
    const result = await importService.importTenantsFromCSV(pool, 'owner-1', validCsv, { dryRun: false });

    expect(result.entity_type).toBe('tenants');
    expect(result.success_count).toBe(1);
    expect(result.error_count).toBe(0);
    expect(pool.calls.filter((c) => c.viaClient && /INSERT INTO tenants/.test(c.text))).toHaveLength(1);
    expect(pool.calls.filter((c) => c.viaClient && /INSERT INTO leases/.test(c.text))).toHaveLength(1);
    expect(pool.calls.filter((c) => c.viaClient && c.text === 'BEGIN')).toHaveLength(1);
    expect(pool.calls.filter((c) => c.viaClient && c.text === 'COMMIT')).toHaveLength(1);
    expect(pool.calls.filter((c) => /INSERT INTO import_dedup/.test(c.text))).toHaveLength(1);
    expect(pool.calls.some((c) => /INSERT INTO audit_logs/.test(c.text))).toBe(true);
  });

  test('does not create an invoice as part of tenant import', async () => {
    const pool = makeFakePool();
    await importService.importTenantsFromCSV(pool, 'owner-1', validCsv, { dryRun: false });
    expect(pool.calls.some((c) => /INSERT INTO invoices/.test(c.text))).toBe(false);
  });

  test('rejects a row whose unit is not owned by this account', async () => {
    const pool = makeFakePool({ ownedUnitIds: new Set() });
    const result = await importService.importTenantsFromCSV(pool, 'owner-1', validCsv, { dryRun: false });

    expect(result.error_count).toBe(1);
    expect(result.errors[0].error).toMatch(/unit/i);
    expect(pool.calls.some((c) => c.viaClient && /INSERT INTO tenants/.test(c.text))).toBe(false);
  });

  test('dry run validates without writing', async () => {
    const pool = makeFakePool();
    const result = await importService.importTenantsFromCSV(pool, 'owner-1', validCsv, { dryRun: true });

    expect(result.dry_run).toBe(true);
    expect(result.success_count).toBe(1);
    expect(pool.calls.some((c) => c.viaClient)).toBe(false);
  });

  test('retrying the same batch_id does not create a duplicate tenant', async () => {
    const pool = makeFakePool();
    const batchId = 'batch-tenants-1';

    await importService.importTenantsFromCSV(pool, 'owner-1', validCsv, { dryRun: false, batchId });
    await importService.importTenantsFromCSV(pool, 'owner-1', validCsv, { dryRun: false, batchId });

    expect(pool.calls.filter((c) => c.viaClient && /INSERT INTO tenants/.test(c.text))).toHaveLength(1);
  });

  test('a DB error on one row does not abort the rest of the batch, and rolls back the failed row', async () => {
    const pool = makeFakePool();
    const client = await pool.connect();
    const originalClientQuery = client.query;
    client.query = async (text, params) => {
      if (/INSERT INTO tenants/.test(text) && params[0] === 'Bad Person') {
        throw new Error('simulated DB failure');
      }
      return originalClientQuery(text, params);
    };

    const csv = 'external_id,name,email,unit_id,rent,start_date,end_date\next-1,Jane Doe,jane@example.com,unit-1,1400,2026-08-01,2027-07-31\next-2,Bad Person,bad@example.com,unit-1,1400,2026-08-01,2027-07-31';
    const result = await importService.importTenantsFromCSV(pool, 'owner-1', csv, { dryRun: false });

    expect(result.success_count).toBe(1);
    expect(result.error_count).toBe(1);
    expect(result.errors[0]).toMatchObject({ row: 3, error: 'simulated DB failure' });

    // ROLLBACK ran for the failed row's transaction.
    expect(pool.calls.filter((c) => c.viaClient && c.text === 'ROLLBACK')).toHaveLength(1);
    expect(pool.calls.filter((c) => c.viaClient && c.text === 'COMMIT')).toHaveLength(1);
    // No lingering dedup/audit artifact for the failed row.
    expect(pool.calls.some((c) => /INSERT INTO import_dedup/.test(c.text) && c.params[2] === 'ext-2')).toBe(false);
  });
});

describe('importService.importTransactionsFromCSV', () => {
  function makeFakePool({ ownedPropertyIds = new Set(['prop-1']), ownedEntityIds = new Set(['entity-1']) } = {}) {
    const calls = [];
    const dedupKeys = new Set();
    let seq = 0;
    return {
      calls,
      query: async (text, params) => {
        calls.push({ text, params });
        if (/SELECT id FROM properties WHERE/.test(text)) {
          const [propertyId] = params;
          return { rows: ownedPropertyIds.has(propertyId) ? [{ id: propertyId }] : [] };
        }
        if (/SELECT id FROM entities WHERE/.test(text)) {
          const [entityId] = params;
          return { rows: ownedEntityIds.has(entityId) ? [{ id: entityId }] : [] };
        }
        if (/INSERT INTO import_batches/.test(text)) return { rows: [] };
        if (/UPDATE import_batches/.test(text)) return { rows: [] };
        if (/SELECT entity_id FROM import_dedup/.test(text)) {
          const [batchId, , externalId] = params;
          return { rows: dedupKeys.has(`${batchId}::${externalId}`) ? [{ entity_id: 'existing' }] : [] };
        }
        if (/INSERT INTO transactions/.test(text)) {
          seq += 1;
          return { rows: [{ id: `txn-${seq}`, amount: params[1], source: 'csv' }] };
        }
        if (/INSERT INTO import_dedup/.test(text)) {
          const [batchId, , externalId] = params;
          dedupKeys.add(`${batchId}::${externalId}`);
          return { rows: [] };
        }
        if (/INSERT INTO audit_logs/.test(text)) return { rows: [{ id: 'audit-1' }] };
        return { rows: [] };
      },
    };
  }

  const validCsv = 'external_id,amount,transaction_date,description,property_id\next-1,-85.50,2026-07-08,Home Depot supplies,prop-1';

  test('writes a transaction with source=csv, dedup row, and audit log entry', async () => {
    const pool = makeFakePool();
    const result = await importService.importTransactionsFromCSV(pool, 'owner-1', validCsv, { dryRun: false });

    expect(result.entity_type).toBe('transactions');
    expect(result.success_count).toBe(1);
    expect(result.error_count).toBe(0);
    const txnInsert = pool.calls.find((c) => /INSERT INTO transactions/.test(c.text));
    expect(txnInsert.text).toMatch(/'csv'/);
    expect(pool.calls.filter((c) => /INSERT INTO import_dedup/.test(c.text))).toHaveLength(1);
    expect(pool.calls.some((c) => /INSERT INTO audit_logs/.test(c.text))).toBe(true);
  });

  test('rejects a row referencing a property not owned by this account', async () => {
    const pool = makeFakePool({ ownedPropertyIds: new Set() });
    const result = await importService.importTransactionsFromCSV(pool, 'owner-1', validCsv, { dryRun: false });

    expect(result.error_count).toBe(1);
    expect(result.errors[0].error).toMatch(/property/i);
    expect(pool.calls.some((c) => /INSERT INTO transactions/.test(c.text))).toBe(false);
  });

  test('rejects a row with a non-numeric amount', async () => {
    const pool = makeFakePool();
    const csv = 'external_id,amount,transaction_date\next-1,not-a-number,2026-07-08';
    const result = await importService.importTransactionsFromCSV(pool, 'owner-1', csv, { dryRun: false });

    expect(result.error_count).toBe(1);
    expect(result.errors[0].error).toMatch(/amount/i);
  });

  test('dry run validates without writing', async () => {
    const pool = makeFakePool();
    const result = await importService.importTransactionsFromCSV(pool, 'owner-1', validCsv, { dryRun: true });

    expect(result.dry_run).toBe(true);
    expect(result.success_count).toBe(1);
    expect(pool.calls.some((c) => /INSERT INTO transactions/.test(c.text))).toBe(false);
  });

  test('retrying the same batch_id does not create a duplicate transaction', async () => {
    const pool = makeFakePool();
    const batchId = 'batch-txns-1';

    await importService.importTransactionsFromCSV(pool, 'owner-1', validCsv, { dryRun: false, batchId });
    await importService.importTransactionsFromCSV(pool, 'owner-1', validCsv, { dryRun: false, batchId });

    expect(pool.calls.filter((c) => /INSERT INTO transactions/.test(c.text))).toHaveLength(1);
  });

  test('a DB error on one row does not abort the rest of the batch', async () => {
    const pool = makeFakePool();
    const originalQuery = pool.query;
    pool.query = async (text, params) => {
      if (/INSERT INTO transactions/.test(text) && params[1] === -999) {
        throw new Error('simulated DB failure');
      }
      return originalQuery(text, params);
    };
    const csv = 'external_id,amount,transaction_date,description,property_id\next-1,-85.50,2026-07-08,Home Depot supplies,prop-1\next-2,-999,2026-07-09,Bad charge,prop-1';
    const result = await importService.importTransactionsFromCSV(pool, 'owner-1', csv, { dryRun: false });

    expect(result.success_count).toBe(1);
    expect(result.error_count).toBe(1);
    expect(result.errors[0]).toMatchObject({ row: 3, error: 'simulated DB failure' });
  });
});
