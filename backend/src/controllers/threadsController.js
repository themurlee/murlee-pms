const pool = require('../config/db');
const threadsService = require('../services/threadsService');
const { looksLikeMaintenanceRequest, createTicketFromInbound } = require('../services/maintenanceService');

const nowIso = () => new Date().toISOString();
let mockThreads = [
  { id: 'T-1', tenant_id: 't1', tenant_name: 'Jane Doe', subject: 'Leak in bathroom', last_message_preview: "Hi, there's a leak in the bathroom. Can you send someone?", last_message_at: nowIso(), unread: true },
];
let mockMessages = {
  'T-1': [
    { id: 'M-1', thread_id: 'T-1', direction: 'inbound', body: "Hi, there's a leak in the bathroom. Can you send someone?", created_at: nowIso() },
  ],
};

async function getThreads(req, res) {
  const unreadOnly = req.query.filter === 'unread';
  if (!process.env.DATABASE_URL) {
    return res.json(unreadOnly ? mockThreads.filter((t) => t.unread) : mockThreads);
  }
  try {
    res.json(await threadsService.listThreads(pool, req.user.id, { unreadOnly }));
  } catch (error) {
    console.error('Failed to list threads:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function getThreadMessages(req, res) {
  const { id } = req.params;
  if (!process.env.DATABASE_URL) {
    return res.json(mockMessages[id] || []);
  }
  try {
    res.json(await threadsService.getMessages(pool, id));
  } catch (error) {
    console.error('Failed to get thread messages:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function postThread(req, res) {
  const { tenant_id, subject, body } = req.body;
  if (!tenant_id || !subject || !body) {
    return res.status(400).json({ error: 'tenant_id, subject and body are required' });
  }

  if (!process.env.DATABASE_URL) {
    const thread = { id: `T-${Date.now()}`, tenant_id, tenant_name: 'Mock Tenant', subject, last_message_preview: body.slice(0, 280), last_message_at: nowIso(), unread: false };
    mockThreads = [thread, ...mockThreads];
    mockMessages[thread.id] = [{ id: `M-${Date.now()}`, thread_id: thread.id, direction: 'outbound', body, created_at: nowIso() }];
    return res.status(201).json(thread);
  }

  try {
    const result = await threadsService.createThread(pool, { ownerId: req.user.id, tenantId: tenant_id, subject, body });
    if (result.error) return res.status(404).json({ error: result.error });
    res.status(201).json(result);
  } catch (error) {
    console.error('Failed to create thread:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function postThreadMessage(req, res) {
  const { id } = req.params;
  const { body } = req.body;
  if (!body || !body.trim()) {
    return res.status(400).json({ error: 'body is required' });
  }

  if (!process.env.DATABASE_URL) {
    if (!mockMessages[id]) return res.status(404).json({ error: 'Thread not found' });
    const message = { id: `M-${Date.now()}`, thread_id: id, direction: 'outbound', body, created_at: nowIso() };
    mockMessages[id].push(message);
    mockThreads = mockThreads.map((t) => (t.id === id ? { ...t, last_message_preview: body.slice(0, 280), last_message_at: nowIso() } : t));
    return res.status(201).json(message);
  }

  try {
    const result = await threadsService.replyToThread(pool, { threadId: id, body });
    if (result.error) return res.status(404).json({ error: result.error });
    res.status(201).json(result);
  } catch (error) {
    console.error('Failed to reply to thread:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function patchThread(req, res) {
  const { id } = req.params;
  if (!process.env.DATABASE_URL) {
    mockThreads = mockThreads.map((t) => (t.id === id ? { ...t, unread: false } : t));
    return res.json({ message: 'Mock thread marked read' });
  }
  try {
    await threadsService.markRead(pool, id);
    res.json({ message: 'Thread marked read' });
  } catch (error) {
    console.error('Failed to mark thread read:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// Dev/manual fallback for exercising the inbound pipeline before the Gmail
// poller has real credentials to run against.
async function postSimulateInbound(req, res) {
  const { from_email, from_name, subject, body } = req.body;
  if (!from_email || !body) {
    return res.status(400).json({ error: 'from_email and body are required' });
  }

  const flaggedAsMaintenance = looksLikeMaintenanceRequest(subject, body);

  if (!process.env.DATABASE_URL) {
    const thread = { id: `T-${Date.now()}`, tenant_id: null, tenant_name: from_name || from_email, subject: subject || '(no subject)', last_message_preview: body.slice(0, 280), last_message_at: nowIso(), unread: true };
    mockThreads = [thread, ...mockThreads];
    mockMessages[thread.id] = [{ id: `M-${Date.now()}`, thread_id: thread.id, direction: 'inbound', body, created_at: nowIso() }];
    return res.status(201).json({ threadId: thread.id, matchedBy: 'none', maintenanceTicketCreated: flaggedAsMaintenance });
  }

  try {
    const result = await threadsService.matchInboundMessage(pool, { ownerId: req.user.id, fromEmail: from_email, fromName: from_name, subject, body });

    let maintenanceTicketId = null;
    if (flaggedAsMaintenance) {
      const ticketResult = await createTicketFromInbound({ fromEmail: from_email, fromName: from_name, subject, body });
      maintenanceTicketId = ticketResult.ticketId;
    }

    res.status(201).json({ ...result, maintenanceTicketId });
  } catch (error) {
    console.error('Failed to simulate inbound message:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { getThreads, getThreadMessages, postThread, postThreadMessage, patchThread, postSimulateInbound };
