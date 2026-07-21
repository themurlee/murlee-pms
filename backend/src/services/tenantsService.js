const pool = require('../config/db');

const LIST_QUERY = `
  SELECT t.id, t.name, t.email, t.phone,
         u.unit_number, pr.nickname AS property_name,
         l.rent_amount, l.delinquency_notes, l.eviction_notes, l.housing_authority, l.payment_plan
  FROM tenants t
  LEFT JOIN leases l ON l.tenant_id = t.id AND l.status = 'active'
  LEFT JOIN units u ON l.unit_id = u.id
  LEFT JOIN properties pr ON u.property_id = pr.id
  WHERE t.role = 'tenant'
  ORDER BY t.name
`;

function formatTenant(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    unit: row.unit_number ? `${row.property_name} #${row.unit_number}` : '',
    rent: parseFloat(row.rent_amount || 0),
    delinquency_notes: row.delinquency_notes || '',
    eviction_notes: row.eviction_notes || '',
    housing_authority: row.housing_authority || 'None',
    payment_plan: row.payment_plan ? JSON.stringify(row.payment_plan) : 'None',
    documents: [],
  };
}

async function listTenants() {
  const result = await pool.query(LIST_QUERY);
  return result.rows.map(formatTenant);
}

async function createTenant({ name, email, phone }) {
  const result = await pool.query(
    `INSERT INTO tenants (name, email, phone, role) VALUES ($1, $2, $3, 'tenant') RETURNING id`,
    [name, email, phone || null]
  );
  return result.rows[0].id;
}

async function updateTenant(id, { name, email, phone }) {
  const result = await pool.query(
    `UPDATE tenants SET name = $1, email = $2, phone = $3 WHERE id = $4 RETURNING id`,
    [name, email, phone || null, id]
  );
  return result.rows.length > 0;
}

async function deleteTenant(id) {
  const result = await pool.query('DELETE FROM tenants WHERE id = $1', [id]);
  return result.rowCount > 0;
}

module.exports = { listTenants, createTenant, updateTenant, deleteTenant };
