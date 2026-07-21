const pool = require('../config/db');

// Units with their property and current (active-lease) tenant. Powers the
// property -> unit -> tenant cascade in the maintenance form.
const LIST_QUERY = `
  SELECT u.id, u.unit_number, u.beds, u.baths, u.sq_ft, u.market_rent,
         p.id AS property_id, p.nickname AS property_name,
         t.id AS tenant_id, t.name AS tenant_name, t.email AS tenant_email
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
  }));
}

module.exports = { listUnits };
