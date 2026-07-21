const pool = require('../config/db');

/**
 * Dispatches automated response using communication pipeline
 * @param {string} recipient 
 * @param {string} body 
 * @param {string} channelType 
 */
async function sendAutoResponse(recipient, body, channelType) {
  // Integrates with SendGrid or Twilio APIs in production environments
  console.log(`Auto-response dispatched via ${channelType} to ${recipient}: "${body}"`);
}

/**
 * Handles incoming emails or SMS notifications, inserting maintenance tickets automatically
 * @param {string} sender 
 * @param {string} messageBody 
 * @param {string} channelType 
 */
async function parseIncomingRequest(sender, messageBody, channelType) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let tenantRes;
    if (channelType === 'email') {
      tenantRes = await client.query('SELECT id FROM tenants WHERE email = $1', [sender]);
    } else {
      tenantRes = await client.query('SELECT id FROM tenants WHERE phone = $1', [sender]);
    }

    const tenantId = tenantRes.rows[0]?.id || null;
    let leaseId = null;
    let unitId = null;

    if (tenantId) {
      const leaseRes = await client.query(
        "SELECT id, unit_id FROM leases WHERE tenant_id = $1 AND status = 'active'",
        [tenantId]
      );
      leaseId = leaseRes.rows[0]?.id || null;
      unitId = leaseRes.rows[0]?.unit_id || null;
    }

    const ticketRes = await client.query(
      `INSERT INTO maintenance_tickets (tenant_id, unit_id, issue_description, status, channel)
       VALUES ($1, $2, $3, 'open', $4) RETURNING id`,
      [tenantId, unitId, messageBody, channelType]
    );

    await client.query('COMMIT');

    const ticketId = ticketRes.rows[0].id;
    const responseBody = `Logged ticket ID ${ticketId}. Auto-responder active. Technical representative will schedule contact.`;
    await sendAutoResponse(sender, responseBody, channelType);

    return ticketId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const LIST_QUERY = `
  SELECT m.id, m.issue_description, m.status, m.channel, m.priority, m.category, m.reported_at, m.created_at,
         t.name AS tenant_name,
         u.unit_number,
         COALESCE(pm.nickname, pu.nickname) AS property_name
  FROM maintenance_tickets m
  LEFT JOIN tenants t ON t.id = m.tenant_id
  LEFT JOIN units u ON u.id = m.unit_id
  LEFT JOIN properties pu ON pu.id = u.property_id
  LEFT JOIN properties pm ON pm.id = m.property_id
  ORDER BY m.reported_at DESC, m.created_at DESC
`;

function formatTicket(row) {
  const reported = row.reported_at instanceof Date ? row.reported_at.toISOString().split('T')[0] : row.reported_at;
  return {
    id: row.id,
    tenant: row.tenant_name || 'Unknown',
    issue: row.issue_description,
    status: row.status,
    channel: row.channel || 'manual',
    priority: row.priority || 'medium',
    category: row.category || 'general',
    reported_at: reported,
    property_name: row.property_name || null,
    unit_number: row.unit_number || null,
  };
}

async function listTickets() {
  const result = await pool.query(LIST_QUERY);
  return result.rows.map(formatTicket);
}

/**
 * Manual ticket creation from the landlord UI. Accepts explicit ids from the
 * form's property/unit/tenant dropdowns; falls back to matching a tenant by name
 * (for legacy free-text input) when ids aren't supplied.
 */
async function createManualTicket({ propertyId, unitId, tenantId, tenantName, issueDescription, channel, status, priority, category, reportedAt }) {
  let resolvedTenantId = tenantId || null;
  let resolvedUnitId = unitId || null;
  let resolvedPropertyId = propertyId || null;

  if (!resolvedTenantId && tenantName) {
    const tenantRes = await pool.query('SELECT id FROM tenants WHERE name ILIKE $1 LIMIT 1', [tenantName]);
    resolvedTenantId = tenantRes.rows[0]?.id || null;
  }

  // Derive unit/property from the tenant's active lease when not explicitly chosen.
  if (resolvedTenantId && !resolvedUnitId) {
    const leaseRes = await pool.query(
      "SELECT unit_id FROM leases WHERE tenant_id = $1 AND status = 'active' LIMIT 1",
      [resolvedTenantId]
    );
    resolvedUnitId = leaseRes.rows[0]?.unit_id || null;
  }
  if (resolvedUnitId && !resolvedPropertyId) {
    const unitRes = await pool.query('SELECT property_id FROM units WHERE id = $1', [resolvedUnitId]);
    resolvedPropertyId = unitRes.rows[0]?.property_id || null;
  }

  const result = await pool.query(
    `INSERT INTO maintenance_tickets (tenant_id, unit_id, property_id, issue_description, status, channel, priority, category, reported_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, CURRENT_DATE)) RETURNING id`,
    [resolvedTenantId, resolvedUnitId, resolvedPropertyId, issueDescription, status || 'open', channel || 'manual', priority || 'medium', category || 'general', reportedAt || null]
  );
  return result.rows[0].id;
}

