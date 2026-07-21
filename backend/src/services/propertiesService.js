const pool = require('../config/db');

const LIST_QUERY = `
  SELECT p.id, p.nickname, p.address, p.estimated_rent_roll, p.property_type, p.entity_id,
         e.name AS entity_name,
         COUNT(u.id)::int AS unit_count,
         COALESCE(SUM(u.market_rent), 0) AS market_rent_total
  FROM properties p
  LEFT JOIN units u ON u.property_id = p.id
  LEFT JOIN entities e ON e.id = p.entity_id
  WHERE p.owner_id = $1
  GROUP BY p.id, e.name
  ORDER BY p.nickname
`;

const UNITS_QUERY = `SELECT id, unit_number, beds, baths, sq_ft, market_rent FROM units WHERE property_id = $1 ORDER BY unit_number`;

function formatAddress(address) {
  if (typeof address === 'string') return address;
  if (address && typeof address === 'object') {
    return [address.street, address.city, address.state, address.zip].filter(Boolean).join(', ');
  }
  return '';
}

function formatProperty(row) {
  const rentRoll = parseFloat(row.market_rent_total || 0) || parseFloat(row.estimated_rent_roll || 0);
  return {
    id: row.id,
    name: row.nickname,
    address: formatAddress(row.address),
    address_parts: (row.address && typeof row.address === 'object') ? row.address : { street: formatAddress(row.address) },
    property_type: row.property_type || 'Single-Family',
    entity_id: row.entity_id || null,
    entity_name: row.entity_name || null,
    units: row.unit_count,
    income: rentRoll,
  };
}

async function listProperties(ownerId) {
  const result = await pool.query(LIST_QUERY, [ownerId]);
  return result.rows.map(formatProperty);
}

// Full detail incl. individual units (used by the drilldown / edit form).
async function getProperty(ownerId, id) {
  const propRes = await pool.query(
    `SELECT p.*, e.name AS entity_name FROM properties p LEFT JOIN entities e ON e.id = p.entity_id WHERE p.id = $1 AND p.owner_id = $2`,
    [id, ownerId]
  );
  if (propRes.rows.length === 0) return null;
  const unitsRes = await pool.query(UNITS_QUERY, [id]);
  return {
    ...formatProperty({ ...propRes.rows[0], unit_count: unitsRes.rows.length, market_rent_total: unitsRes.rows.reduce((s, u) => s + parseFloat(u.market_rent || 0), 0) }),
    unit_list: unitsRes.rows.map((u) => ({
      id: u.id, unit_number: u.unit_number, beds: u.beds, baths: u.baths, sq_ft: u.sq_ft, market_rent: parseFloat(u.market_rent || 0),
    })),
  };
}

const buildAddress = (address) =>
  typeof address === 'object' && address !== null
    ? { street: address.street || '', city: address.city || '', state: address.state || '', zip: address.zip || '' }
    : { street: address || '' };

/**
 * Create a property with structured address, type, entity link, and a list of
 * units each with their own beds/baths/sqft/market rent. Falls back to a single
 * bare unit (or a count) when no unit_list is supplied.
 */
async function createProperty(ownerId, { name, address, property_type, entity_id, units, unit_list, income }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rentRoll = Array.isArray(unit_list) && unit_list.length
      ? unit_list.reduce((s, u) => s + (Number(u.market_rent) || 0), 0)
      : (Number(income) || 0);

    const propRes = await client.query(
      `INSERT INTO properties (owner_id, entity_id, nickname, address, property_type, estimated_rent_roll)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [ownerId, entity_id || null, name, JSON.stringify(buildAddress(address)), property_type || 'Single-Family', rentRoll]
    );
    const propertyId = propRes.rows[0].id;

    const list = Array.isArray(unit_list) && unit_list.length
      ? unit_list
      : Array.from({ length: Math.max(1, Number(units) || 1) }, (_, i) => ({ unit_number: `Unit ${i + 1}` }));

    for (const u of list) {
      await client.query(
        `INSERT INTO units (property_id, unit_number, beds, baths, sq_ft, market_rent)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [propertyId, u.unit_number || 'Unit 1', u.beds || null, u.baths || null, u.sq_ft || null, Number(u.market_rent) || 0]
      );
    }

    await client.query('COMMIT');
    return propertyId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateProperty(ownerId, id, { name, address, property_type, entity_id, income }) {
  const result = await pool.query(
    `UPDATE properties SET nickname = $1, address = $2, property_type = $3, entity_id = $4, estimated_rent_roll = $5
     WHERE id = $6 AND owner_id = $7 RETURNING id`,
    [name, JSON.stringify(buildAddress(address)), property_type || 'Single-Family', entity_id || null, Number(income) || 0, id, ownerId]
  );
  return result.rows.length > 0;
}

async function deleteProperty(ownerId, id) {
  const result = await pool.query(
    'DELETE FROM properties WHERE id = $1 AND owner_id = $2',
    [id, ownerId]
  );
  return result.rowCount > 0;
}

module.exports = { listProperties, getProperty, createProperty, updateProperty, deleteProperty, formatProperty };
