const crypto = require('crypto');
const { parseCsv } = require('../utils/csv');
const auditService = require('./auditService');

const REQUIRED_FIELDS = ['external_id', 'lease_id', 'amount_due', 'due_date'];

function validateRow(row) {
  for (const field of REQUIRED_FIELDS) {
    if (!row[field] || !String(row[field]).trim()) {
      return `Missing required field: ${field}`;
    }
  }
  if (Number.isNaN(Number(row.amount_due))) {
    return 'amount_due must be a number';
  }
  return null;
}

// Confirms the lease belongs to this owner (same ownership chain as
// invoiceService.getInvoicesForProperty), so an import can't create invoices
// against another landlord's lease.
async function leaseOwnedBy(pool, leaseId, ownerId) {
  const res = await pool.query(
    `SELECT l.id FROM leases l
       JOIN units u ON l.unit_id = u.id
       JOIN properties p ON u.property_id = p.id
      WHERE l.id = $1 AND p.owner_id = $2`,
    [leaseId, ownerId]
  );
  return res.rows.length > 0;
}

async function alreadyImported(pool, batchId, entityType, externalId) {
  const res = await pool.query(
    `SELECT entity_id FROM import_dedup WHERE import_batch_id = $1 AND entity_type = $2 AND external_id = $3`,
    [batchId, entityType, externalId]
  );
  return res.rows.length > 0;
}

async function importInvoicesFromCSV(pool, ownerId, csvText, { dryRun = false, batchId } = {}) {
  const rows = parseCsv(csvText);
  const id = batchId || crypto.randomUUID();

  if (!dryRun) {
    await pool.query(
      `INSERT INTO import_batches (id, owner_id, entity_type, status, row_count)
       VALUES ($1, $2, 'invoices', 'pending', $3)
       ON CONFLICT (id) DO NOTHING`,
      [id, ownerId, rows.length]
    );
  }

  let success_count = 0;
  let error_count = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // header is line 1

    const validationError = validateRow(row);
    if (validationError) {
      error_count += 1;
      errors.push({ row: rowNumber, error: validationError });
      continue;
    }

    if (!dryRun && await alreadyImported(pool, id, 'invoice', row.external_id)) {
      // Already imported in a prior attempt at this batch_id — idempotent no-op.
      success_count += 1;
      continue;
    }

    const owned = await leaseOwnedBy(pool, row.lease_id, ownerId);
    if (!owned) {
      error_count += 1;
      errors.push({ row: rowNumber, error: `Lease ${row.lease_id} not found or not owned by this account` });
      continue;
    }

    if (dryRun) {
      success_count += 1;
      continue;
    }

    const inserted = await pool.query(
      `INSERT INTO invoices (lease_id, due_date, amount_due, status, billing_period, transfer_id)
       VALUES ($1, $2, $3, 'unpaid', $4, $5)
       RETURNING *`,
      [row.lease_id, row.due_date, Number(row.amount_due), row.billing_period || null, row.transfer_id || null]
    );
    const invoice = inserted.rows[0];

    await pool.query(
      `INSERT INTO import_dedup (import_batch_id, entity_type, external_id, entity_id) VALUES ($1, $2, $3, $4)`,
      [id, 'invoice', row.external_id, invoice.id]
    );

    await auditService.log(pool, {
      entity_type: 'invoice',
      entity_id: invoice.id,
      action: 'create',
      before: null,
      after: invoice,
      reason: `import:batch_${id}`,
      user_id: ownerId,
    });

    success_count += 1;
  }

  if (!dryRun) {
    const status = error_count > 0 ? (success_count > 0 ? 'partial' : 'failed') : 'success';
    await pool.query(
      `UPDATE import_batches SET status = $1, success_count = $2, error_count = $3 WHERE id = $4`,
      [status, success_count, error_count, id]
    );
  }

  return {
    batch_id: id,
    entity_type: 'invoices',
    row_count: rows.length,
    success_count,
    error_count,
    dry_run: dryRun,
    errors,
  };
}

const PROPERTY_REQUIRED_FIELDS = ['external_id', 'nickname', 'street', 'city', 'state', 'zip'];

function validatePropertyRow(row) {
  for (const field of PROPERTY_REQUIRED_FIELDS) {
    if (!row[field] || !String(row[field]).trim()) {
      return `Missing required field: ${field}`;
    }
  }
  if (row.market_rent && Number.isNaN(Number(row.market_rent))) {
    return 'market_rent must be a number';
  }
  return null;
}

async function entityOwnedBy(pool, entityId, ownerId) {
  const res = await pool.query(
    `SELECT id FROM entities WHERE id = $1 AND owner_id = $2`,
    [entityId, ownerId]
  );
  return res.rows.length > 0;
}

