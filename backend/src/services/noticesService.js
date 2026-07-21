const pool = require('../config/db');
const { sendNotice } = require('./emailService');

const LIST_QUERY = `
  SELECT n.id, n.type, n.channel, n.to_email, n.subject, n.status, n.created_at,
         t.name AS tenant_name
  FROM notices n
  LEFT JOIN tenants t ON t.id = n.tenant_id
  WHERE n.owner_id = $1
  ORDER BY n.created_at DESC
  LIMIT 200
`;

async function listNotices(ownerId) {
  const res = await pool.query(LIST_QUERY, [ownerId]);
  return res.rows.map((r) => ({
    id: r.id,
    type: r.type,
    channel: r.channel,
    to_email: r.to_email,
    subject: r.subject,
    status: r.status,
    created_at: r.created_at,
    tenant_name: r.tenant_name || 'Unknown',
  }));
}

async function sendAdhoc(ownerId, { tenant_id, subject, body }) {
  const tenantRes = await pool.query('SELECT id, name, email FROM tenants WHERE id = $1', [tenant_id]);
  const tenant = tenantRes.rows[0];
  if (!tenant) return { error: 'Tenant not found' };

  const result = await sendNotice({
    ownerId, tenantId: tenant.id, type: 'adhoc',
    to: tenant.email, subject,
    html: `<p>${String(body).replace(/\n/g, '<br/>')}</p>`,
  });
  return { status: result.status };
}

module.exports = { listNotices, sendAdhoc };
