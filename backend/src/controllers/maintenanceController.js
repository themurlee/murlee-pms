const maintenanceService = require('../services/maintenanceService');
const { sendNotice } = require('../services/emailService');

const STATUS_MAP = { completed: 'resolved' };
const normalizeStatus = (status) => STATUS_MAP[status] || status;

const today = () => new Date().toISOString().split('T')[0];
let mockTickets = [
  { id: '1', tenant: 'Jane Doe', issue: 'Leaky faucet in bathroom', status: 'open', channel: 'sms', priority: 'medium', category: 'plumbing', reported_at: today(), property_name: 'Oakridge Manor', unit_number: '101' },
  { id: '2', tenant: 'John Smith', issue: 'AC unit blowing warm air', status: 'in_progress', channel: 'email', priority: 'high', category: 'hvac', reported_at: today(), property_name: 'Pacific Breeze', unit_number: '4' },
];

async function getTickets(req, res) {
  if (!process.env.DATABASE_URL) {
    return res.json(mockTickets);
  }
  try {
    res.json(await maintenanceService.listTickets());
  } catch (error) {
    console.error('Failed to list maintenance tickets:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function createTicket(req, res) {
  const { tenant, tenant_id, unit_id, property_id, property_name, unit_number, issue, channel, status, priority, category, reported_at } = req.body;
  if (!issue) {
    return res.status(400).json({ error: 'issue is required' });
  }
  const normalizedStatus = normalizeStatus(status);

  if (!process.env.DATABASE_URL) {
    const newTicket = {
      id: String(mockTickets.length + 1), tenant: tenant || 'Unassigned', issue,
      status: normalizedStatus || 'open', channel: channel || 'manual',
      priority: priority || 'medium', category: category || 'general',
      reported_at: reported_at || today(), property_name: property_name || null, unit_number: unit_number || null,
    };
    mockTickets = [newTicket, ...mockTickets];
    return res.status(201).json(newTicket);
  }

  try {
    const id = await maintenanceService.createManualTicket({
      tenantId: tenant_id, unitId: unit_id, propertyId: property_id, tenantName: tenant,
      issueDescription: issue, channel, status: normalizedStatus, priority, category, reportedAt: reported_at,
    });
    res.status(201).json({ id });
  } catch (error) {
    console.error('Failed to create maintenance ticket:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// Inbound email -> ticket. An email provider (or a Gmail poller — see queued work)
// POSTs the parsed message here; we match it to a tenant/property and open a ticket.
async function inboundEmail(req, res) {
  const { from_email, from_name, property_hint, subject, body } = req.body;
  if (!from_email && !from_name && !property_hint) {
    return res.status(400).json({ error: 'from_email, from_name or property_hint is required to match a ticket' });
  }

  if (!process.env.DATABASE_URL) {
    const newTicket = {
      id: String(mockTickets.length + 1), tenant: from_name || from_email || 'Unknown',
      issue: subject ? `${subject}` : (body || 'Inbound request'), status: 'open', channel: 'email',
      priority: 'medium', category: 'general', reported_at: today(), property_name: property_hint || null, unit_number: null,
    };
    mockTickets = [newTicket, ...mockTickets];
    return res.status(201).json({ ticketId: newTicket.id, matchedBy: from_email ? 'email' : from_name ? 'name' : 'property' });
  }

  try {
    const result = await maintenanceService.createTicketFromInbound({
      fromEmail: from_email, fromName: from_name, propertyHint: property_hint, subject, body,
    });
    res.status(201).json(result);
  } catch (error) {
    console.error('Failed to process inbound email:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function updateTicketStatus(req, res) {
  const { id } = req.params;
  const status = normalizeStatus(req.body.status);

  if (!process.env.DATABASE_URL) {
    mockTickets = mockTickets.map(t => (t.id === id ? { ...t, status } : t));
    return res.json({ message: 'Mock ticket updated' });
  }

  try {
    const ctx = await maintenanceService.updateTicketStatus(id, status);
    if (!ctx) return res.status(404).json({ error: 'Ticket not found' });

    // Notify the tenant of the status change (fire-and-forget).
    if (ctx.owner_id && ctx.tenant_email) {
      const label = status.replace('_', ' ');
      sendNotice({
        ownerId: ctx.owner_id, tenantId: ctx.tenant_id, ticketId: id, type: 'maintenance_update',
        to: ctx.tenant_email, subject: `Maintenance update: ${label}`,
        html: `<p>Hi ${ctx.tenant_name},</p><p>Your maintenance request${ctx.issue_description ? ` ("${ctx.issue_description}")` : ''} is now <strong>${label}</strong>.</p><p>Murlee PMS</p>`,
      }).catch((e) => console.error('Maintenance update email failed:', e.message));
    }

    res.json({ message: 'Ticket updated successfully' });
  } catch (error) {
    console.error('Failed to update maintenance ticket:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { getTickets, createTicket, inboundEmail, updateTicketStatus };
