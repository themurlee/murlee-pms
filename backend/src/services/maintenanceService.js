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

module.exports = {
  parseIncomingRequest,
};
