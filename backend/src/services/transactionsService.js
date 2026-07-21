function format(row) {
  return {
    id: row.id,
    transaction_date: row.transaction_date instanceof Date
      ? row.transaction_date.toISOString().split('T')[0]
      : row.transaction_date,
    description: row.description,
    amount: parseFloat(row.amount),
    category: row.category,
    account_class: row.account_class,
    source: row.source,
    payment_method: row.payment_method || '',
    property_id: row.property_id,
    entity_id: row.entity_id,
    invoice_id: row.invoice_id,
    reviewed: row.reviewed,
    memo: row.memo || '',
  };
}

async function listTransactions(pool, ownerId, filters = {}) {
  const clauses = ['owner_id = $1'];
  const params = [ownerId];
  const add = (sql, value) => { params.push(value); clauses.push(sql.replace('$?', `$${params.length}`)); };

  if (filters.account_class) add('account_class = $?', filters.account_class);
  if (filters.property_id) add('property_id = $?', filters.property_id);
  if (filters.entity_id) add('entity_id = $?', filters.entity_id);
  if (filters.category) add('category = $?', filters.category);
  if (filters.reviewed !== undefined) add('reviewed = $?', filters.reviewed);
  if (filters.from) add('transaction_date >= $?', filters.from);
  if (filters.to) add('transaction_date <= $?', filters.to);
  if (filters.q) add('description ILIKE $?', `%${filters.q}%`);

  const res = await pool.query(
    `SELECT id, transaction_date, description, amount, category, account_class, source,
            payment_method, property_id, entity_id, invoice_id, reviewed, memo
       FROM transactions
      WHERE ${clauses.join(' AND ')}
      ORDER BY transaction_date DESC, created_at DESC`,
    params
  );
  return res.rows.map(format);
}

async function createTransaction(pool, ownerId, input) {
  const res = await pool.query(
    `INSERT INTO transactions
       (owner_id, amount, transaction_date, description, category, property_id, entity_id,
        account_class, source, payment_method, reviewed, classification_flag)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      ownerId,
      input.amount,
      input.transaction_date,
      input.description || '',
      input.category || null,
      input.property_id || null,
      input.entity_id || null,
      input.account_class || 'real_estate',
      input.source || 'manual',
      input.payment_method || null,
      input.reviewed ?? false,
      'manual',
    ]
  );
  return res.rows[0].id;
}

const UPDATABLE = ['category', 'property_id', 'entity_id', 'account_class', 'reviewed', 'memo'];

async function updateTransaction(pool, ownerId, id, patch) {
  const keys = Object.keys(patch).filter((k) => UPDATABLE.includes(k));
  if (keys.length === 0) return false;

  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  const params = keys.map((k) => patch[k]);
  params.push(id, ownerId);

  const res = await pool.query(
    `UPDATE transactions SET ${sets.join(', ')}
      WHERE id = $${keys.length + 1} AND owner_id = $${keys.length + 2}
      RETURNING id`,
    params
  );
  return res.rows.length > 0;
}

async function deleteTransaction(pool, ownerId, id) {
  const res = await pool.query(
    'DELETE FROM transactions WHERE id = $1 AND owner_id = $2',
    [id, ownerId]
  );
  return res.rowCount > 0;
}

async function insertRentReceived(queryable, { ownerId, invoiceId, propertyId, entityId, amount, date, paymentMethod }) {
  const existing = await queryable.query(
    "SELECT id FROM transactions WHERE invoice_id = $1 AND category = 'Rent Received' LIMIT 1",
    [invoiceId]
  );
  if (existing.rows.length > 0) return null;

  const res = await queryable.query(
    `INSERT INTO transactions
       (owner_id, invoice_id, property_id, entity_id, amount, transaction_date, description,
        category, account_class, source, payment_method, reviewed, classification_flag)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'Rent Received', 'real_estate', 'manual', $8, TRUE, 'auto')
     RETURNING id`,
    [ownerId, invoiceId, propertyId || null, entityId || null, amount, date,
     'Rent payment received', paymentMethod || null]
  );
  return res.rows[0].id;
}

module.exports = {
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  insertRentReceived,
  format,
};
