const { iso, firstOfMonth, dueDateFor } = require('./billingService');

const LIST_QUERY = `
  SELECT t.id, t.name, t.email, t.phone,
         l.id AS lease_id, u.id AS unit_id, pr.id AS property_id,
         u.unit_number, pr.nickname AS property_name,
         l.rent_amount, l.due_day, l.start_date, l.end_date,
         l.delinquency_notes, l.eviction_notes, l.housing_authority, l.payment_plan
  FROM tenants t
  LEFT JOIN leases l ON l.tenant_id = t.id AND l.status = 'active'
  LEFT JOIN units u ON l.unit_id = u.id
  LEFT JOIN properties pr ON u.property_id = pr.id
  WHERE t.role = 'tenant'
  ORDER BY t.name
`;

const fmtDate = (d) => (d instanceof Date ? d.toISOString().split('T')[0] : d);

function formatTenant(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    lease_id: row.lease_id,
    unit_id: row.unit_id,
    property_id: row.property_id,
    unit: row.unit_number ? `${row.property_name} #${row.unit_number}` : '',
    rent: parseFloat(row.rent_amount || 0),
    due_day: row.due_day || 1,
    start_date: fmtDate(row.start_date),
    end_date: fmtDate(row.end_date),
    delinquency_notes: row.delinquency_notes || '',
    eviction_notes: row.eviction_notes || '',
    housing_authority: row.housing_authority || 'None',
    // payment_plan is stored as a JSON-encoded string scalar; pg's jsonb type
    // parser already decodes it back into a plain JS string on read.
    payment_plan: row.payment_plan || 'None',
    documents: [],
  };
}

async function listTenants(pool) {
  const result = await pool.query(LIST_QUERY);
  return result.rows.map(formatTenant);
}

/**
 * Creates a tenant AND the lease that actually wires them to rent collection
 * (unit, rent, term), plus their first invoice so they show up in the ledger
 * immediately rather than waiting for the next scheduled due_day. All three
 * inserts happen in one transaction so a mid-way failure leaves nothing behind.
 */
async function createTenant(pool, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tenantRes = await client.query(
      `INSERT INTO tenants (name, email, phone, role) VALUES ($1, $2, $3, 'tenant') RETURNING id`,
      [input.name, input.email, input.phone || null]
    );
    const tenantId = tenantRes.rows[0].id;

    const dueDay = input.due_day || 1;
    const paymentPlan = input.payment_plan && input.payment_plan !== 'None' ? JSON.stringify(input.payment_plan) : null;

    const leaseRes = await client.query(
      `INSERT INTO leases (unit_id, tenant_id, rent_amount, due_day, start_date, end_date, status,
                            delinquency_notes, eviction_notes, housing_authority, payment_plan)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10)
       RETURNING id`,
      [
        input.unit_id, tenantId, input.rent, dueDay, input.start_date, input.end_date,
        input.delinquency_notes || null, input.eviction_notes || null,
        input.housing_authority && input.housing_authority !== 'None' ? input.housing_authority : null,
        paymentPlan,
      ]
    );
    const leaseId = leaseRes.rows[0].id;

    const today = new Date();
    const dueDate = iso(dueDateFor(today, dueDay));
    const period = iso(firstOfMonth(today));
    await client.query(
      `INSERT INTO invoices (lease_id, due_date, amount_due, billing_period, status)
       VALUES ($1, $2, $3, $4, 'unpaid')
       ON CONFLICT (lease_id, billing_period) DO NOTHING`,
      [leaseId, dueDate, input.rent, period]
    );

    await client.query('COMMIT');
    return tenantId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Updates the tenant record and their active lease's terms. If the tenant has
 * no active lease yet (a pre-existing tenant created before this wiring
 * existed), a new one is created instead — healing the gap rather than
 * silently dropping the fields again.
 */
async function updateTenant(pool, id, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tenantRes = await client.query(
      `UPDATE tenants SET name = $1, email = $2, phone = $3 WHERE id = $4 RETURNING id`,
      [input.name, input.email, input.phone || null, id]
    );
    if (tenantRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    const dueDay = input.due_day || 1;
    const paymentPlan = input.payment_plan && input.payment_plan !== 'None' ? JSON.stringify(input.payment_plan) : null;
    const housingAuthority = input.housing_authority && input.housing_authority !== 'None' ? input.housing_authority : null;

    const activeLease = await client.query(
      `SELECT id FROM leases WHERE tenant_id = $1 AND status = 'active' LIMIT 1`,
      [id]
    );

    if (activeLease.rows.length > 0) {
      await client.query(
        `UPDATE leases SET unit_id = $1, rent_amount = $2, due_day = $3, start_date = $4, end_date = $5,
                           delinquency_notes = $6, eviction_notes = $7, housing_authority = $8, payment_plan = $9
          WHERE id = $10`,
        [
          input.unit_id, input.rent, dueDay, input.start_date, input.end_date,
          input.delinquency_notes || null, input.eviction_notes || null, housingAuthority, paymentPlan,
          activeLease.rows[0].id,
        ]
      );
    } else if (input.unit_id && input.start_date && input.end_date) {
      await client.query(
        `INSERT INTO leases (unit_id, tenant_id, rent_amount, due_day, start_date, end_date, status,
                              delinquency_notes, eviction_notes, housing_authority, payment_plan)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10)`,
        [
          input.unit_id, id, input.rent, dueDay, input.start_date, input.end_date,
          input.delinquency_notes || null, input.eviction_notes || null, housingAuthority, paymentPlan,
        ]
      );
    }

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Blocks deletion when the tenant has an active lease (leases.tenant_id is
 * ON DELETE RESTRICT, so this would otherwise surface as a raw DB error) and
 * returns a clear, actionable message instead.
 */
async function deleteTenant(pool, id) {
  const activeLease = await pool.query(
    `SELECT id FROM leases WHERE tenant_id = $1 AND status = 'active' LIMIT 1`,
    [id]
  );
  if (activeLease.rows.length > 0) {
    return { ok: false, error: 'This tenant has an active lease. End the lease before deleting the tenant.' };
  }
  const result = await pool.query('DELETE FROM tenants WHERE id = $1', [id]);
  return { ok: result.rowCount > 0 };
}

module.exports = { listTenants, createTenant, updateTenant, deleteTenant, formatTenant };
