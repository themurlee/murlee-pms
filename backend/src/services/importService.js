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

module.exports = { importInvoicesFromCSV, importPropertiesFromCSV };
