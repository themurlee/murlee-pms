const cron = require('node-cron');
const threadsService = require('../services/threadsService');

function extractMessageFields(parsed) {
  const from = parsed.from?.value?.[0] || {};
  return {
    fromEmail: from.address || null,
    fromName: from.name || null,
    subject: parsed.subject || '(no subject)',
    body: (parsed.text || '').trim(),
    gmailMessageId: parsed.messageId || null,
    inReplyTo: parsed.inReplyTo || null,
  };
}

// Connects to Gmail over IMAP, reads every unseen message in INBOX, feeds each
// one through the same matchInboundMessage() the simulate-inbound endpoint
// uses, then marks it \Seen so it isn't reprocessed next poll.
async function pollOnce(pool, ownerId) {
  const { ImapFlow } = require('imapflow');
  const { simpleParser } = require('mailparser');

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      for await (const msg of client.fetch({ seen: false }, { source: true })) {
        const parsed = await simpleParser(msg.source);
        const fields = extractMessageFields(parsed);
        if (fields.fromEmail) {
          await threadsService.matchInboundMessage(pool, { ownerId, ...fields });
        }
        await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

function startGmailPoller(pool, ownerId) {
  cron.schedule('*/1 * * * *', async () => {
    try {
      await pollOnce(pool, ownerId);
    } catch (err) {
      console.error('[gmail-poller] poll failed:', err.message);
    }
  });
  console.log('Gmail inbound poller started (every 60s).');
}

module.exports = { extractMessageFields, pollOnce, startGmailPoller };
