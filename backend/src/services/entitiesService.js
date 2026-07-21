const pool = require('../config/db');

const LIST_QUERY = `
  SELECT e.id, e.name, e.entity_type, e.ein,
         COUNT(p.id)::int AS property_count
  FROM entities e
  LEFT JOIN properties p ON p.entity_id = e.id
  WHERE e.owner_id = $1
  GROUP BY e.id
  ORDER BY e.name
`;

function format(row) {
  return {
    id: row.id,
    name: row.name,
    entity_type: row.entity_type,
    ein: row.ein || '',
    property_count: row.property_count,
  };
}

async function listEntities(ownerId) {
  const res = await pool.query(LIST_QUERY, [ownerId]);
  return res.rows.map(format);
}

async function createEntity(ownerId, { name, entity_type, ein }) {
  const res = await pool.query(
    `INSERT INTO entities (owner_id, name, entity_type, ein) VALUES ($1, $2, $3, $4) RETURNING id`,
    [ownerId, name, entity_type || 'LLC', ein || null]
  );
  return res.rows[0].id;
}

async function updateEntity(ownerId, id, { name, entity_type, ein }) {
  const res = await pool.query(
    `UPDATE entities SET name = $1, entity_type = $2, ein = $3 WHERE id = $4 AND owner_id = $5 RETURNING id`,
    [name, entity_type || 'LLC', ein || null, id, ownerId]
  );
  return res.rows.length > 0;
}

async function deleteEntity(ownerId, id) {
  const res = await pool.query('DELETE FROM entities WHERE id = $1 AND owner_id = $2', [id, ownerId]);
  return res.rowCount > 0;
}

module.exports = { listEntities, createEntity, updateEntity, deleteEntity };
