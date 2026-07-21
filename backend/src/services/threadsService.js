const { deliver } = require('./emailService');

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

async function createThread(pool, { ownerId, tenantId, subject, body }) {
  const tenantRes = await pool.query('SELECT email, name FROM tenants WHERE id = $1', [tenantId]);
  const tenant = tenantRes.rows[0];
  if (!tenant) return { error: 'Tenant not found' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const preview = body.slice(0, 280);
    const threadRes = await client.query(
      `INSERT INTO message_threads (owner_id, tenant_id, counterparty_email, subject, last_message_preview, last_message_at, unread)
       VALUES ($1, $2, $3, $4, $5, NOW(), false) RETURNING id`,
      [ownerId, tenantId, tenant.email, subject, preview]
    );
    const threadId = threadRes.rows[0].id;

    const sendResult = await deliver(tenant.email, subject, `<p>${String(body).replace(/\n/g, '<br/>')}</p>`);

    await client.query(
      `INSERT INTO messages (thread_id, direction, body, gmail_message_id) VALUES ($1, 'outbound', $2, $3)`,
      [threadId, body, sendResult.messageId || null]
    );

    await client.query('COMMIT');
    return { id: threadId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function replyToThread(pool, { threadId, body }) {
  const threadRes = await pool.query(
    'SELECT id, subject, counterparty_email FROM message_threads WHERE id = $1',
    [threadId]
  );
  const thread = threadRes.rows[0];
  if (!thread) return { error: 'Thread not found' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sendResult = await deliver(thread.counterparty_email, `Re: ${thread.subject}`, `<p>${String(body).replace(/\n/g, '<br/>')}</p>`);

    const msgRes = await client.query(
      `INSERT INTO messages (thread_id, direction, body, gmail_message_id) VALUES ($1, 'outbound', $2, $3) RETURNING id`,
      [threadId, body, sendResult.messageId || null]
    );

    const preview = body.slice(0, 280);
    await client.query(
      'UPDATE message_threads SET last_message_preview = $1, last_message_at = NOW() WHERE id = $2',
      [preview, threadId]
    );

    await client.query('COMMIT');
    return { id: msgRes.rows[0].id };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function markRead(pool, threadId) {
  const res = await pool.query('UPDATE message_threads SET unread = false WHERE id = $1', [threadId]);
  return { ok: res.rowCount > 0 };
}

async function matchInboundMessage(pool, { ownerId, fromEmail, fromName, subject, body, gmailMessageId, inReplyTo }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let threadId = null;
    let matchedBy = 'none';
    let tenantId = null;

    if (inReplyTo) {
      const r = await client.query('SELECT thread_id FROM messages WHERE gmail_message_id = $1 LIMIT 1', [inReplyTo]);
      if (r.rows[0]) { threadId = r.rows[0].thread_id; matchedBy = 'reply'; }
    }

    if (!threadId) {
      const t = await client.query('SELECT id FROM tenants WHERE email ILIKE $1 LIMIT 1', [fromEmail]);
      if (t.rows[0]) {
        tenantId = t.rows[0].id;
        const existing = await client.query(
          'SELECT id FROM message_threads WHERE owner_id = $1 AND tenant_id = $2 ORDER BY last_message_at DESC LIMIT 1',
          [ownerId, tenantId]
        );
        if (existing.rows[0]) { threadId = existing.rows[0].id; matchedBy = 'tenant'; }
      }
    }

    const preview = String(body).slice(0, 280);

    if (!threadId) {
      const created = await client.query(
        `INSERT INTO message_threads (owner_id, tenant_id, counterparty_email, subject, last_message_preview, last_message_at, unread)
         VALUES ($1, $2, $3, $4, $5, NOW(), true) RETURNING id`,
        [ownerId, tenantId, fromEmail, subject || '(no subject)', preview]
      );
      threadId = created.rows[0].id;
      if (tenantId) matchedBy = 'tenant';
    } else {
      await client.query(
        'UPDATE message_threads SET last_message_preview = $1, last_message_at = NOW(), unread = true WHERE id = $2',
        [preview, threadId]
      );
    }

    await client.query(
      `INSERT INTO messages (thread_id, direction, body, gmail_message_id) VALUES ($1, 'inbound', $2, $3)`,
      [threadId, body, gmailMessageId || null]
    );

    await client.query('COMMIT');
    return { threadId, matchedBy };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { listThreads, getMessages, createThread, replyToThread, markRead, matchInboundMessage };
