// Append-only audit trail. There is deliberately no update/delete function
// here — every write to an entity gets one INSERT, never a mutation of a
// prior entry, so the log stays trustworthy as a record of what happened.
async function log(pool, {
  entity_type,
  entity_id,
  action,
  before = null,
  after,
  reason = null,
  user_id = null,
  ip_address = null,
}) {
  const res = await pool.query(
    `INSERT INTO audit_logs
       (entity_type, entity_id, action, before, after, reason, user_id, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      entity_type,
      entity_id,
      action,
      before !== null ? JSON.stringify(before) : null,
      after !== null && after !== undefined ? JSON.stringify(after) : null,
      reason,
      user_id,
      ip_address,
    ]
  );
  return res.rows[0].id;
}

async function queryLog(pool, {
  entity_type,
  entity_id,
  user_id,
  action,
  since,
  limit = 100,
  offset = 0,
} = {}) {
  const clauses = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    clauses.push(sql.replace('$?', `$${params.length}`));
  };

  if (entity_type) add('entity_type = $?', entity_type);
  if (entity_id) add('entity_id = $?', entity_id);
  if (user_id) add('user_id = $?', user_id);
  if (action) add('action = $?', action);
  if (since) add('"timestamp" >= $?', since);

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit, offset);

  const res = await pool.query(
    `SELECT * FROM audit_logs ${where} ORDER BY "timestamp" DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return res.rows;
}

module.exports = { log, queryLog };
