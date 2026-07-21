function formatThread(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    tenant_name: row.tenant_name,
    subject: row.subject,
    last_message_preview: row.last_message_preview,
    last_message_at: row.last_message_at,
    unread: row.unread,
  };
}

async function listThreads(pool, ownerId, { unreadOnly = false } = {}) {
  const query = `
    SELECT mt.id, mt.tenant_id, mt.subject, mt.last_message_preview, mt.last_message_at, mt.unread,
           COALESCE(t.name, mt.counterparty_email) AS tenant_name
    FROM message_threads mt
    LEFT JOIN tenants t ON t.id = mt.tenant_id
    WHERE mt.owner_id = $1 ${unreadOnly ? 'AND mt.unread = true' : ''}
    ORDER BY mt.last_message_at DESC
    LIMIT 200
  `;
  const res = await pool.query(query, [ownerId]);
  return res.rows.map(formatThread);
}

async function getMessages(pool, threadId) {
  const res = await pool.query(
    'SELECT id, thread_id, direction, body, created_at FROM messages WHERE thread_id = $1 ORDER BY created_at ASC',
    [threadId]
  );
  return res.rows;
}

module.exports = { listThreads, getMessages };