async function importPropertiesFromCSV(pool, ownerId, csvText, { dryRun = false, batchId } = {}) {
  const rows = parseCsv(csvText);
  const id = batchId || crypto.randomUUID();

  if (!dryRun) {
    await pool.query(
      `INSERT INTO import_batches (id, owner_id, entity_type, status, row_count)
       VALUES ($1, $2, 'properties', 'pending', $3)
       ON CONFLICT (id) DO NOTHING`,
      [id, ownerId, rows.length]
    );
  }

  let success_count = 0;
  let error_count = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2;

    const validationError = validatePropertyRow(row);
    if (validationError) {
      error_count += 1;
      errors.push({ row: rowNumber, error: validationError });
      continue;
    }

    if (!dryRun && await alreadyImported(pool, id, 'property', row.external_id)) {
      success_count += 1;
      continue;
    }

    if (row.entity_id && !(await entityOwnedBy(pool, row.entity_id, ownerId))) {
      error_count += 1;
      errors.push({ row: rowNumber, error: `Entity ${row.entity_id} not found or not owned by this account` });
      continue;
    }

    if (dryRun) {
      success_count += 1;
      continue;
    }

    const marketRent = Number(row.market_rent) || 0;
    const address = JSON.stringify({ street: row.street, city: row.city, state: row.state, zip: row.zip });

    const inserted = await pool.query(
      `INSERT INTO properties (owner_id, entity_id, nickname, address, property_type, estimated_rent_roll)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [ownerId, row.entity_id || null, row.nickname, address, row.property_type || 'Single-Family', marketRent]
    );
    const property = inserted.rows[0];

    const insertedUnit = await pool.query(
      `INSERT INTO units (property_id, unit_number, market_rent) VALUES ($1, $2, $3) RETURNING *`,
      [property.id, 'Unit 1', marketRent]
    );
    const unit = insertedUnit.rows[0];

    await auditService.log(pool, {
      entity_type: 'unit',
      entity_id: unit.id,
      action: 'create',
      before: null,
      after: unit,
      reason: `import:batch_${id}`,
      user_id: ownerId,
    });

    await pool.query(
      `INSERT INTO import_dedup (import_batch_id, entity_type, external_id, entity_id) VALUES ($1, $2, $3, $4)`,
      [id, 'property', row.external_id, property.id]
    );

    await auditService.log(pool, {
      entity_type: 'property',
      entity_id: property.id,
      action: 'create',
      before: null,
      after: property,
      reason: `import:batch_${id}`,
      user_id: ownerId,
    });

    success_count += 1;
  }

  if (!dryRun) {
    const status = error_count > 0 ? (success_count > 0 ? 'partial' : 'failed') : 'success';
    await pool.query(
      `UPDATE import_batches SET status = $1, success_count = $2, error_count = $3 WHERE id = $4`,
      [status, success_count, error_count, id]
    );
  }

  return {
    batch_id: id,
    entity_type: 'properties',
    row_count: rows.length,
    success_count,
    error_count,
    dry_run: dryRun,
    errors,
  };
}

const LEASE_REQUIRED_FIELDS = ['external_id', 'unit_id', 'tenant_id', 'rent_amount', 'start_date', 'end_date'];

function validateLeaseRow(row) {
  for (const field of LEASE_REQUIRED_FIELDS) {
    if (!row[field] || !String(row[field]).trim()) {
      return `Missing required field: ${field}`;
    }
  }
  if (Number.isNaN(Number(row.rent_amount))) {
    return 'rent_amount must be a number';
  }
  if (row.due_day && (Number.isNaN(Number(row.due_day)) || Number(row.due_day) < 1 || Number(row.due_day) > 31)) {
    return 'due_day must be a number between 1 and 31';
  }
  return null;
}

async function unitOwnedBy(pool, unitId, ownerId) {
  const res = await pool.query(
    `SELECT u.id FROM units u JOIN properties p ON u.property_id = p.id WHERE u.id = $1 AND p.owner_id = $2`,
    [unitId, ownerId]
  );
  return res.rows.length > 0;
}

async function tenantExists(pool, tenantId) {
  const res = await pool.query(`SELECT id FROM tenants WHERE id = $1`, [tenantId]);
  return res.rows.length > 0;
}

async function importLeasesFromCSV(pool, ownerId, csvText, { dryRun = false, batchId } = {}) {
  const rows = parseCsv(csvText);
  const id = batchId || crypto.randomUUID();

  if (!dryRun) {
    await pool.query(
      `INSERT INTO import_batches (id, owner_id, entity_type, status, row_count)
       VALUES ($1, $2, 'leases', 'pending', $3)
       ON CONFLICT (id) DO NOTHING`,
      [id, ownerId, rows.length]
    );
  }

  let success_count = 0;
  let error_count = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2;

    const validationError = validateLeaseRow(row);
    if (validationError) {
      error_count += 1;
      errors.push({ row: rowNumber, error: validationError });
      continue;
    }

    if (!dryRun && await alreadyImported(pool, id, 'lease', row.external_id)) {
      success_count += 1;
      continue;
    }

    if (!(await unitOwnedBy(pool, row.unit_id, ownerId))) {
      error_count += 1;
      errors.push({ row: rowNumber, error: `Unit ${row.unit_id} not found or not owned by this account` });
      continue;
    }

    if (!(await tenantExists(pool, row.tenant_id))) {
      error_count += 1;
      errors.push({ row: rowNumber, error: `Tenant ${row.tenant_id} not found` });
      continue;
    }

    if (dryRun) {
      success_count += 1;
      continue;
    }

    const inserted = await pool.query(
      `INSERT INTO leases (unit_id, tenant_id, rent_amount, due_day, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING *`,
      [row.unit_id, row.tenant_id, Number(row.rent_amount), Number(row.due_day) || 1, row.start_date, row.end_date]
    );
    const lease = inserted.rows[0];

    await pool.query(
      `INSERT INTO import_dedup (import_batch_id, entity_type, external_id, entity_id) VALUES ($1, $2, $3, $4)`,
      [id, 'lease', row.external_id, lease.id]
    );

    await auditService.log(pool, {
      entity_type: 'lease',
      entity_id: lease.id,
      action: 'create',
      before: null,
      after: lease,
      reason: `import:batch_${id}`,
      user_id: ownerId,
    });

    success_count += 1;
  }

  if (!dryRun) {
    const status = error_count > 0 ? (success_count > 0 ? 'partial' : 'failed') : 'success';
    await pool.query(
      `UPDATE import_batches SET status = $1, success_count = $2, error_count = $3 WHERE id = $4`,
      [status, success_count, error_count, id]
    );
  }

  return {
    batch_id: id,
    entity_type: 'leases',
    row_count: rows.length,
    success_count,
    error_count,
    dry_run: dryRun,
    errors,
  };
}

const TENANT_REQUIRED_FIELDS = ['external_id', 'name', 'email', 'unit_id', 'rent', 'start_date', 'end_date'];

function validateTenantRow(row) {
  for (const field of TENANT_REQUIRED_FIELDS) {
    if (!row[field] || !String(row[field]).trim()) {
      return `Missing required field: ${field}`;
    }
  }
  if (Number.isNaN(Number(row.rent))) {
    return 'rent must be a number';
  }
  return null;
}

async function importTenantsFromCSV(pool, ownerId, csvText, { dryRun = false, batchId } = {}) {
  const rows = parseCsv(csvText);
  const id = batchId || crypto.randomUUID();

  if (!dryRun) {
    await pool.query(
      `INSERT INTO import_batches (id, owner_id, entity_type, status, row_count)
       VALUES ($1, $2, 'tenants', 'pending', $3)
       ON CONFLICT (id) DO NOTHING`,
      [id, ownerId, rows.length]
    );
  }

  let success_count = 0;
  let error_count = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2;

    const validationError = validateTenantRow(row);
    if (validationError) {
      error_count += 1;
      errors.push({ row: rowNumber, error: validationError });
      continue;
    }

    if (!dryRun && await alreadyImported(pool, id, 'tenant', row.external_id)) {
      success_count += 1;
      continue;
    }

    if (!(await unitOwnedBy(pool, row.unit_id, ownerId))) {
      error_count += 1;
      errors.push({ row: rowNumber, error: `Unit ${row.unit_id} not found or not owned by this account` });
      continue;
    }

    if (dryRun) {
      success_count += 1;
      continue;
    }

    const client = await pool.connect();
    let tenant;
    try {
      await client.query('BEGIN');

      const tenantRes = await client.query(
        `INSERT INTO tenants (name, email, phone, role) VALUES ($1, $2, $3, 'tenant') RETURNING *`,
        [row.name, row.email, row.phone || null]
      );
      tenant = tenantRes.rows[0];

      const dueDay = Number(row.due_day) || 1;
      await client.query(
        `INSERT INTO leases (unit_id, tenant_id, rent_amount, due_day, start_date, end_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
        [row.unit_id, tenant.id, Number(row.rent), dueDay, row.start_date, row.end_date]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await pool.query(
      `INSERT INTO import_dedup (import_batch_id, entity_type, external_id, entity_id) VALUES ($1, $2, $3, $4)`,
      [id, 'tenant', row.external_id, tenant.id]
    );

    await auditService.log(pool, {
      entity_type: 'tenant',
      entity_id: tenant.id,
      action: 'create',
      before: null,
      after: tenant,
      reason: `import:batch_${id}`,
      user_id: ownerId,
    });

    success_count += 1;
  }

  if (!dryRun) {
    const status = error_count > 0 ? (success_count > 0 ? 'partial' : 'failed') : 'success';
    await pool.query(
      `UPDATE import_batches SET status = $1, success_count = $2, error_count = $3 WHERE id = $4`,
      [status, success_count, error_count, id]
    );
  }

  return {
    batch_id: id,
    entity_type: 'tenants',
    row_count: rows.length,
    success_count,
    error_count,
    dry_run: dryRun,
    errors,
  };
}

const TRANSACTION_REQUIRED_FIELDS = ['external_id', 'amount', 'transaction_date'];

function validateTransactionRow(row) {
  for (const field of TRANSACTION_REQUIRED_FIELDS) {
    if (!row[field] || !String(row[field]).trim()) {
      return `Missing required field: ${field}`;
    }
  }
  if (Number.isNaN(Number(row.amount))) {
    return 'amount must be a number';
  }
  if (row.account_class && !['real_estate', 'personal'].includes(row.account_class)) {
    return 'account_class must be real_estate or personal';
  }
  return null;
}

async function propertyOwnedBy(pool, propertyId, ownerId) {
  const res = await pool.query(
    `SELECT id FROM properties WHERE id = $1 AND owner_id = $2`,
    [propertyId, ownerId]
  );
  return res.rows.length > 0;
}

async function importTransactionsFromCSV(pool, ownerId, csvText, { dryRun = false, batchId } = {}) {
  const rows = parseCsv(csvText);
  const id = batchId || crypto.randomUUID();

  if (!dryRun) {
    await pool.query(
      `INSERT INTO import_batches (id, owner_id, entity_type, status, row_count)
       VALUES ($1, $2, 'transactions', 'pending', $3)
       ON CONFLICT (id) DO NOTHING`,
      [id, ownerId, rows.length]
    );
  }

  let success_count = 0;
  let error_count = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2;

    const validationError = validateTransactionRow(row);
    if (validationError) {
      error_count += 1;
      errors.push({ row: rowNumber, error: validationError });
      continue;
    }

    if (!dryRun && await alreadyImported(pool, id, 'transaction', row.external_id)) {
      success_count += 1;
      continue;
    }

    if (row.property_id && !(await propertyOwnedBy(pool, row.property_id, ownerId))) {
      error_count += 1;
      errors.push({ row: rowNumber, error: `Property ${row.property_id} not found or not owned by this account` });
      continue;
    }

    if (row.entity_id && !(await entityOwnedBy(pool, row.entity_id, ownerId))) {
      error_count += 1;
      errors.push({ row: rowNumber, error: `Entity ${row.entity_id} not found or not owned by this account` });
      continue;
    }

    if (dryRun) {
      success_count += 1;
      continue;
    }

    const inserted = await pool.query(
      `INSERT INTO transactions
         (owner_id, amount, transaction_date, description, category, property_id, entity_id,
          account_class, source, payment_method, reviewed, classification_flag)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'csv', $9, $10, 'auto')
       RETURNING *`,
      [
        ownerId,
        Number(row.amount),
        row.transaction_date,
        row.description || '',
        row.category || null,
        row.property_id || null,
        row.entity_id || null,
        row.account_class || 'real_estate',
        row.payment_method || null,
        row.reviewed === 'true',
      ]
    );
    const transaction = inserted.rows[0];

    await pool.query(
      `INSERT INTO import_dedup (import_batch_id, entity_type, external_id, entity_id) VALUES ($1, $2, $3, $4)`,
      [id, 'transaction', row.external_id, transaction.id]
    );

    await auditService.log(pool, {
      entity_type: 'transaction',
      entity_id: transaction.id,
      action: 'create',
      before: null,
      after: transaction,
      reason: `import:batch_${id}`,
      user_id: ownerId,
    });

    success_count += 1;
  }

  if (!dryRun) {
    const status = error_count > 0 ? (success_count > 0 ? 'partial' : 'failed') : 'success';
    await pool.query(
      `UPDATE import_batches SET status = $1, success_count = $2, error_count = $3 WHERE id = $4`,
      [status, success_count, error_count, id]
    );
  }

  return {
    batch_id: id,
    entity_type: 'transactions',
    row_count: rows.length,
    success_count,
    error_count,
    dry_run: dryRun,
    errors,
  };
}

module.exports = { importInvoicesFromCSV, importPropertiesFromCSV, importLeasesFromCSV, importTenantsFromCSV, importTransactionsFromCSV };