/**
 * Creates a ticket from an inbound email, matching the sender to a tenant by
 * (1) email, then (2) name, then (3) property address hint. Records which signal
 * matched so the UI can show how it was linked. Returns { ticketId, matchedBy }.
 */
async function createTicketFromInbound({ fromEmail, fromName, propertyHint, subject, body }) {
  let tenantId = null;
  let matchedBy = 'none';

  if (fromEmail) {
    const r = await pool.query('SELECT id FROM tenants WHERE email ILIKE $1 LIMIT 1', [fromEmail]);
    if (r.rows[0]) { tenantId = r.rows[0].id; matchedBy = 'email'; }
  }
  if (!tenantId && fromName) {
    const r = await pool.query('SELECT id FROM tenants WHERE name ILIKE $1 LIMIT 1', [`%${fromName}%`]);
    if (r.rows[0]) { tenantId = r.rows[0].id; matchedBy = 'name'; }
  }

  let unitId = null;
  let propertyId = null;

  if (tenantId) {
    const lease = await pool.query(
      "SELECT unit_id FROM leases WHERE tenant_id = $1 AND status = 'active' LIMIT 1",
      [tenantId]
    );
    unitId = lease.rows[0]?.unit_id || null;
    if (unitId) {
      const u = await pool.query('SELECT property_id FROM units WHERE id = $1', [unitId]);
      propertyId = u.rows[0]?.property_id || null;
    }
  }

  // Fall back to matching a property by address text (JSONB address -> text search).
  if (!propertyId && propertyHint) {
    const p = await pool.query(
      `SELECT id FROM properties WHERE nickname ILIKE $1 OR address::text ILIKE $1 LIMIT 1`,
      [`%${propertyHint}%`]
    );
    if (p.rows[0]) { propertyId = p.rows[0].id; if (matchedBy === 'none') matchedBy = 'property'; }
  }

  const issue = subject ? `${subject}\n\n${body || ''}`.trim() : (body || 'Inbound maintenance request');
  const result = await pool.query(
    `INSERT INTO maintenance_tickets (tenant_id, unit_id, property_id, issue_description, status, channel, priority, category, reported_at)
     VALUES ($1, $2, $3, $4, 'open', 'email', 'medium', 'general', CURRENT_DATE) RETURNING id`,
    [tenantId, unitId, propertyId, issue]
  );

  return { ticketId: result.rows[0].id, matchedBy };
}

/**
 * Updates a ticket's status and returns the tenant/owner context needed to email
 * a maintenance update, or null if the ticket doesn't exist.
 */
async function updateTicketStatus(id, status) {
  const updated = await pool.query(
    'UPDATE maintenance_tickets SET status = $1 WHERE id = $2 RETURNING id, issue_description',
    [status, id]
  );
  if (updated.rows.length === 0) return null;

  const ctx = await pool.query(
    `SELECT m.issue_description, t.id AS tenant_id, t.name AS tenant_name, t.email AS tenant_email,
            p.owner_id
     FROM maintenance_tickets m
     LEFT JOIN tenants t ON t.id = m.tenant_id
     LEFT JOIN units u ON u.id = m.unit_id
     LEFT JOIN properties p ON p.id = u.property_id
     WHERE m.id = $1`,
    [id]
  );
  return ctx.rows[0] || { issue_description: updated.rows[0].issue_description };
}

module.exports = {
  parseIncomingRequest,
  listTickets,
  createManualTicket,
  createTicketFromInbound,
  updateTicketStatus,
};
