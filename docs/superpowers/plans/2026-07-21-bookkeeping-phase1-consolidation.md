# Bookkeeping Consolidation — Phase 1 (Consolidation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a real `transactions` backend and wire the Transactions/Ledger tab to it, auto-post rent income when an invoice is marked paid, and fold the mock Bookkeeping tab into a single ledger with a real-estate/personal filter.

**Architecture:** One source-agnostic `transactions` table is read/written through an injectable-`pool` service (matching `billingService`), exposed via an auth-guarded `/api/transactions` route with a mock-mode branch (matching `entitiesController`). The frontend Ledger tab reads it through a TanStack Query hook (matching `useEntities`). Marking an invoice paid inserts a `Rent Received` transaction inside the existing payment DB transaction.

**Tech Stack:** Node + Express + `pg` (hand-written SQL, no ORM), Jest (backend unit tests with a fake pool), React + TypeScript + Vite, TanStack Query + axios.

## Global Constraints

- **Service functions take a queryable (`pool` or a transaction `client`) as their first argument** — matches `billingService`; enables Jest tests with a fake pool. Never `require` the pool inside a service and call it directly.
- **Controllers** `require('../config/db')`, include an `if (!process.env.DATABASE_URL)` mock branch that returns canned data, and wrap real DB calls in `try/catch` returning `res.status(500).json({ error: 'Internal Server Error' })`. Owner id is always `req.user.id`.
- **Routes** are mounted in `src/app.js` behind `requireAuth`: `app.use('/api/transactions', requireAuth, transactionsRoutes)`.
- **All SQL is hand-written parameterized `pg` queries.** No ORM. Money columns are `DECIMAL`; parse with `parseFloat` when formatting for JSON.
- **Schema changes** go in `schema.sql` using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` (safe to re-run), matching the existing incremental-migration block.
- **Frontend** uses the shared axios instance `api` (baseURL `/api`) and the TanStack Query hook pattern from `useEntities`. There is **no frontend test runner** — verify frontend tasks with `npx tsc -p frontend/tsconfig.json --noEmit` and a manual browser check at `http://localhost:5173/murlee-pms/`.
- **Backend tests** run with `cd backend && npx jest tests/<file>.test.js`.
- **Commits:** conventional-commit messages, end every commit body with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Work happens on the current branch `spec/bookkeeping-consolidation`.

## File Structure

**Backend**
- `schema.sql` (modify) — add `transactions` columns + indexes.
- `backend/src/services/transactionsService.js` (create) — injectable-pool CRUD + `insertRentReceived` helper.
- `backend/src/controllers/transactionsController.js` (create) — HTTP handlers with mock branch.
- `backend/src/routes/transactions.js` (create) — route table.
- `backend/src/app.js` (modify) — mount the route.
- `backend/src/controllers/invoiceController.js` (modify) — post `Rent Received` on mark-paid.
- `backend/tests/transactionsService.test.js` (create) — fake-pool unit tests.

**Frontend**
- `frontend/src/hooks/useTransactions.ts` (create) — query + mutations.
- `frontend/src/components/Transactions/Ledger.tsx` (modify) — real data, class filter, add-expense modal.
- `frontend/src/App.tsx` (modify) — remove Bookkeeping tab.
- `frontend/src/components/Bookkeeping/Bookkeeping.tsx` (delete).

---

### Task 1: Schema — transactions columns + indexes

**Files:**
- Modify: `schema.sql` (append to the incremental-columns block near the end, after the maintenance-tickets ALTERs around line 176)

