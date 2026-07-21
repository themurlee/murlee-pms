# Communications Two-Way Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the one-way Communications tab into a real two-way email inbox: tenants can reply, replies thread into conversations in the app, and the landlord can reply from the UI.

**Architecture:** Two new Postgres tables (`message_threads`, `messages`) sit alongside the untouched `notices` table. A `threadsService` layer (route → controller → service, mirroring `invoices`/`notices`) handles listing, replying, and matching inbound mail to threads. A node-cron job polls Gmail via IMAP (`imapflow` + `mailparser`), extracts each message's fields, and feeds them through the same matching function a dev "simulate inbound reply" endpoint uses — so the matching logic is exercised and tested without a live mailbox. The frontend rebuilds `Communications.tsx` into a collapsible sidebar (My Inbox / All Messages / Communications Log) + thread list + conversation view, keeping today's flat notices table alive under "Communications Log".

**Tech Stack:** Express + `pg` (backend), React + TanStack Query + Tailwind (frontend), Jest (backend unit tests), `imapflow` + `mailparser` (new deps) + `nodemailer` (new dep, Gmail SMTP transport).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-21-communications-inbox-design.md`.
- Every backend route/controller must keep the existing dual mock-data pattern: `if (!process.env.DATABASE_URL)` branch with an in-memory mock array, exactly like `invoiceController.js`/`noticesController.js`.
- `notices` table and its route/controller/service are untouched — this feature is fully additive.
- Single-landlord scope: no multi-tenant/multi-owner poller logic. The Gmail poller resolves the one `users` row at startup.
- No AI compose assist, no Unassigned queue, no Announcements, no Signatures — explicitly out of scope per the spec.
- Frontend has no test runner configured — frontend tasks are verified by `tsc --noEmit` and manual browser check, not automated tests.
- Implementation detail beyond the spec: `message_threads` gets a `counterparty_email` column (not in the original spec doc) so replies always have a send-to address, even for unmatched senders with no `tenant_id`. This is additive to the spec's data model, not a scope change — noted here so the spec doc can be amended after this plan is approved.

---

## File Structure

**Backend — create:**
- `backend/src/services/threadsService.js` — listThreads, getMessages, createThread, replyToThread, markRead, matchInboundMessage
- `backend/src/controllers/threadsController.js` — route handlers + mock-mode branches
- `backend/src/routes/threads.js` — Express router
- `backend/src/lib/gmailPoller.js` — extractMessageFields (pure), pollOnce, startGmailPoller
- `backend/tests/threadsService.test.js`
- `backend/tests/emailService.test.js`
- `backend/tests/gmailPoller.test.js`

**Backend — modify:**
- `schema.sql` — add `message_threads`, `messages` tables + indexes
- `backend/src/services/emailService.js` — add Gmail nodemailer transport branch, return `messageId`, export `deliver`
- `backend/src/app.js` — mount `/api/threads`, start Gmail poller when configured
- `backend/package.json` — add `nodemailer`, `imapflow`, `mailparser`

**Frontend — create:**
- `frontend/src/hooks/useThreads.ts` — `useThreads`, `useThreadMessages`
- `frontend/src/components/Communications/CommunicationsSidebar.tsx`
- `frontend/src/components/Communications/ThreadList.tsx`
- `frontend/src/components/Communications/ThreadView.tsx`
- `frontend/src/components/Communications/CommunicationsLog.tsx` — today's flat-table component, extracted verbatim

**Frontend — modify:**
- `frontend/src/components/Communications/Communications.tsx` — becomes the layout shell
- `frontend/src/lib/demoAdapter.ts` — add `/threads` mock handlers

---

### Task 1: Schema — `message_threads` and `messages` tables

**Files:**
- Modify: `schema.sql`

**Interfaces:**
- Produces: tables `message_threads(id, owner_id, tenant_id, counterparty_email, subject, last_message_preview, last_message_at, unread, created_at)` and `messages(id, thread_id, direction, body, gmail_message_id, created_at)`, consumed by every task below via raw SQL.

- [ ] **Step 1: Add the tables to `schema.sql`**

Add this block directly after the existing `notices` table definition (after the `CREATE INDEX IF NOT EXISTS idx_notices_owner_created` line):

```sql
-- Two-way message threads (tenant <-> landlord). Separate from `notices`
-- (a write-once outbound log) because these need bidirectional history and
-- reply-threading, not a fixed `type` enum.
CREATE TABLE IF NOT EXISTS message_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    counterparty_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    last_message_preview VARCHAR(280),
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    unread BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES message_threads(id) ON DELETE CASCADE,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    body TEXT NOT NULL,
    gmail_message_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_threads_owner_lastmsg ON message_threads(owner_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_gmail_message_id ON messages(gmail_message_id);
```

- [ ] **Step 2: Verify the file is valid SQL**

Run: `cd backend && node -e "require('fs').readFileSync('../schema.sql', 'utf8')" && echo OK`
Expected: `OK` (this just confirms the file is readable; `schema.sql` is applied manually per `CLAUDE.md`, there's no init script to run against a live DB in this environment).

- [ ] **Step 3: Commit**

```bash
git add schema.sql
git commit -m "feat(schema): add message_threads and messages tables"
```

---

### Task 2: `emailService.js` — Gmail SMTP transport

**Files:**
- Modify: `backend/src/services/emailService.js`
- Modify: `backend/package.json`
- Test: `backend/tests/emailService.test.js`

**Interfaces:**
- Produces: `deliver(to, subject, html) => Promise<{ status: 'sent'|'failed'|'logged', error?, messageId? }>`, now exported (was previously internal-only). `sendNotice(n)` behavior unchanged for existing callers.

- [ ] **Step 1: Add `nodemailer` to `backend/package.json`**

In `backend/package.json`, add to `dependencies` (alphabetical, matching existing style):

```json
    "nodemailer": "^6.9.14",
```

Run: `cd backend && npm install`
Expected: installs `nodemailer` into `node_modules`, `package-lock.json` updated.

- [ ] **Step 2: Write the failing test**

Create `backend/tests/emailService.test.js`:

```javascript
describe('emailService.deliver transport selection', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.RESEND_API_KEY;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('uses Gmail nodemailer transport when GMAIL_USER + GMAIL_APP_PASSWORD are set', async () => {
    process.env.GMAIL_USER = 'landlord@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'app-password';

    const sendMail = jest.fn().mockResolvedValue({ messageId: '<abc123@gmail.com>' });
    jest.doMock('nodemailer', () => ({
      createTransport: jest.fn(() => ({ sendMail })),
    }));

    const emailService = require('../src/services/emailService');
    const result = await emailService.deliver('tenant@example.com', 'Hi', '<p>Hi</p>');

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'tenant@example.com', subject: 'Hi' }));
    expect(result).toEqual({ status: 'sent', messageId: '<abc123@gmail.com>' });
  });

  test('falls back to Resend when Gmail env vars are absent but RESEND_API_KEY is set', async () => {
    process.env.RESEND_API_KEY = 'test-key';

    const send = jest.fn().mockResolvedValue({ data: { id: 'resend-id-1' }, error: null });
    jest.doMock('resend', () => ({
      Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
    }));

    const emailService = require('../src/services/emailService');
    const result = await emailService.deliver('tenant@example.com', 'Hi', '<p>Hi</p>');

    expect(send).toHaveBeenCalled();
    expect(result).toEqual({ status: 'sent', messageId: 'resend-id-1' });
  });

  test('logs only when neither Gmail nor Resend are configured', async () => {
    const emailService = require('../src/services/emailService');
    const result = await emailService.deliver('tenant@example.com', 'Hi', '<p>Hi</p>');
    expect(result).toEqual({ status: 'logged' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest tests/emailService.test.js -v`
Expected: FAIL — `emailService.deliver` is not exported yet (only `sendNotice` is), and there's no Gmail branch.

- [ ] **Step 4: Implement the Gmail transport in `emailService.js`**

Replace the top of `backend/src/services/emailService.js` (everything before `async function logNotice`) with:

```javascript
const pool = require('../config/db');

// Transport priority: Gmail (nodemailer) > Resend > log-only. Gmail reuses the
// same GMAIL_USER/GMAIL_APP_PASSWORD env vars the inbound IMAP poller uses, so
// setting up one Gmail App Password lights up both send and receive.
let gmailTransporter = null;
if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  const nodemailer = require('nodemailer');
  gmailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

let resendClient = null;
if (process.env.RESEND_API_KEY) {
  const { Resend } = require('resend');
  resendClient = new Resend(process.env.RESEND_API_KEY);
}

const FROM = process.env.RESEND_FROM || 'Murlee PMS <onboarding@resend.dev>';

async function deliver(to, subject, html) {
  if (!to) return { status: 'failed', error: 'No recipient email' };

  if (gmailTransporter) {
    try {
      const info = await gmailTransporter.sendMail({ from: process.env.GMAIL_USER, to, subject, html });
      return { status: 'sent', messageId: info.messageId };
    } catch (err) {
      return { status: 'failed', error: err.message };
    }
  }

  if (!resendClient) {
    console.log(`[EMAIL log-only] to=${to} subject="${subject}"`);
    return { status: 'logged' };
  }
  try {
    const { data, error } = await resendClient.emails.send({ from: FROM, to, subject, html });
    if (error) return { status: 'failed', error: error.message || String(error) };
    return { status: 'sent', messageId: data?.id };
  } catch (err) {
    return { status: 'failed', error: err.message };
  }
}
```

At the bottom of the file, change the export line to:

```javascript
module.exports = { sendNotice, deliver };
```

(Leave `logNotice` and `sendNotice` exactly as they are — only the top block and the export line change.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest tests/emailService.test.js -v`
Expected: PASS — all 3 tests green.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/services/emailService.js backend/tests/emailService.test.js
git commit -m "feat(email): add Gmail SMTP transport, export deliver() with messageId"
```

---

### Task 3: `threadsService.js` — read side (listThreads, getMessages)

**Files:**
- Create: `backend/src/services/threadsService.js`
- Test: `backend/tests/threadsService.test.js`

**Interfaces:**
- Produces: `listThreads(pool, ownerId, { unreadOnly }) => Promise<Thread[]>`, `getMessages(pool, threadId) => Promise<Message[]>`, where `Thread = { id, tenant_id, tenant_name, subject, last_message_preview, last_message_at, unread }` and `Message = { id, thread_id, direction, body, created_at }`.
- Consumes: a `pool`-shaped object with `.query(text, params)` (matches the fake-pool pattern in `backend/tests/tenantsService.test.js`).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/threadsService.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/threadsService.test.js -v`
Expected: FAIL — `Cannot find module '../src/services/threadsService'`.

- [ ] **Step 3: Implement the read side**

Create `backend/src/services/threadsService.js`:

```javascript
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

module.exports = { listThreads, getMessages };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/threadsService.test.js -v`
Expected: PASS — both `listThreads` tests and the `getMessages` test green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/threadsService.js backend/tests/threadsService.test.js
git commit -m "feat(threads): add listThreads and getMessages read-side service"
```

---

### Task 4: `threadsService.js` — write side (createThread, replyToThread, markRead)

**Files:**
- Modify: `backend/src/services/threadsService.js`
- Modify: `backend/tests/threadsService.test.js`

**Interfaces:**
- Consumes: `deliver(to, subject, html)` from `../services/emailService` (Task 2).
- Produces: `createThread(pool, { ownerId, tenantId, subject, body }) => Promise<{ id }|{ error }>`, `replyToThread(pool, { threadId, body }) => Promise<{ id }|{ error }>`, `markRead(pool, threadId) => Promise<{ ok: boolean }>`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/threadsService.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/threadsService.test.js -v`
Expected: FAIL — `threadsService.createThread is not a function` (and similarly for `replyToThread`/`markRead`).

- [ ] **Step 3: Implement the write side**

In `backend/src/services/threadsService.js`, add near the top (after the existing single `function formatThread` line, before `module.exports`):

```javascript
const { deliver } = require('./emailService');

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
```

Update `module.exports` at the bottom to:

```javascript
module.exports = { listThreads, getMessages, createThread, replyToThread, markRead };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/threadsService.test.js -v`
Expected: PASS — all tests in the file green (read-side from Task 3 plus the new write-side tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/threadsService.js backend/tests/threadsService.test.js
git commit -m "feat(threads): add createThread, replyToThread, markRead"
```

---

### Task 5: `threadsService.js` — matchInboundMessage (inbound matching/threading)

**Files:**
- Modify: `backend/src/services/threadsService.js`
- Modify: `backend/tests/threadsService.test.js`

**Interfaces:**
- Produces: `matchInboundMessage(pool, { ownerId, fromEmail, fromName, subject, body, gmailMessageId, inReplyTo }) => Promise<{ threadId, matchedBy: 'reply'|'tenant'|'none' }>`. This is consumed by `threadsController.postSimulateInbound` (Task 6) and `gmailPoller.pollOnce` (Task 7).

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/threadsService.test.js`:

```javascript
describe('threadsService.matchInboundMessage', () => {
  function makeFakeClient(script) {
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
    const client = makeFakeClient([
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
    expect(client.calls[1].text).toMatch(/UPDATE message_threads/);
  });

  test('matches by tenant email to their most recent existing thread', async () => {
    const client = makeFakeClient([
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
    const client = makeFakeClient([
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
    expect(client.calls[2].text).toMatch(/INSERT INTO message_threads/);
  });

  test('creates a thread with no tenant_id when the sender matches nothing', async () => {
    const client = makeFakeClient([
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/threadsService.test.js -v`
Expected: FAIL — `threadsService.matchInboundMessage is not a function`.

- [ ] **Step 3: Implement `matchInboundMessage`**

In `backend/src/services/threadsService.js`, add before `module.exports`:

```javascript
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
```

Update `module.exports` to:

```javascript
module.exports = { listThreads, getMessages, createThread, replyToThread, markRead, matchInboundMessage };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/threadsService.test.js -v`
Expected: PASS — all `matchInboundMessage` scenarios plus every earlier test in the file green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/threadsService.js backend/tests/threadsService.test.js
git commit -m "feat(threads): add matchInboundMessage for reply/tenant/unmatched threading"
```

---

### Task 6: `threadsController.js` + `routes/threads.js` + mount in `app.js`

**Files:**
- Create: `backend/src/controllers/threadsController.js`
- Create: `backend/src/routes/threads.js`
- Modify: `backend/src/app.js`

**Interfaces:**
- Consumes: `threadsService.{listThreads, getMessages, createThread, replyToThread, markRead, matchInboundMessage}` (Tasks 3–5).
- Produces: `GET /api/threads?filter=unread|all`, `GET /api/threads/:id/messages`, `POST /api/threads`, `POST /api/threads/:id/messages`, `PATCH /api/threads/:id`, `POST /api/threads/simulate-inbound` — all behind `requireAuth`, all with a mock-mode branch when `DATABASE_URL` is unset.

- [ ] **Step 1: Create the controller**

Create `backend/src/controllers/threadsController.js`:

```javascript
const pool = require('../config/db');
const threadsService = require('../services/threadsService');

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
// poller (Task 7) has real credentials to run against.
async function postSimulateInbound(req, res) {
  const { from_email, from_name, subject, body } = req.body;
  if (!from_email || !body) {
    return res.status(400).json({ error: 'from_email and body are required' });
  }

  if (!process.env.DATABASE_URL) {
    const thread = { id: `T-${Date.now()}`, tenant_id: null, tenant_name: from_name || from_email, subject: subject || '(no subject)', last_message_preview: body.slice(0, 280), last_message_at: nowIso(), unread: true };
    mockThreads = [thread, ...mockThreads];
    mockMessages[thread.id] = [{ id: `M-${Date.now()}`, thread_id: thread.id, direction: 'inbound', body, created_at: nowIso() }];
    return res.status(201).json({ threadId: thread.id, matchedBy: 'none' });
  }

  try {
    const result = await threadsService.matchInboundMessage(pool, { ownerId: req.user.id, fromEmail: from_email, fromName: from_name, subject, body });
    res.status(201).json(result);
  } catch (error) {
    console.error('Failed to simulate inbound message:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { getThreads, getThreadMessages, postThread, postThreadMessage, patchThread, postSimulateInbound };
```

- [ ] **Step 2: Create the router**

Create `backend/src/routes/threads.js`:

```javascript
const express = require('express');
const router = express.Router();
const threadsController = require('../controllers/threadsController');

router.get('/', threadsController.getThreads);
router.post('/', threadsController.postThread);
router.post('/simulate-inbound', threadsController.postSimulateInbound);
router.get('/:id/messages', threadsController.getThreadMessages);
router.post('/:id/messages', threadsController.postThreadMessage);
router.patch('/:id', threadsController.patchThread);

module.exports = router;
```

- [ ] **Step 3: Mount the route in `app.js`**

In `backend/src/app.js`, add near the other route requires:

```javascript
const threadsRoutes = require('./routes/threads');
```

And near the other `app.use('/api/...', requireAuth, ...)` lines:

```javascript
app.use('/api/threads', requireAuth, threadsRoutes);
```

- [ ] **Step 4: Manually verify against the running mock-mode server**

Run: `cd backend && PORT=5001 npm run dev` (leave it running in the background)

In another shell, log in and hit the new endpoints:

```bash
TOKEN=$(curl -s -X POST http://localhost:5001/api/auth/login -H "Content-Type: application/json" -d '{"email":"landlord@murlee.test","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s http://localhost:5001/api/threads -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:5001/api/threads/T-1/messages -H "Authorization: Bearer $TOKEN"
curl -s -X POST http://localhost:5001/api/threads/T-1/messages -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"body":"On our way, thanks for flagging."}'
curl -s -X POST http://localhost:5001/api/threads/simulate-inbound -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"from_email":"newtenant@example.com","subject":"Question about parking","body":"Is there guest parking available?"}'
```

Expected: first call returns the seeded `T-1` thread array; second returns its one message; third returns a `201` with the new outbound message and `T-1`'s `last_message_preview` updated on a follow-up `GET /api/threads`; fourth returns `201` with a freshly minted thread id and `matchedBy: "none"`.

Stop the server: `lsof -ti:5001 -sTCP:LISTEN | xargs -r kill`

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/threadsController.js backend/src/routes/threads.js backend/src/app.js
git commit -m "feat(threads): add threads controller, routes, and mount in app.js"
```

---

### Task 7: Gmail inbound poller

**Files:**
- Create: `backend/src/lib/gmailPoller.js`
- Modify: `backend/package.json`
- Modify: `backend/src/app.js`
- Test: `backend/tests/gmailPoller.test.js`

**Interfaces:**
- Consumes: `threadsService.matchInboundMessage` (Task 5).
- Produces: `extractMessageFields(parsed) => { fromEmail, fromName, subject, body, gmailMessageId, inReplyTo }` (pure, unit-tested), `pollOnce(pool, ownerId)` and `startGmailPoller(pool, ownerId)` (integration-only, no automated test — see Step 5).

- [ ] **Step 1: Add dependencies**

In `backend/package.json`, add to `dependencies`:

```json
    "imapflow": "^1.0.171",
    "mailparser": "^3.7.1",
```

Run: `cd backend && npm install`
Expected: installs both packages.

- [ ] **Step 2: Write the failing test for `extractMessageFields`**

Create `backend/tests/gmailPoller.test.js`:

```javascript
const { extractMessageFields } = require('../src/lib/gmailPoller');

describe('extractMessageFields', () => {
  test('extracts sender, subject, plain-text body, and threading headers from a parsed message', () => {
    const parsed = {
      from: { value: [{ address: 'jane@example.com', name: 'Jane Doe' }] },
      subject: 'Re: Leak in bathroom',
      text: 'Thanks, someone came by already.\n',
      messageId: '<in-2@mail.gmail.com>',
      inReplyTo: '<out-1@gmail.com>',
    };

    expect(extractMessageFields(parsed)).toEqual({
      fromEmail: 'jane@example.com',
      fromName: 'Jane Doe',
      subject: 'Re: Leak in bathroom',
      body: 'Thanks, someone came by already.',
      gmailMessageId: '<in-2@mail.gmail.com>',
      inReplyTo: '<out-1@gmail.com>',
    });
  });

  test('falls back to a placeholder subject and null fields when headers are missing', () => {
    const parsed = { from: { value: [{ address: 'stranger@example.com' }] }, text: 'Hello' };

    expect(extractMessageFields(parsed)).toEqual({
      fromEmail: 'stranger@example.com',
      fromName: null,
      subject: '(no subject)',
      body: 'Hello',
      gmailMessageId: null,
      inReplyTo: null,
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest tests/gmailPoller.test.js -v`
Expected: FAIL — `Cannot find module '../src/lib/gmailPoller'`.

- [ ] **Step 4: Implement `gmailPoller.js`**

Create `backend/src/lib/gmailPoller.js`:

```javascript
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest tests/gmailPoller.test.js -v`
Expected: PASS — both `extractMessageFields` tests green.

Note: `pollOnce`/`startGmailPoller` are not unit tested here — they need a live Gmail mailbox (`GMAIL_USER`/`GMAIL_APP_PASSWORD`), which is still blocked on the queued setup step. Once that's done, verify manually: send a real email to the Gmail address the app is configured with, wait up to 60s, then check `GET /api/threads` for a new/updated thread.

- [ ] **Step 6: Wire the poller into `app.js` startup**

In `backend/src/app.js`, inside the `app.listen(port, () => { ... })` callback, after the existing `if (process.env.DATABASE_URL) { require('./lib/scheduler').startScheduler(); }` block, add:

```javascript
  if (process.env.DATABASE_URL && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const dbPool = require('./config/db');
    dbPool.query('SELECT id FROM users ORDER BY created_at LIMIT 1')
      .then((r) => {
        const ownerId = r.rows[0]?.id;
        if (ownerId) require('./lib/gmailPoller').startGmailPoller(dbPool, ownerId);
      })
      .catch((e) => console.error('Failed to resolve owner for Gmail poller:', e.message));
  }
```

(This is a no-op today since `GMAIL_USER`/`GMAIL_APP_PASSWORD` aren't set yet — it activates automatically once the queued Gmail setup is done.)

- [ ] **Step 7: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/lib/gmailPoller.js backend/tests/gmailPoller.test.js backend/src/app.js
git commit -m "feat(threads): add Gmail IMAP inbound poller, gated on GMAIL_* env vars"
```

---

### Task 8: Frontend — `useThreads.ts` hook

**Files:**
- Create: `frontend/src/hooks/useThreads.ts`

**Interfaces:**
- Consumes: `api` from `../lib/api` (existing axios instance).
- Produces: `Thread`, `ThreadMessage` types; `useThreads(filter: 'unread'|'all') => { threads, isLoading, createThread, isCreating }`; `useThreadMessages(threadId: string|null) => { messages, isLoading, reply, isReplying, markRead }`. Consumed by `CommunicationsSidebar`, `ThreadList`, `ThreadView`, `Communications.tsx` (Tasks 9–13).

- [ ] **Step 1: Create the hook**

Create `frontend/src/hooks/useThreads.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Thread {
  id: string;
  tenant_id: string | null;
  tenant_name: string;
  subject: string;
  last_message_preview: string;
  last_message_at: string;
  unread: boolean;
}

export interface ThreadMessage {
  id: string;
  thread_id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  created_at: string;
}

export const useThreads = (filter: 'unread' | 'all' = 'all') => {
  const queryClient = useQueryClient();

  const query = useQuery<Thread[]>({
    queryKey: ['threads', filter],
    queryFn: async () => (await api.get('/threads', { params: filter === 'unread' ? { filter: 'unread' } : {} })).data,
    staleTime: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: async (input: { tenant_id: string; subject: string; body: string }) =>
      (await api.post('/threads', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['threads'] }),
  });

  return {
    threads: query.data ?? [],
    isLoading: query.isLoading,
    createThread: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
};

export const useThreadMessages = (threadId: string | null) => {
  const queryClient = useQueryClient();

  const query = useQuery<ThreadMessage[]>({
    queryKey: ['thread-messages', threadId],
    queryFn: async () => (await api.get(`/threads/${threadId}/messages`)).data,
    enabled: !!threadId,
    staleTime: 5_000,
  });

  const replyMutation = useMutation({
    mutationFn: async (body: string) => (await api.post(`/threads/${threadId}/messages`, { body })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thread-messages', threadId] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async () => (await api.patch(`/threads/${threadId}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['threads'] }),
  });

  return {
    messages: query.data ?? [],
    isLoading: query.isLoading,
    reply: replyMutation.mutateAsync,
    isReplying: replyMutation.isPending,
    markRead: markReadMutation.mutateAsync,
  };
};
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors (this file isn't imported anywhere yet, but must be syntactically/typewise valid on its own).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useThreads.ts
git commit -m "feat(communications): add useThreads/useThreadMessages hooks"
```

---

### Task 9: Frontend — `CommunicationsSidebar.tsx`

**Files:**
- Create: `frontend/src/components/Communications/CommunicationsSidebar.tsx`

**Interfaces:**
- Produces: `CommunicationsSidebar({ active, onSelect, unreadCount }: { active: 'inbox'|'all'|'log'; onSelect: (v: 'inbox'|'all'|'log') => void; unreadCount: number })`. Consumed by `Communications.tsx` (Task 13).

- [ ] **Step 1: Create the component**

Create `frontend/src/components/Communications/CommunicationsSidebar.tsx`:

```tsx
import { useState } from 'react';

export type CommunicationsView = 'inbox' | 'all' | 'log';

interface CommunicationsSidebarProps {
  active: CommunicationsView;
  onSelect: (view: CommunicationsView) => void;
  unreadCount: number;
}

const InboxIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

const AllMessagesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const LogIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);

const NAV: { key: CommunicationsView; label: string; icon: () => JSX.Element }[] = [
  { key: 'inbox', label: 'My Inbox', icon: InboxIcon },
  { key: 'all', label: 'All Messages', icon: AllMessagesIcon },
  { key: 'log', label: 'Communications Log', icon: LogIcon },
];

export const CommunicationsSidebar = ({ active, onSelect, unreadCount }: CommunicationsSidebarProps) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`flex flex-col gap-1 border-r border-white/5 bg-slate-900/30 backdrop-blur-2xl rounded-2xl p-3 shrink-0 transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'}`}>
      <button
        onClick={() => setCollapsed((p) => !p)}
        className="self-end p-1.5 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white mb-2"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {collapsed ? <path d="M9 18l6-6-6-6" /> : <path d="M15 18l-6-6 6-6" />}
        </svg>
      </button>

      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            title={collapsed ? item.label : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-outfit transition-all ${
              active === item.key ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            } ${collapsed ? 'justify-center' : ''}`}
          >
            <Icon />
            {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
            {!collapsed && item.key === 'inbox' && unreadCount > 0 && (
              <span className="text-[10px] font-bold bg-indigo-500 text-white rounded-full px-1.5 py-0.5">{unreadCount}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Communications/CommunicationsSidebar.tsx
git commit -m "feat(communications): add collapsible CommunicationsSidebar"
```

---

### Task 10: Frontend — `ThreadList.tsx`

**Files:**
- Create: `frontend/src/components/Communications/ThreadList.tsx`

**Interfaces:**
- Consumes: `Thread` type from `../../hooks/useThreads`.
- Produces: `ThreadList({ threads, selectedId, onSelect, isLoading }: { threads: Thread[]; selectedId: string|null; onSelect: (id: string) => void; isLoading: boolean })`. Consumed by `Communications.tsx` (Task 13).

- [ ] **Step 1: Create the component**

Create `frontend/src/components/Communications/ThreadList.tsx`:

```tsx
import { useState } from 'react';
import { Thread } from '../../hooks/useThreads';

interface ThreadListProps {
  threads: Thread[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
}

export const ThreadList = ({ threads, selectedId, onSelect, isLoading }: ThreadListProps) => {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const filtered = q
    ? threads.filter((t) => t.tenant_name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q))
    : threads;

  return (
    <div className="w-full sm:w-80 shrink-0 border-r border-white/5 flex flex-col">
      <div className="p-3 border-b border-white/5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations…"
          className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600"
        />
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-white/5">
        {isLoading && <div className="p-4 text-sm text-slate-500">Loading…</div>}
        {!isLoading && filtered.length === 0 && <div className="p-4 text-sm text-slate-500">No conversations.</div>}
        {filtered.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`w-full text-left p-4 flex flex-col gap-1 transition-colors ${selectedId === t.id ? 'bg-white/10' : 'hover:bg-white/5'}`}
          >
            <div className="flex justify-between items-center gap-2">
              <span className={`text-sm font-semibold truncate ${t.unread ? 'text-white' : 'text-slate-300'}`}>{t.tenant_name}</span>
              {t.unread && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />}
            </div>
            <span className="text-xs text-slate-400 truncate">{t.subject}</span>
            <span className="text-xs text-slate-500 truncate">{t.last_message_preview}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Communications/ThreadList.tsx
git commit -m "feat(communications): add ThreadList component"
```

---

### Task 11: Frontend — `ThreadView.tsx`

**Files:**
- Create: `frontend/src/components/Communications/ThreadView.tsx`

**Interfaces:**
- Consumes: `useThreadMessages` from `../../hooks/useThreads`.
- Produces: `ThreadView({ threadId }: { threadId: string | null })`. Consumed by `Communications.tsx` (Task 13).

- [ ] **Step 1: Create the component**

Create `frontend/src/components/Communications/ThreadView.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useThreadMessages } from '../../hooks/useThreads';

interface ThreadViewProps {
  threadId: string | null;
}

export const ThreadView = ({ threadId }: ThreadViewProps) => {
  const { messages, isLoading, reply, isReplying, markRead } = useThreadMessages(threadId);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (threadId) {
      markRead().catch(() => {});
    }
    // Only re-run when the selected thread changes, not on every markRead identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  if (!threadId) {
    return <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Select a conversation</div>;
  }

  const handleSend = async () => {
    if (!draft.trim()) return;
    await reply(draft);
    setDraft('');
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        {isLoading && <div className="text-sm text-slate-500">Loading…</div>}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
              m.direction === 'outbound' ? 'self-end bg-indigo-600 text-white' : 'self-start bg-white/5 text-slate-200'
            }`}
          >
            {m.body}
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-white/5 flex gap-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a reply…"
          className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 resize-none min-h-[48px]"
        />
        <button
          onClick={handleSend}
          disabled={isReplying || !draft.trim()}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-all disabled:opacity-50 text-outfit"
        >
          {isReplying ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Communications/ThreadView.tsx
git commit -m "feat(communications): add ThreadView component"
```

---

### Task 12: Frontend — extract `CommunicationsLog.tsx`

**Files:**
- Create: `frontend/src/components/Communications/CommunicationsLog.tsx`
- (Task 13 will delete the old body out of `Communications.tsx` — don't touch `Communications.tsx` in this task.)

**Interfaces:**
- Produces: `CommunicationsLog()` — a zero-prop component, the exact current contents of `Communications.tsx` (today's flat notices table + "+ Send Email" modal), renamed. Consumed by `Communications.tsx` (Task 13).

- [ ] **Step 1: Create `CommunicationsLog.tsx` as a copy of today's `Communications.tsx`**

Copy the full current contents of `frontend/src/components/Communications/Communications.tsx` into a new file `frontend/src/components/Communications/CommunicationsLog.tsx`, then make exactly these two textual changes in the new file:

1. Rename the export: `export const Communications = () => {` becomes `export const CommunicationsLog = () => {`
2. In the heading block near the top, change:

```tsx
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white text-outfit tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
            Communications
          </h1>
          <p className="text-slate-400 text-sm mt-1">Every reminder, notice, and message sent to tenants</p>
```

to:

```tsx
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white text-outfit tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
            Communications Log
          </h1>
          <p className="text-slate-400 text-sm mt-1">Every automated reminder and notice sent to tenants</p>
```

Everything else (the `useNotices`/`useTenants` hooks, the table, the mobile cards, the send-email modal) stays byte-for-byte identical.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors (the new file isn't imported by anything yet, and the old `Communications.tsx` is untouched, so both compile independently).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Communications/CommunicationsLog.tsx
git commit -m "feat(communications): extract existing notices table as CommunicationsLog"
```

---

### Task 13: Frontend — rebuild `Communications.tsx` as the layout shell

**Files:**
- Modify: `frontend/src/components/Communications/Communications.tsx`

**Interfaces:**
- Consumes: `CommunicationsSidebar` (Task 9), `ThreadList` (Task 10), `ThreadView` (Task 11), `CommunicationsLog` (Task 12), `useThreads` (Task 8).
- Produces: `Communications()` — same zero-prop export `App.tsx` already imports, so no changes needed outside this file.

- [ ] **Step 1: Replace the full contents of `Communications.tsx`**

Replace the entire contents of `frontend/src/components/Communications/Communications.tsx` with:

```tsx
import { useState } from 'react';
import { CommunicationsSidebar, CommunicationsView } from './CommunicationsSidebar';
import { ThreadList } from './ThreadList';
import { ThreadView } from './ThreadView';
import { CommunicationsLog } from './CommunicationsLog';
import { useThreads } from '../../hooks/useThreads';

export const Communications = () => {
  const [view, setView] = useState<CommunicationsView>('inbox');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const { threads, isLoading } = useThreads(view === 'inbox' ? 'unread' : 'all');
  const { threads: unreadThreads } = useThreads('unread');

  const selectView = (v: CommunicationsView) => {
    setView(v);
    setSelectedThreadId(null);
  };

  if (view === 'log') {
    return (
      <div className="flex gap-4 items-start">
        <CommunicationsSidebar active={view} onSelect={selectView} unreadCount={unreadThreads.length} />
        <div className="flex-1 min-w-0">
          <CommunicationsLog />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[500px]">
      <CommunicationsSidebar active={view} onSelect={selectView} unreadCount={unreadThreads.length} />
      <div className="flex-1 flex glass-panel rounded-2xl overflow-hidden">
        <ThreadList threads={threads} selectedId={selectedThreadId} onSelect={setSelectedThreadId} isLoading={isLoading} />
        <ThreadView threadId={selectedThreadId} />
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. This is the first point where `CommunicationsSidebar`, `ThreadList`, `ThreadView`, `CommunicationsLog`, and `useThreads` are all actually wired together, so this step is the real integration check for Tasks 8–13.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Communications/Communications.tsx
git commit -m "feat(communications): rebuild Communications tab as sidebar + inbox shell"
```

---

### Task 14: Frontend — `demoAdapter.ts` mock thread handlers

**Files:**
- Modify: `frontend/src/lib/demoAdapter.ts`

**Interfaces:**
- Produces: demo-mode (GitHub Pages) handling for `GET/POST /threads`, `GET/POST /threads/:id/messages`, `PATCH /threads/:id`, matching the real API's response shapes from Task 6.

- [ ] **Step 1: Add seeded mock data**

In `frontend/src/lib/demoAdapter.ts`, directly after the existing `let notices: any[] = [...]` block, add:

```typescript
let messageThreads: any[] = [
  { id: 'TH1', tenant_id: 't1', tenant_name: 'Jane Doe', subject: 'Leak in bathroom', last_message_preview: "Hi, there's a leak in the bathroom. Can you send someone?", last_message_at: '2026-07-20T09:00:00Z', unread: true },
  { id: 'TH2', tenant_id: 't2', tenant_name: 'John Smith', subject: 'Lease renewal', last_message_preview: 'Just checking on the renewal timeline.', last_message_at: '2026-07-18T15:00:00Z', unread: false },
];
let threadMessages: Record<string, any[]> = {
  TH1: [
    { id: 'M1', thread_id: 'TH1', direction: 'inbound', body: "Hi, there's a leak in the bathroom. Can you send someone?", created_at: '2026-07-20T09:00:00Z' },
  ],
  TH2: [
    { id: 'M2', thread_id: 'TH2', direction: 'outbound', body: 'Hi John, just a heads up your lease renews in 6 weeks.', created_at: '2026-07-18T14:00:00Z' },
    { id: 'M3', thread_id: 'TH2', direction: 'inbound', body: 'Just checking on the renewal timeline.', created_at: '2026-07-18T15:00:00Z' },
  ],
};
```

- [ ] **Step 2: Add the route handlers**

Directly after the existing notices block (`if (url === '/notices') { ... }`), add:

```typescript
  // MESSAGE THREADS
  if (url === '/threads') {
    if (method === 'get') {
      const list = params.filter === 'unread' ? messageThreads.filter((t) => t.unread) : messageThreads;
      return res(list);
    }
    if (method === 'post') {
      const tenant = tenants.find((t: any) => t.id === body.tenant_id);
      const thread = { id: uid(), tenant_id: body.tenant_id, tenant_name: tenant?.name || 'Tenant', subject: body.subject, last_message_preview: String(body.body).slice(0, 280), last_message_at: nowIso(), unread: false };
      messageThreads = [thread, ...messageThreads];
      threadMessages[thread.id] = [{ id: uid(), thread_id: thread.id, direction: 'outbound', body: body.body, created_at: nowIso() }];
      return res(thread, 201);
    }
  }
  if (/^\/threads\/[^/]+\/messages$/.test(url)) {
    const id = url.split('/')[2];
    if (method === 'get') return res(threadMessages[id] || []);
    if (method === 'post') {
      const message = { id: uid(), thread_id: id, direction: 'outbound', body: body.body, created_at: nowIso() };
      threadMessages[id] = [...(threadMessages[id] || []), message];
      messageThreads = messageThreads.map((t) => (t.id === id ? { ...t, last_message_preview: String(body.body).slice(0, 280), last_message_at: nowIso() } : t));
      return res(message, 201);
    }
  }
  if (method === 'patch' && /^\/threads\/[^/]+$/.test(url)) {
    const id = url.split('/')[2];
    messageThreads = messageThreads.map((t) => (t.id === id ? { ...t, unread: false } : t));
    return res({ message: 'updated' });
  }
```

Place this block before the final `return res({ error: ... }, 404);` fallback line at the end of the function.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/demoAdapter.ts
git commit -m "feat(communications): add demo-mode mock handlers for threads"
```

---

### Task 15: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Start the backend in mock mode**

Run: `cd backend && PORT=5001 npm run dev` (background)
Expected log line: `Server listening on port 5001`.

- [ ] **Step 2: Start the frontend dev server**

Run: `cd frontend && npm run dev` (background)
Expected: Vite prints a `Local:` URL (likely `http://localhost:5173/murlee-pms/`, or a higher port if 5173 is taken).

- [ ] **Step 3: Drive it with a headless browser**

Using Playwright (or `chromium-cli` if available), navigate to the printed URL, log in with `landlord@murlee.test` / `password123`, click into **Communications**, and confirm:
- The new collapsible sidebar renders with **My Inbox**, **All Messages**, **Communications Log**, and the unread badge shows `1` (from the seeded `T-1` mock thread).
- Clicking the collapse chevron shrinks the sidebar to icon-only and back.
- Selecting the seeded thread shows its one inbound message bubble; sending a reply adds an outbound bubble and clears the compose box.
- Switching to **Communications Log** shows the original flat notices table, unchanged.
- No errors appear in the browser console.

Take a screenshot at the expanded-inbox state and the collapsed-sidebar state.

- [ ] **Step 4: Stop both dev servers**

```bash
lsof -ti:5001 -sTCP:LISTEN | xargs -r kill
lsof -ti:5173 -sTCP:LISTEN -sTCP:LISTEN | xargs -r kill 2>/dev/null
lsof -ti:5174 -sTCP:LISTEN | xargs -r kill 2>/dev/null
```

(Adjust the frontend port if Vite picked a different one in Step 2. If a pre-existing backend was running against the real database before this task, restart it the same way it was originally running — e.g. `cd backend && npm start` — so the working environment is left as it was found.)

- [ ] **Step 5: Run the full backend test suite once more**

Run: `cd backend && npx jest`
Expected: all suites pass, including `threadsService.test.js`, `emailService.test.js`, and `gmailPoller.test.js` added in this plan.
