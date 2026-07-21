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
