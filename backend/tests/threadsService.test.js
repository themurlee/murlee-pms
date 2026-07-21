const threadsService = require('../src/services/threadsService');

function makeFakePool(queryImpl) {
  return { query: queryImpl, connect: async () => makeFakeClient(queryImpl) };
}

function makeFakeClient(queryImpl) {
  return { query: queryImpl, release: () => {} };
}

describe('threadsService.listThreads', () => {
  test('formats rows into the Thread shape', async () => {
    const pool = makeFakePool(async (text) => {
      expect(text).toMatch(/FROM message_threads/);
      return {
        rows: [
          { id: 't1', tenant_id: 'tn1', tenant_name: 'Jane Doe', subject: 'Leak', last_message_preview: 'Hi there', last_message_at: '2026-07-20T09:00:00Z', unread: true },
        ],
      };
    });

    const threads = await threadsService.listThreads(pool, 'owner-1', {});
    expect(threads).toEqual([
      { id: 't1', tenant_id: 'tn1', tenant_name: 'Jane Doe', subject: 'Leak', last_message_preview: 'Hi there', last_message_at: '2026-07-20T09:00:00Z', unread: true },
    ]);
  });

  test('adds an unread filter to the query when unreadOnly is true', async () => {
    let capturedQuery = '';
    const pool = makeFakePool(async (text) => { capturedQuery = text; return { rows: [] }; });

    await threadsService.listThreads(pool, 'owner-1', { unreadOnly: true });
    expect(capturedQuery).toMatch(/unread = true/);
  });
});

describe('threadsService.getMessages', () => {
  test('returns messages for a thread ordered by the query', async () => {
    const pool = makeFakePool(async (text, params) => {
      expect(text).toMatch(/FROM messages/);
      expect(params).toEqual(['thread-1']);
      return { rows: [{ id: 'm1', thread_id: 'thread-1', direction: 'inbound', body: 'Hi', created_at: '2026-07-20T09:00:00Z' }] };
    });

    const messages = await threadsService.getMessages(pool, 'thread-1');
    expect(messages).toEqual([{ id: 'm1', thread_id: 'thread-1', direction: 'inbound', body: 'Hi', created_at: '2026-07-20T09:00:00Z' }]);
  });
});

jest.mock('../src/services/emailService', () => ({
  deliver: jest.fn(),
}));
const { deliver } = require('../src/services/emailService');

describe('threadsService.createThread', () => {
  beforeEach(() => deliver.mockReset());

  test('creates a thread and an outbound message, recording the sent messageId', async () => {
    deliver.mockResolvedValue({ status: 'sent', messageId: '<out-1@gmail.com>' });

    const calls = [];
    const pool = {
      query: async (text, params) => {
        calls.push({ text, params });
        if (/SELECT email, name FROM tenants/.test(text)) return { rows: [{ email: 'jane@example.com', name: 'Jane Doe' }] };
        return { rows: [] };
      },
      connect: async () => ({
        query: async (text, params) => {
          calls.push({ text, params });
          if (/^BEGIN$|^COMMIT$/.test(text)) return {};
          if (/INSERT INTO message_threads/.test(text)) return { rows: [{ id: 'thread-1' }] };
          return { rows: [] };
        },
        release: () => {},
      }),
    };

    const result = await threadsService.createThread(pool, { ownerId: 'owner-1', tenantId: 'tenant-1', subject: 'Hi', body: 'Welcome!' });

    expect(result).toEqual({ id: 'thread-1' });
    expect(deliver).toHaveBeenCalledWith('jane@example.com', 'Hi', expect.stringContaining('Welcome!'));
    const insertMessage = calls.find((c) => /INSERT INTO messages/.test(c.text));
    expect(insertMessage.params).toContain('<out-1@gmail.com>');
  });

  test('returns an error when the tenant does not exist', async () => {
    const pool = { query: async () => ({ rows: [] }) };
    const result = await threadsService.createThread(pool, { ownerId: 'owner-1', tenantId: 'missing', subject: 'Hi', body: 'Hi' });
    expect(result).toEqual({ error: 'Tenant not found' });
  });
});

