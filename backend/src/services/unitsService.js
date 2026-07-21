const pool = require('../config/db');

// Units with their property, current (active-lease) tenant, lease term, and
// outstanding balance. Powers the property -> unit -> tenant cascade in the
// maintenance form, and the Rent Roll view (one row per unit).
const LIST_QUERY = `
  SELECT u.id, u.unit_number, u.beds, u.baths, u.sq_ft, u.market_rent,
         p.id AS property_id, p.nickname AS property_name,
         t.id AS tenant_id, t.name AS tenant_name, t.email AS tenant_email,
         l.rent_amount, l.start_date AS lease_start, l.end_date AS lease_end,
         (SELECT COALESCE(SUM(i.amount_due + i.late_fee + COALESCE((SELECT SUM(ii.amount) FROM invoice_items ii WHERE ii.invoice_id = i.id), 0)), 0)
            FROM invoices i WHERE i.lease_id = l.id AND i.status IN ('unpaid', 'overdue')) AS balance_due
  FROM units u
  JOIN properties p ON u.property_id = p.id
  LEFT JOIN leases l ON l.unit_id = u.id AND l.status = 'active'
  LEFT JOIN tenants t ON l.tenant_id = t.id
  WHERE p.owner_id = $1
  ORDER BY p.nickname, u.unit_number
`;

async function listUnits(ownerId) {
  const res = await pool.query(LIST_QUERY, [ownerId]);
  return res.rows.map((r) => ({
    id: r.id,
    unit_number: r.unit_number,
    beds: r.beds,
    baths: r.baths,
    sq_ft: r.sq_ft,
    market_rent: parseFloat(r.market_rent || 0),
    property_id: r.property_id,
    property_name: r.property_name,
    tenant_id: r.tenant_id,
    tenant_name: r.tenant_name,
    tenant_email: r.tenant_email,
    rent: r.tenant_id ? parseFloat(r.rent_amount || 0) : null,
    lease_start: r.lease_start instanceof Date ? r.lease_start.toISOString().split('T')[0] : r.lease_start,
    lease_end: r.lease_end instanceof Date ? r.lease_end.toISOString().split('T')[0] : r.lease_end,
    balance_due: r.tenant_id ? parseFloat(r.balance_due || 0) : null,
  }));
}

module.exports = { listUnits };