**Interfaces:**
- Consumes: nothing.
- Produces: `transactions` gains `owner_id UUID`, `property_id UUID`, `account_class VARCHAR(20)`, `source VARCHAR(20)`, `payment_method VARCHAR(30)`, `memo TEXT`. (`owner_id` is added beyond the spec's column list so the ledger can be owner-scoped with a single WHERE instead of a 4-table join — a correctness refinement.)

- [ ] **Step 1: Add the columns and indexes**

Append to `schema.sql` (after the maintenance-tickets incremental ALTERs):

```sql
-- Transactions: owner scoping + per-transaction property tagging, real-estate vs
-- personal class (personal excluded from Schedule E), origin source, and review memo.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_class VARCHAR(20) DEFAULT 'real_estate' CHECK (account_class IN ('real_estate', 'personal'));
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual', 'csv', 'plaid'));
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS memo TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_owner_id ON transactions(owner_id);
CREATE INDEX IF NOT EXISTS idx_transactions_property_id ON transactions(property_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_class ON transactions(account_class);
```

- [ ] **Step 2: Verify the SQL is well-formed and idempotent**

Run (uses Postgres if `DATABASE_URL` is set; otherwise just confirms the file parses via a dry grep):

```bash
cd /Users/nekanyab/murlee/PMS && grep -c "ADD COLUMN IF NOT EXISTS" schema.sql
```

Expected: a count that increased by 6 versus before. If a live DB is available, apply with your existing init step and confirm no error; re-running must be a no-op.

- [ ] **Step 3: Commit**

```bash
cd /Users/nekanyab/murlee/PMS
git add schema.sql
git commit -m "$(printf 'feat(db): add owner/property/class/source columns to transactions\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: transactionsService — list with filters

**Files:**
- Create: `backend/src/services/transactionsService.js`
- Test: `backend/tests/transactionsService.test.js`

**Interfaces:**
- Consumes: a queryable with `.query(text, params)` (real `pool` or fake).
- Produces: `listTransactions(pool, ownerId, filters) → Promise<Array<{id, transaction_date, description, amount, category, account_class, source, payment_method, property_id, entity_id, invoice_id, reviewed, memo}>>`. `filters` = `{ account_class?, property_id?, entity_id?, category?, reviewed?, from?, to?, q? }`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/transactionsService.test.js`:

```javascript
const transactionsService = require('../src/services/transactionsService');

// Fake pool: records the last query text + params, returns canned rows.
function makeFakePool(rows = []) {
  const calls = [];
  return {
    calls,
    query: async (text, params) => {
      calls.push({ text, params });
      return { rows, rowCount: rows.length };
    },
  };
}

describe('transactionsService.listTransactions', () => {
  test('scopes to owner and maps rows', async () => {
    const pool = makeFakePool([
      { id: 'tx1', transaction_date: '2026-07-10', description: 'Rent', amount: '1400.00',
        category: 'Rent Received', account_class: 'real_estate', source: 'manual',
        payment_method: 'check', property_id: 'p1', entity_id: null, invoice_id: 'i1',
        reviewed: true, memo: null },
    ]);
    const out = await transactionsService.listTransactions(pool, 'owner1', {});
    expect(pool.calls[0].params[0]).toBe('owner1');
    expect(out[0].amount).toBe(1400);
    expect(out[0].category).toBe('Rent Received');
  });

  test('adds an account_class filter clause and param when provided', async () => {
    const pool = makeFakePool([]);
    await transactionsService.listTransactions(pool, 'owner1', { account_class: 'personal' });
    expect(pool.calls[0].text).toMatch(/account_class = \$2/);
    expect(pool.calls[0].params).toEqual(['owner1', 'personal']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/transactionsService.test.js -t listTransactions`
Expected: FAIL — `Cannot find module '../src/services/transactionsService'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/services/transactionsService.js`:

```javascript
function format(row) {
  return {
    id: row.id,
    transaction_date: row.transaction_date instanceof Date
      ? row.transaction_date.toISOString().split('T')[0]
      : row.transaction_date,
    description: row.description,
    amount: parseFloat(row.amount),
    category: row.category,
    account_class: row.account_class,
    source: row.source,
    payment_method: row.payment_method || '',
    property_id: row.property_id,
    entity_id: row.entity_id,
    invoice_id: row.invoice_id,
    reviewed: row.reviewed,
    memo: row.memo || '',
  };
}

async function listTransactions(pool, ownerId, filters = {}) {
  const clauses = ['owner_id = $1'];
  const params = [ownerId];
  const add = (sql, value) => { params.push(value); clauses.push(sql.replace('$?', `$${params.length}`)); };

  if (filters.account_class) add('account_class = $?', filters.account_class);
  if (filters.property_id) add('property_id = $?', filters.property_id);
  if (filters.entity_id) add('entity_id = $?', filters.entity_id);
  if (filters.category) add('category = $?', filters.category);
  if (filters.reviewed !== undefined) add('reviewed = $?', filters.reviewed);
  if (filters.from) add('transaction_date >= $?', filters.from);
  if (filters.to) add('transaction_date <= $?', filters.to);
  if (filters.q) add('description ILIKE $?', `%${filters.q}%`);

  const res = await pool.query(
    `SELECT id, transaction_date, description, amount, category, account_class, source,
            payment_method, property_id, entity_id, invoice_id, reviewed, memo
       FROM transactions
      WHERE ${clauses.join(' AND ')}
      ORDER BY transaction_date DESC, created_at DESC`,
    params
  );
  return res.rows.map(format);
}

module.exports = { listTransactions, format };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/transactionsService.test.js -t listTransactions`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
cd /Users/nekanyab/murlee/PMS
git add backend/src/services/transactionsService.js backend/tests/transactionsService.test.js
git commit -m "$(printf 'feat(transactions): add owner-scoped listTransactions with filters\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: transactionsService — create / update / delete

**Files:**
- Modify: `backend/src/services/transactionsService.js`
- Test: `backend/tests/transactionsService.test.js` (add cases)

**Interfaces:**
- Consumes: queryable.
- Produces:
  - `createTransaction(pool, ownerId, input) → Promise<string>` (new id). `input` = `{ amount, transaction_date, description, category, property_id?, entity_id?, account_class?, source?, payment_method? }`.
  - `updateTransaction(pool, ownerId, id, patch) → Promise<boolean>`. `patch` may contain any of `category, property_id, entity_id, account_class, reviewed, memo`.
  - `deleteTransaction(pool, ownerId, id) → Promise<boolean>`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/transactionsService.test.js`:

```javascript
describe('transactionsService.createTransaction', () => {
  test('inserts with defaults and returns the new id', async () => {
    const pool = makeFakePool([{ id: 'new-id' }]);
    const id = await transactionsService.createTransaction(pool, 'owner1', {
      amount: -85, transaction_date: '2026-07-08', description: 'Home Depot', category: 'Supplies',
    });
    expect(id).toBe('new-id');
    const call = pool.calls[0];
    expect(call.text).toMatch(/INSERT INTO transactions/);
    expect(call.params[0]).toBe('owner1');
    expect(call.params).toContain('real_estate'); // default class
    expect(call.params).toContain('manual');      // default source
  });
});

describe('transactionsService.updateTransaction', () => {
  test('builds a dynamic SET from the patch and scopes by owner + id', async () => {
    const pool = makeFakePool([{ id: 'tx1' }]);
    const ok = await transactionsService.updateTransaction(pool, 'owner1', 'tx1', {
      category: 'Repairs', reviewed: true,
    });
    expect(ok).toBe(true);
    const { text, params } = pool.calls[0];
    expect(text).toMatch(/SET category = \$1, reviewed = \$2/);
    expect(text).toMatch(/WHERE id = \$3 AND owner_id = \$4/);
    expect(params).toEqual(['Repairs', true, 'tx1', 'owner1']);
  });

  test('returns false when nothing matched', async () => {
    const pool = makeFakePool([]);
    const ok = await transactionsService.updateTransaction(pool, 'owner1', 'missing', { reviewed: true });
    expect(ok).toBe(false);
  });

  test('ignores keys that are not in the allowlist', async () => {
    const pool = makeFakePool([{ id: 'tx1' }]);
    await transactionsService.updateTransaction(pool, 'owner1', 'tx1', { hacker: 'x', memo: 'ok' });
    expect(pool.calls[0].text).toMatch(/SET memo = \$1/);
    expect(pool.calls[0].text).not.toMatch(/hacker/);
  });
});

describe('transactionsService.deleteTransaction', () => {
  test('returns true when a row was deleted', async () => {
    const pool = { query: async () => ({ rowCount: 1 }) };
    expect(await transactionsService.deleteTransaction(pool, 'owner1', 'tx1')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/transactionsService.test.js`
Expected: FAIL — `createTransaction is not a function` (and update/delete).

- [ ] **Step 3: Write the implementation**

In `backend/src/services/transactionsService.js`, add before `module.exports` and extend the exports:

```javascript
async function createTransaction(pool, ownerId, input) {
  const res = await pool.query(
    `INSERT INTO transactions
       (owner_id, amount, transaction_date, description, category, property_id, entity_id,
        account_class, source, payment_method, reviewed, classification_flag)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      ownerId,
      input.amount,
      input.transaction_date,
      input.description || '',
      input.category || null,
      input.property_id || null,
      input.entity_id || null,
      input.account_class || 'real_estate',
      input.source || 'manual',
      input.payment_method || null,
      input.reviewed ?? false,
      'manual',
    ]
  );
  return res.rows[0].id;
}

const UPDATABLE = ['category', 'property_id', 'entity_id', 'account_class', 'reviewed', 'memo'];

async function updateTransaction(pool, ownerId, id, patch) {
  const keys = Object.keys(patch).filter((k) => UPDATABLE.includes(k));
  if (keys.length === 0) return false;

  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  const params = keys.map((k) => patch[k]);
  params.push(id, ownerId);

  const res = await pool.query(
    `UPDATE transactions SET ${sets.join(', ')}
      WHERE id = $${keys.length + 1} AND owner_id = $${keys.length + 2}
      RETURNING id`,
    params
  );
  return res.rows.length > 0;
}

async function deleteTransaction(pool, ownerId, id) {
  const res = await pool.query(
    'DELETE FROM transactions WHERE id = $1 AND owner_id = $2',
    [id, ownerId]
  );
  return res.rowCount > 0;
}
```

Update the exports line to:

```javascript
module.exports = { listTransactions, createTransaction, updateTransaction, deleteTransaction, format };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/transactionsService.test.js`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
cd /Users/nekanyab/murlee/PMS
git add backend/src/services/transactionsService.js backend/tests/transactionsService.test.js
git commit -m "$(printf 'feat(transactions): add create/update/delete service fns\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: transactionsService — insertRentReceived (idempotent)

**Files:**
- Modify: `backend/src/services/transactionsService.js`
- Test: `backend/tests/transactionsService.test.js` (add cases)

**Interfaces:**
- Consumes: a queryable (real transaction `client` in production; fake in tests).
- Produces: `insertRentReceived(queryable, { ownerId, invoiceId, propertyId, entityId, amount, date, paymentMethod }) → Promise<string|null>`. Returns the new transaction id, or `null` if a `Rent Received` row already exists for that `invoiceId` (idempotency guard so paid→unpaid→paid does not double-post).

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/transactionsService.test.js`:

```javascript
describe('transactionsService.insertRentReceived', () => {
  test('inserts a Rent Received row when none exists for the invoice', async () => {
    const calls = [];
    const q = {
      query: async (text, params) => {
        calls.push({ text, params });
        if (/SELECT id FROM transactions WHERE invoice_id/.test(text)) return { rows: [] };
        return { rows: [{ id: 'rent-tx' }] };
      },
    };
    const id = await transactionsService.insertRentReceived(q, {
      ownerId: 'o1', invoiceId: 'i1', propertyId: 'p1', entityId: null,
      amount: 1400, date: '2026-07-10', paymentMethod: 'check',
    });
    expect(id).toBe('rent-tx');
    const insert = calls.find((c) => /INSERT INTO transactions/.test(c.text));
    expect(insert.params).toContain('Rent Received');
    expect(insert.params).toContain('real_estate');
  });

  test('returns null and does not insert when a Rent Received row already exists', async () => {
    const calls = [];
    const q = {
      query: async (text) => {
        calls.push({ text });
        if (/SELECT id FROM transactions WHERE invoice_id/.test(text)) return { rows: [{ id: 'existing' }] };
        return { rows: [{ id: 'should-not-happen' }] };
      },
    };
    const id = await transactionsService.insertRentReceived(q, {
      ownerId: 'o1', invoiceId: 'i1', propertyId: 'p1', entityId: null,
      amount: 1400, date: '2026-07-10', paymentMethod: 'check',
    });
    expect(id).toBeNull();
    expect(calls.some((c) => /INSERT INTO transactions/.test(c.text))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/transactionsService.test.js -t insertRentReceived`
Expected: FAIL — `insertRentReceived is not a function`.

- [ ] **Step 3: Write the implementation**

In `backend/src/services/transactionsService.js`, add:

```javascript
async function insertRentReceived(queryable, { ownerId, invoiceId, propertyId, entityId, amount, date, paymentMethod }) {
  const existing = await queryable.query(
    "SELECT id FROM transactions WHERE invoice_id = $1 AND category = 'Rent Received' LIMIT 1",
    [invoiceId]
  );
  if (existing.rows.length > 0) return null;

  const res = await queryable.query(
    `INSERT INTO transactions
       (owner_id, invoice_id, property_id, entity_id, amount, transaction_date, description,
        category, account_class, source, payment_method, reviewed, classification_flag)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'Rent Received', 'real_estate', 'manual', $8, TRUE, 'auto')
     RETURNING id`,
    [ownerId, invoiceId, propertyId || null, entityId || null, amount, date,
     'Rent payment received', paymentMethod || null]
  );
  return res.rows[0].id;
}
```

Add `insertRentReceived` to the `module.exports` object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/transactionsService.test.js`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
cd /Users/nekanyab/murlee/PMS
git add backend/src/services/transactionsService.js backend/tests/transactionsService.test.js
git commit -m "$(printf 'feat(transactions): add idempotent insertRentReceived helper\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: transactionsController + route + mount

**Files:**
- Create: `backend/src/controllers/transactionsController.js`
- Create: `backend/src/routes/transactions.js`
- Modify: `backend/src/app.js` (add require near the other route requires ~line 19, and mount near the other mounts ~line 35)

**Interfaces:**
- Consumes: `transactionsService.{listTransactions,createTransaction,updateTransaction,deleteTransaction}`; `pool` from `../config/db`; `req.user.id`.
- Produces: HTTP endpoints `GET /api/transactions`, `POST /api/transactions`, `PATCH /api/transactions/:id`, `DELETE /api/transactions/:id`.

- [ ] **Step 1: Write the controller**

Create `backend/src/controllers/transactionsController.js`:

```javascript
const pool = require('../config/db');
const transactionsService = require('../services/transactionsService');

const mockTransactions = [
  { id: 'L-2', transaction_date: '2026-07-10', description: 'Monthly Rent - Jane Doe', amount: 1400,
    category: 'Rent Received', account_class: 'real_estate', source: 'manual', payment_method: 'check',
    property_id: null, entity_id: null, invoice_id: null, reviewed: true, memo: '' },
  { id: 'L-3', transaction_date: '2026-07-08', description: 'Home Depot supplies', amount: -85,
    category: 'Supplies', account_class: 'real_estate', source: 'manual', payment_method: '',
    property_id: null, entity_id: null, invoice_id: null, reviewed: false, memo: 'Review tax allocation' },
  { id: 'L-1', transaction_date: '2026-07-05', description: 'ONELIFE VICKERY SPORTS C', amount: -200,
    category: 'Health & Wellness', account_class: 'personal', source: 'manual', payment_method: '',
    property_id: null, entity_id: null, invoice_id: null, reviewed: false, memo: '' },
];

function parseFilters(q) {
  const f = {};
  if (q.account_class) f.account_class = q.account_class;
  if (q.property_id) f.property_id = q.property_id;
  if (q.entity_id) f.entity_id = q.entity_id;
  if (q.category) f.category = q.category;
  if (q.reviewed !== undefined) f.reviewed = q.reviewed === 'true';
  if (q.from) f.from = q.from;
  if (q.to) f.to = q.to;
  if (q.q) f.q = q.q;
  return f;
}

async function getTransactions(req, res) {
  const filters = parseFilters(req.query);
  if (!process.env.DATABASE_URL) {
    let rows = mockTransactions;
    if (filters.account_class) rows = rows.filter((r) => r.account_class === filters.account_class);
    return res.json(rows);
  }
  try {
    res.json(await transactionsService.listTransactions(pool, req.user.id, filters));
  } catch (error) {
    console.error('Failed to list transactions:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function createTransaction(req, res) {
  const { amount, transaction_date } = req.body;
  if (amount === undefined || !transaction_date) {
    return res.status(400).json({ error: 'amount and transaction_date are required' });
  }
  if (!process.env.DATABASE_URL) {
    const tx = { id: `L-${Date.now()}`, reviewed: false, memo: '', source: 'manual',
      account_class: 'real_estate', payment_method: '', property_id: null, entity_id: null,
      invoice_id: null, ...req.body };
    mockTransactions.unshift(tx);
    return res.status(201).json(tx);
  }
  try {
    const id = await transactionsService.createTransaction(pool, req.user.id, req.body);
    res.status(201).json({ id });
  } catch (error) {
    console.error('Failed to create transaction:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function updateTransaction(req, res) {
  const { id } = req.params;
  if (!process.env.DATABASE_URL) {
    return res.json({ message: 'Mock transaction updated' });
  }
  try {
    const ok = await transactionsService.updateTransaction(pool, req.user.id, id, req.body);
    if (!ok) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ message: 'Transaction updated successfully' });
  } catch (error) {
    console.error('Failed to update transaction:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function deleteTransaction(req, res) {
  const { id } = req.params;
  if (!process.env.DATABASE_URL) {
    return res.json({ message: 'Mock transaction deleted' });
  }
  try {
    const ok = await transactionsService.deleteTransaction(pool, req.user.id, id);
    if (!ok) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Failed to delete transaction:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { getTransactions, createTransaction, updateTransaction, deleteTransaction };
```

- [ ] **Step 2: Write the route**

Create `backend/src/routes/transactions.js`:

```javascript
const express = require('express');
const router = express.Router();
const transactionsController = require('../controllers/transactionsController');

router.get('/', transactionsController.getTransactions);
router.post('/', transactionsController.createTransaction);
router.patch('/:id', transactionsController.updateTransaction);
router.delete('/:id', transactionsController.deleteTransaction);

module.exports = router;
```

- [ ] **Step 3: Mount in app.js**

In `backend/src/app.js`, add after the other route `require`s (e.g. after the `billingRoutes` require):

```javascript
const transactionsRoutes = require('./routes/transactions');
```

And after the other `app.use('/api/...', requireAuth, ...)` mounts (e.g. after the billing mount):

```javascript
app.use('/api/transactions', requireAuth, transactionsRoutes);
```

- [ ] **Step 4: Verify the server boots and the route responds (mock mode)**

Run (mock mode = no `DATABASE_URL`; `requireAuth` still applies, so expect 401 without a token — that proves it's mounted and guarded):

```bash
cd backend && (node src/app.js &) ; sleep 1 ; \
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5001/api/transactions ; \
pkill -f "node src/app.js"
```

Expected: `401` (route is mounted and auth-guarded). A `404` means the mount is wrong.

- [ ] **Step 5: Commit**

```bash
cd /Users/nekanyab/murlee/PMS
git add backend/src/controllers/transactionsController.js backend/src/routes/transactions.js backend/src/app.js
git commit -m "$(printf 'feat(transactions): add controller, route, and mount\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: Post Rent Received on invoice mark-paid

**Files:**
- Modify: `backend/src/controllers/invoiceController.js` (the `markPaid` function, lines ~114-168)

**Interfaces:**
- Consumes: `transactionsService.insertRentReceived`.
- Produces: marking an invoice paid inserts one `Rent Received` transaction inside the same DB transaction, using `payment_method` from `req.body` (defaults to `null`). No new signature exposed.

- [ ] **Step 1: Add the require**

At the top of `backend/src/controllers/invoiceController.js`, add under the existing requires:

```javascript
const transactionsService = require('../services/transactionsService');
```

- [ ] **Step 2: Extend the context query to include property + entity**

In `markPaid`, replace the `ctx` query's SELECT list so it also returns `u.property_id` and `p.entity_id`:

```javascript
    const ctx = await client.query(
      `SELECT i.amount_due, t.id AS tenant_id, t.name AS tenant_name, t.email AS tenant_email,
              p.owner_id, u.property_id, p.entity_id
       FROM invoices i
       JOIN leases l ON i.lease_id = l.id
       JOIN tenants t ON l.tenant_id = t.id
       JOIN units u ON l.unit_id = u.id
       JOIN properties p ON u.property_id = p.id
       WHERE i.id = $1`,
      [id]
    );
```

- [ ] **Step 3: Insert the Rent Received transaction before COMMIT**

In `markPaid`, immediately BEFORE the `await client.query('COMMIT');` line, add:

```javascript
    const paidCtx = ctx.rows[0];
    if (paidCtx) {
      await transactionsService.insertRentReceived(client, {
        ownerId: paidCtx.owner_id,
        invoiceId: id,
        propertyId: paidCtx.property_id,
        entityId: paidCtx.entity_id,
        amount: parseFloat(paidCtx.amount_due),
        date: new Date().toISOString().split('T')[0],
        paymentMethod: req.body.payment_method || null,
      });
    }
```

(Leave the existing post-COMMIT email block that reads `ctx.rows[0]` as-is.)

- [ ] **Step 4: Verify existing invoice tests still pass**

Run: `cd backend && npx jest`
Expected: PASS — `getInvoiceState`, `authService`, `billingService`, and `transactionsService` suites all green (no regression; `insertRentReceived` unit-tested in Task 4).

- [ ] **Step 5: Commit**

```bash
cd /Users/nekanyab/murlee/PMS
git add backend/src/controllers/invoiceController.js
git commit -m "$(printf 'feat(invoices): post Rent Received transaction on mark-paid\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 7: Frontend — useTransactions hook

**Files:**
- Create: `frontend/src/hooks/useTransactions.ts`

**Interfaces:**
- Consumes: `api` from `../lib/api`; endpoints from Task 5.
- Produces: `useTransactions(filters?) → { transactions, isLoading, createTransaction, updateTransaction, deleteTransaction }`, plus exported `Transaction` and `TransactionInput` types.

- [ ] **Step 1: Write the hook**

Create `frontend/src/hooks/useTransactions.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Transaction {
  id: string;
  transaction_date: string;
  description: string;
  amount: number;
  category: string;
  account_class: 'real_estate' | 'personal';
  source: 'manual' | 'csv' | 'plaid';
  payment_method: string;
  property_id: string | null;
  entity_id: string | null;
  invoice_id: string | null;
  reviewed: boolean;
  memo: string;
}

export type TransactionInput = {
  amount: number;
  transaction_date: string;
  description: string;
  category: string;
  account_class?: 'real_estate' | 'personal';
  property_id?: string | null;
  entity_id?: string | null;
  payment_method?: string;
};

export type TransactionFilters = { account_class?: 'real_estate' | 'personal' };

export const useTransactions = (filters: TransactionFilters = {}) => {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['transactions'] });

  const query = useQuery<Transaction[]>({
    queryKey: ['transactions', filters],
    queryFn: async () => (await api.get('/transactions', { params: filters })).data,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async (input: TransactionInput) => (await api.post('/transactions', input)).data,
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Transaction> & { id: string }) =>
      (await api.patch(`/transactions/${id}`, patch)).data,
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/transactions/${id}`)).data,
    onSuccess: invalidate,
  });

  return {
    transactions: query.data ?? [],
    isLoading: query.isLoading,
    createTransaction: createMutation.mutateAsync,
    updateTransaction: updateMutation.mutateAsync,
    deleteTransaction: deleteMutation.mutateAsync,
  };
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p /Users/nekanyab/murlee/PMS/frontend/tsconfig.json --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/nekanyab/murlee/PMS
git add frontend/src/hooks/useTransactions.ts
git commit -m "$(printf 'feat(transactions): add useTransactions query/mutation hook\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 8: Frontend — wire Ledger to real data + class filter + add-expense

**Files:**
- Modify: `frontend/src/components/Transactions/Ledger.tsx` (replace the `useState(initialLedger)` mock with the hook; add a class filter and an Add-Expense modal; persist category/review edits)

**Interfaces:**
- Consumes: `useTransactions` (Task 7).
- Produces: a Ledger tab that lists real transactions, filters by `account_class`, adds expenses via `POST`, and persists category change + review via `PATCH`.

- [ ] **Step 1: Replace mock state with the hook and a class filter**

In `Ledger.tsx`, replace the `LedgerItem` interface + `initialLedger` array + `const [ledger, setLedger] = useState(initialLedger)` with the hook. At the top of the component:

```typescript
import { useState } from 'react';
import { useTransactions, Transaction, TransactionInput } from '../../hooks/useTransactions';

export const Ledger = () => {
  const [classFilter, setClassFilter] = useState<'all' | 'real_estate' | 'personal'>('all');
  const { transactions, createTransaction, updateTransaction } = useTransactions(
    classFilter === 'all' ? {} : { account_class: classFilter }
  );
  const [selectedItem, setSelectedItem] = useState<Transaction | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
```

Delete the old `filterType`/`memoInput`/`handleApprove`/`handleSaveMemo` logic that mutated local `ledger`, and the `LedgerItem` type. Rework the table to map over `transactions` (filtered client-side by `searchQuery` on `description`/`category`). Field name changes: `item.date → item.transaction_date`, `item.note → item.memo`, `item.account`/`merchantType`/`method` no longer exist (drop those columns/detail rows).

- [ ] **Step 2: Add the class filter buttons to the toolbar**

Replace the "Quick filters" missing-category/missing-property buttons with a class toggle:

```tsx
<div className="flex items-center gap-3">
  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Class</span>
  {(['all', 'real_estate', 'personal'] as const).map((c) => (
    <button
      key={c}
      onClick={() => setClassFilter(c)}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
        classFilter === c
          ? 'bg-indigo-600 text-white border-indigo-500'
          : 'bg-white/5 text-slate-400 border-white/5 hover:text-slate-200'
      }`}
    >
      {c === 'all' ? 'All' : c === 'real_estate' ? 'Real estate' : 'Personal'}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Persist category change and review from the detail modal**

In the detail modal's category `<select>` `onChange`, call the API instead of local state:

```tsx
onChange={async (e) => {
  const category = e.target.value;
  await updateTransaction({ id: selectedItem.id, category });
  setSelectedItem({ ...selectedItem, category });
}}
```

Replace the "Approve Match" button handler:

```tsx
onClick={async () => {
  await updateTransaction({ id: selectedItem.id, reviewed: true });
  setSelectedItem({ ...selectedItem, reviewed: true });
}}
```

And the Save Memo button:

```tsx
onClick={async () => {
  await updateTransaction({ id: selectedItem.id, memo: memoInput });
  setSelectedItem({ ...selectedItem, memo: memoInput });
}}
```

(Keep a `const [memoInput, setMemoInput] = useState('')` seeded in `handleOpenDetails` from `item.memo`.)

- [ ] **Step 4: Add an "Add expense" button + modal**

Add a button in the top action row:

```tsx
<button onClick={() => setIsAddOpen(true)}
  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white">+ Add expense</button>
```

And a modal (place near the detail modal) with fields `description`, `amount`, `transaction_date`, `category`, `account_class`, that on submit calls:

```tsx
const handleAddExpense = async (e: React.FormEvent) => {
  e.preventDefault();
  const input: TransactionInput = {
    description: addForm.description,
    amount: -Math.abs(Number(addForm.amount)),   // expenses are negative
    transaction_date: addForm.transaction_date,
    category: addForm.category,
    account_class: addForm.account_class,
  };
  await createTransaction(input);
  setIsAddOpen(false);
};
```

(Define `addForm` via `useState({ description: '', amount: '', transaction_date: new Date().toISOString().split('T')[0], category: 'Repairs', account_class: 'real_estate' as const })`. Reuse the existing dark modal markup/classes from `Ledger.tsx`.)

- [ ] **Step 5: Typecheck and manual verify**

Run: `npx tsc -p /Users/nekanyab/murlee/PMS/frontend/tsconfig.json --noEmit`
Expected: exit 0.

Then open `http://localhost:5173/murlee-pms/` → Transactions tab (mock mode shows the controller's `mockTransactions`): confirm the class filter switches lists, Add expense prepends a row, and changing a category / approving updates the row.

- [ ] **Step 6: Commit**

```bash
cd /Users/nekanyab/murlee/PMS
git add frontend/src/components/Transactions/Ledger.tsx
git commit -m "$(printf 'feat(transactions): wire Ledger to real API with class filter + add expense\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 9: Remove the Bookkeeping tab (folded into Transactions)

**Files:**
- Modify: `frontend/src/App.tsx` (remove the `bookkeeping` tab everywhere)
- Delete: `frontend/src/components/Bookkeeping/Bookkeeping.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: the nav no longer shows Bookkeeping; its real-estate/personal split now lives as the Transactions class filter.

- [ ] **Step 1: Remove all Bookkeeping references in App.tsx**

In `frontend/src/App.tsx`:
- Delete the lazy import line: `const Bookkeeping = lazy(() => import('./components/Bookkeeping/Bookkeeping')...);`
- Remove `'bookkeeping'` from the `TabType` union.
- Remove the `{ tab: 'bookkeeping', label: 'Bookkeeping', landlordOnly: true }` entry from `NAV_ITEMS`.
- Remove the `{activeTab === 'bookkeeping' && <Bookkeeping />}` render line.
- In `handleRoleChange`, remove `'bookkeeping'` from the `['bookkeeping', 'reports', ...]` redirect array.

- [ ] **Step 2: Delete the component file**

```bash
rm /Users/nekanyab/murlee/PMS/frontend/src/components/Bookkeeping/Bookkeeping.tsx
```

- [ ] **Step 3: Typecheck (proves no dangling references)**

Run: `npx tsc -p /Users/nekanyab/murlee/PMS/frontend/tsconfig.json --noEmit`
Expected: exit 0. A `Cannot find module './components/Bookkeeping/Bookkeeping'` error means a reference was missed in Step 1.

- [ ] **Step 4: Manual verify**

Open `http://localhost:5173/murlee-pms/`: the sidebar no longer lists Bookkeeping; Transactions still loads and its Real estate / Personal filter covers the old Bookkeeping split.

- [ ] **Step 5: Commit**

```bash
cd /Users/nekanyab/murlee/PMS
git add frontend/src/App.tsx
git rm frontend/src/components/Bookkeeping/Bookkeeping.tsx
git commit -m "$(printf 'refactor(bookkeeping): remove tab, folded into Transactions class filter\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-Review

**Spec coverage (Phase 1 rows):**
- *schema* → Task 1. *transactions API* → Tasks 2–5. *invoice→txn on paid* → Tasks 4 + 6. *Ledger wired real* → Tasks 7–8. *manual add* → Task 8. *Bookkeeping folded in* → Tasks 8 (class filter) + 9 (removal). All Phase 1 deliverables map to tasks.
- Deferred by design (Phase 2/3, not this plan): CSV import, Reports API/wiring, Export, Plaid feed, `bank_accounts` table, `autoCategorizeTransaction` wiring.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has an expected result. Frontend "manual verify" steps are explicit because there is no frontend test runner (documented constraint), and back them with `tsc` gates.

**Type consistency:** Service fn names (`listTransactions`, `createTransaction`, `updateTransaction`, `deleteTransaction`, `insertRentReceived`) are identical across service, tests, controller, and invoice caller. Frontend `Transaction` field names (`transaction_date`, `account_class`, `memo`, `reviewed`) match the service `format()` output and the controller mock rows. `insertRentReceived` param object (`ownerId, invoiceId, propertyId, entityId, amount, date, paymentMethod`) is identical in Task 4 and its Task 6 caller.

**Refinement beyond spec:** added `transactions.owner_id` (Task 1) for single-WHERE owner scoping — noted inline.
