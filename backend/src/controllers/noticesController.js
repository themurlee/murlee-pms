const noticesService = require('../services/noticesService');

const nowIso = () => new Date().toISOString();
let mockNotices = [
  { id: 'N-1', type: 'rent_reminder', channel: 'email', to_email: 'jane@example.com', subject: 'Rent reminder — due 2026-07-21', status: 'logged', created_at: nowIso(), tenant_name: 'Jane Doe' },
  { id: 'N-2', type: 'payment_confirmation', channel: 'email', to_email: 'john@example.com', subject: 'Payment received — thank you', status: 'logged', created_at: nowIso(), tenant_name: 'John Smith' },
];

async function getNotices(req, res) {
  if (!process.env.DATABASE_URL) {
    return res.json(mockNotices);
  }
  try {
    res.json(await noticesService.listNotices(req.user.id));
  } catch (error) {
    console.error('Failed to list notices:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function sendNotice(req, res) {
  const { tenant_id, subject, body } = req.body;
  if (!tenant_id || !subject || !body) {
    return res.status(400).json({ error: 'tenant_id, subject and body are required' });
  }

  if (!process.env.DATABASE_URL) {
    const entry = { id: `N-${Date.now()}`, type: 'adhoc', channel: 'email', to_email: 'tenant@example.com', subject, status: 'logged', created_at: nowIso(), tenant_name: 'Mock Tenant' };
    mockNotices = [entry, ...mockNotices];
    return res.status(201).json({ status: 'logged' });
  }

  try {
    const result = await noticesService.sendAdhoc(req.user.id, { tenant_id, subject, body });
    if (result.error) return res.status(404).json({ error: result.error });
    res.status(201).json(result);
  } catch (error) {
    console.error('Failed to send notice:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { getNotices, sendNotice };