describe('threadsService.replyToThread', () => {
  beforeEach(() => deliver.mockReset());

  test('sends the reply and updates the thread preview', async () => {
    deliver.mockResolvedValue({ status: 'sent', messageId: '<out-2@gmail.com>' });

    const calls = [];
    const pool = {
      query: async (text, params) => {
        calls.push({ text, params });
        if (/SELECT id, subject, counterparty_email FROM message_threads/.test(text)) {
          return { rows: [{ id: 'thread-1', subject: 'Leak', counterparty_email: 'jane@example.com' }] };
        }
        return { rows: [] };
      },
      connect: async () => ({
        query: async (text, params) => {
          calls.push({ text, params });
          if (/^BEGIN$|^COMMIT$/.test(text)) return {};
          if (/INSERT INTO messages/.test(text)) return { rows: [{ id: 'message-2' }] };
          return { rows: [] };
        },
        release: () => {},
      }),
    };

    const result = await threadsService.replyToThread(pool, { threadId: 'thread-1', body: "We'll send someone today." });

    expect(result).toEqual({ id: 'message-2' });
    expect(deliver).toHaveBeenCalledWith('jane@example.com', 'Re: Leak', expect.stringContaining("We'll send someone today."));
  });

  test('returns an error when the thread does not exist', async () => {
    const pool = { query: async () => ({ rows: [] }) };
    const result = await threadsService.replyToThread(pool, { threadId: 'missing', body: 'Hi' });
    expect(result).toEqual({ error: 'Thread not found' });
  });
});

describe('threadsService.markRead', () => {
  test('updates unread to false and reports rowCount > 0 as ok', async () => {
    const pool = { query: async (text, params) => { expect(params).toEqual(['thread-1']); return { rowCount: 1 }; } };
    const result = await threadsService.markRead(pool, 'thread-1');
    expect(result).toEqual({ ok: true });
  });
});

describe('threadsService.matchInboundMessage', () => {
  function makeFakeInboundClient(script) {
    let i = 0;
    const calls = [];
    return {
      calls,
      query: async (text, params) => {
        calls.push({ text, params });
        if (/^BEGIN$|^COMMIT$|^ROLLBACK$/.test(text)) return {};
        return script[i++] || { rows: [] };
      },
      release: () => {},
    };
  }

  test('matches by In-Reply-To header to an existing thread', async () => {
    const client = makeFakeInboundClient([
      { rows: [{ thread_id: 'thread-1' }] }, // matched by gmail_message_id
      {},                                     // UPDATE message_threads
      {},                                     // INSERT messages
    ]);
    const pool = { connect: async () => client };

    const result = await threadsService.matchInboundMessage(pool, {
      ownerId: 'owner-1', fromEmail: 'jane@example.com', subject: 'Re: Leak', body: 'Thanks!',
      gmailMessageId: '<in-1@gmail.com>', inReplyTo: '<out-1@gmail.com>',
    });

    expect(result).toEqual({ threadId: 'thread-1', matchedBy: 'reply' });
    expect(client.calls[2].text).toMatch(/UPDATE message_threads/);
  });

  test('matches by tenant email to their most recent existing thread', async () => {
    const client = makeFakeInboundClient([
      { rows: [{ id: 'tenant-1' }] },   // tenant lookup by email
      { rows: [{ id: 'thread-2' }] },   // existing thread for that tenant
      {},                                // UPDATE message_threads
      {},                                // INSERT messages
    ]);
    const pool = { connect: async () => client };

    const result = await threadsService.matchInboundMessage(pool, {
      ownerId: 'owner-1', fromEmail: 'jane@example.com', subject: 'Follow-up', body: 'Any update?',
    });

    expect(result).toEqual({ threadId: 'thread-2', matchedBy: 'tenant' });
  });

  test('matches tenant by email but creates a new thread when none exists yet', async () => {
    const client = makeFakeInboundClient([
      { rows: [{ id: 'tenant-1' }] },   // tenant lookup by email
      { rows: [] },                     // no existing thread
      { rows: [{ id: 'thread-3' }] },   // INSERT message_threads
      {},                                // INSERT messages
    ]);
    const pool = { connect: async () => client };

    const result = await threadsService.matchInboundMessage(pool, {
      ownerId: 'owner-1', fromEmail: 'jane@example.com', subject: 'New issue', body: 'The heater is broken.',
    });

    expect(result).toEqual({ threadId: 'thread-3', matchedBy: 'tenant' });
    expect(client.calls[3].text).toMatch(/INSERT INTO message_threads/);
  });

  test('creates a thread with no tenant_id when the sender matches nothing', async () => {
    const client = makeFakeInboundClient([
      { rows: [] },                     // tenant lookup finds nothing
      { rows: [{ id: 'thread-4' }] },   // INSERT message_threads
      {},                                // INSERT messages
    ]);
    const pool = { connect: async () => client };

    const result = await threadsService.matchInboundMessage(pool, {
      ownerId: 'owner-1', fromEmail: 'stranger@example.com', fromName: 'Stranger', subject: 'Question', body: 'Do you have any vacancies?',
    });

    expect(result).toEqual({ threadId: 'thread-4', matchedBy: 'none' });
    const insertThread = client.calls.find((c) => /INSERT INTO message_threads/.test(c.text));
    expect(insertThread.params).toContain('stranger@example.com');
    expect(insertThread.params).toContain(null); // tenant_id
  });
});
