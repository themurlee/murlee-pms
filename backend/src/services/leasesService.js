const pool = require('../config/db');

const LIST_QUERY = `
  SELECT l.id, l.rent_amount, l.due_day, l.start_date, l.end_date, l.status,
         t.name AS tenant_name, u.unit_number
  FROM leases l
  JOIN tenants t ON t.id = l.tenant_id
  JOIN units u ON u.id = l.unit_id
  ORDER BY l.start_date DESC
`;

async function listLeases() {
  const result = await pool.query(LIST_QUERY);
  return result.rows.map(row => ({
    id: row.id,
    tenant_name: row.tenant_name,
    unit_number: row.unit_number,
    rent_amount: parseFloat(row.rent_amount),
    due_day: row.due_day,
    start_date: row.start_date,
    end_date: row.end_date,
    status: row.status,
  }));
}

async function createLease({ unit_id, tenant_id, rent_amount, due_day, start_date, end_date }) {
  const result = await pool.query(
    `INSERT INTO leases (unit_id, tenant_id, rent_amount, due_day, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [unit_id, tenant_id, rent_amount, due_day || 1, start_date, end_date]
  );
  return result.rows[0].id;
}

module.exports = { listLeases, createLease };
