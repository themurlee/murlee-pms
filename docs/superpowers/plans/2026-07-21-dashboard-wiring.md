# Dashboard Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dashboard's hardcoded mock data (KPIs, cashflow, rent-collection, expenses, triage, recent payments, setup nudges, tasks) with real backend data, add a real tasks subsystem, and drop widgets/items that have no data source yet.

**Architecture:** Extend `dashboardService.getSummary` with money aggregates, add one `GET /dashboard/overview` endpoint returning `{ cashflow, triage, recentPayments, setup }` computed from `invoices`/`leases`/`units`/`maintenance_tickets`/`transactions`, and a standalone `tasks` table + `/api/tasks` CRUD. The frontend reads these through TanStack Query hooks; the Dashboard component maps them into the existing widgets.

**Tech Stack:** Node + Express + `pg` (hand-written SQL, no ORM), Jest (fake-pool unit tests), React + TypeScript, TanStack Query + axios.

## Global Constraints

- **New service functions take a queryable (`pool` or transaction `client`) as their first argument** (matches `billingService`/`transactionsService`), so pure transforms and query builders are unit-testable with a fake pool. Split SQL fetch from pure shaping so the shaping is tested.
- **Controllers** `require('../config/db')`, include an `if (!process.env.DATABASE_URL)` mock branch, and wrap DB calls in `try/catch` → `res.status(500)`. Dashboard reads are single-landlord and **not owner-filtered** (matching the existing `dashboardService.SUMMARY_QUERY`); `tasks` are owner-scoped via `req.user.id`.
- **Routes** mounted in `src/app.js` behind `requireAuth`.
- **Schema** changes use `CREATE TABLE / ADD COLUMN / CREATE INDEX IF NOT EXISTS` in `schema.sql`.
- **Money** columns are `DECIMAL`; `parseFloat` on the way out.
- **No fake data on the dashboard:** items with no real source (Plaid Health KPI, failed-ACH/broken-plan triage, portal-activation & unsigned-renewal setup nudges) are removed, not stubbed.
- **Frontend** uses the shared `api` axios instance and the `useEntities` hook pattern. No frontend test runner — verify with `cd frontend && ./node_modules/.bin/tsc -p tsconfig.json --noEmit` and a manual browser check.
- **Backend tests:** `cd backend && npx jest tests/<file>.test.js`.
- **Commits:** conventional messages ending with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Continue on branch `spec/bookkeeping-consolidation` (or a new `feat/dashboard-wiring` branch off it — either is fine; do not work on `main`).

## File Structure

**Backend**
- `schema.sql` (modify) — `tasks` table.
- `backend/src/services/tasksService.js` (create) — owner-scoped CRUD.
- `backend/src/controllers/tasksController.js` (create) — handlers + mock branch.
- `backend/src/routes/tasks.js` (create) — routes.
- `backend/src/services/dashboardService.js` (modify) — extend summary + add `getOverview` (cashflow / triage / recent payments / setup) with a pure `buildTriage`.
- `backend/src/controllers/dashboardController.js` (modify) — extend mock summary + add `getOverview`.
- `backend/src/routes/dashboard.js` (modify) — add `/overview`.
- `backend/src/app.js` (modify) — mount `/api/tasks`.
- `backend/tests/tasksService.test.js` (create), `backend/tests/dashboardService.test.js` (create).

**Frontend**
- `frontend/src/hooks/useDashboardStats.ts` (modify) — extend the summary type.
- `frontend/src/hooks/useDashboardOverview.ts` (create).
- `frontend/src/hooks/useTasks.ts` (create).
- `frontend/src/components/Dashboard/Dashboard.tsx` (modify) — wire everything; remove mock arrays and the Plaid Health KPI.

---

### Task 1: tasks table + tasksService

**Files:**
- Modify: `schema.sql` (append after the transactions block from the previous plan)
- Create: `backend/src/services/tasksService.js`
- Test: `backend/tests/tasksService.test.js`

**Interfaces:**
- Consumes: queryable.
- Produces:
  - `listTasks(pool, ownerId) → Promise<Array<{id, title, due_date, done, property_id, created_at}>>` ordered by `done ASC, due_date ASC NULLS LAST`.
  - `createTask(pool, ownerId, { title, due_date?, property_id? }) → Promise<string>`.
  - `updateTask(pool, ownerId, id, patch) → Promise<boolean>` (patch keys: `title, due_date, done, property_id`).
  - `deleteTask(pool, ownerId, id) → Promise<boolean>`.

- [ ] **Step 1: Add the schema**

Append to `schema.sql`:

```sql
-- Landlord's own to-do items (distinct from tenant-driven maintenance requests).
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    due_date DATE,
    done BOOLEAN DEFAULT FALSE,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_done ON tasks(owner_id, done);
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/tasksService.test.js`:

```javascript
const tasksService = require('../src/services/tasksService');

function makeFakePool(rows = []) {
  const calls = [];
  return { calls, query: async (text, params) => { calls.push({ text, params }); return { rows, rowCount: rows.length }; } };
}

describe('tasksService', () => {
  test('listTasks scopes to owner and orders open first', async () => {
    const pool = makeFakePool([{ id: 'k1', title: 'Renew insurance', due_date: '2026-07-30', done: false, property_id: null, created_at: 'x' }]);
    const out = await tasksService.listTasks(pool, 'owner1');
    expect(pool.calls[0].params).toEqual(['owner1']);
    expect(pool.calls[0].text).toMatch(/ORDER BY done ASC/);
    expect(out[0].title).toBe('Renew insurance');
  });

  test('createTask inserts and returns id', async () => {
    const pool = makeFakePool([{ id: 'new' }]);
    const id = await tasksService.createTask(pool, 'owner1', { title: 'Order detectors' });
    expect(id).toBe('new');
    expect(pool.calls[0].params[0]).toBe('owner1');
    expect(pool.calls[0].params[1]).toBe('Order detectors');
  });

  test('updateTask builds dynamic SET from allowlist and scopes by owner+id', async () => {
    const pool = makeFakePool([{ id: 'k1' }]);
    const ok = await tasksService.updateTask(pool, 'owner1', 'k1', { done: true, nope: 1 });
    expect(ok).toBe(true);
    expect(pool.calls[0].text).toMatch(/SET done = \$1/);
    expect(pool.calls[0].text).not.toMatch(/nope/);
    expect(pool.calls[0].params).toEqual([true, 'k1', 'owner1']);
  });

  test('deleteTask returns true when a row was removed', async () => {
    const pool = { query: async () => ({ rowCount: 1 }) };
    expect(await tasksService.deleteTask(pool, 'o', 'k1')).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd backend && npx jest tests/tasksService.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `backend/src/services/tasksService.js`:

```javascript
function format(row) {
  return {
    id: row.id,
    title: row.title,
    due_date: row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : row.due_date,
    done: row.done,
    property_id: row.property_id,
    created_at: row.created_at,
  };
}

async function listTasks(pool, ownerId) {
  const res = await pool.query(
    `SELECT id, title, due_date, done, property_id, created_at
       FROM tasks WHERE owner_id = $1
      ORDER BY done ASC, due_date ASC NULLS LAST, created_at DESC`,
    [ownerId]
  );
  return res.rows.map(format);
}

async function createTask(pool, ownerId, { title, due_date, property_id }) {
  const res = await pool.query(
    `INSERT INTO tasks (owner_id, title, due_date, property_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [ownerId, title, due_date || null, property_id || null]
  );
  return res.rows[0].id;
}

const UPDATABLE = ['title', 'due_date', 'done', 'property_id'];

async function updateTask(pool, ownerId, id, patch) {
  const keys = Object.keys(patch).filter((k) => UPDATABLE.includes(k));
  if (keys.length === 0) return false;
  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  const params = keys.map((k) => patch[k]);
  params.push(id, ownerId);
  const res = await pool.query(
    `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${keys.length + 1} AND owner_id = $${keys.length + 2} RETURNING id`,
    params
  );
  return res.rows.length > 0;
}

async function deleteTask(pool, ownerId, id) {
  const res = await pool.query('DELETE FROM tasks WHERE id = $1 AND owner_id = $2', [id, ownerId]);
  return res.rowCount > 0;
}

module.exports = { listTasks, createTask, updateTask, deleteTask, format };
```

- [ ] **Step 5: Run to verify pass**

Run: `cd backend && npx jest tests/tasksService.test.js`
Expected: PASS (4 passing).

- [ ] **Step 6: Commit**

```bash
cd /Users/nekanyab/murlee/PMS
git add schema.sql backend/src/services/tasksService.js backend/tests/tasksService.test.js
git commit -m "$(printf 'feat(tasks): add tasks table and owner-scoped service with tests\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: tasksController + route + mount

**Files:**
- Create: `backend/src/controllers/tasksController.js`
- Create: `backend/src/routes/tasks.js`
- Modify: `backend/src/app.js`

**Interfaces:**
- Consumes: `tasksService`.
- Produces: `GET /api/tasks`, `POST /api/tasks`, `PATCH /api/tasks/:id`, `DELETE /api/tasks/:id`.

- [ ] **Step 1: Controller**

Create `backend/src/controllers/tasksController.js`:

```javascript
const pool = require('../config/db');
const tasksService = require('../services/tasksService');

let mockTasks = [
  { id: 'k1', title: 'Schedule annual inspection', due_date: '2026-07-24', done: false, property_id: null, created_at: '' },
  { id: 'k2', title: 'Renew landlord insurance', due_date: '2026-07-30', done: false, property_id: null, created_at: '' },
  { id: 'k3', title: 'Order smoke detectors', due_date: null, done: true, property_id: null, created_at: '' },
];

async function getTasks(req, res) {
  if (!process.env.DATABASE_URL) return res.json(mockTasks);
  try {
    res.json(await tasksService.listTasks(pool, req.user.id));
  } catch (e) { console.error('Failed to list tasks:', e); res.status(500).json({ error: 'Internal Server Error' }); }
}

async function createTask(req, res) {
  const { title } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
  if (!process.env.DATABASE_URL) {
    const t = { id: `k-${Date.now()}`, title, due_date: req.body.due_date || null, done: false, property_id: null, created_at: '' };
    mockTasks = [t, ...mockTasks];
    return res.status(201).json(t);
  }
  try {
    const id = await tasksService.createTask(pool, req.user.id, req.body);
    res.status(201).json({ id });
  } catch (e) { console.error('Failed to create task:', e); res.status(500).json({ error: 'Internal Server Error' }); }
}

async function updateTask(req, res) {
  const { id } = req.params;
  if (!process.env.DATABASE_URL) {
    mockTasks = mockTasks.map((t) => (t.id === id ? { ...t, ...req.body } : t));
    return res.json({ message: 'Mock task updated' });
  }
  try {
    const ok = await tasksService.updateTask(pool, req.user.id, id, req.body);
    if (!ok) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task updated successfully' });
  } catch (e) { console.error('Failed to update task:', e); res.status(500).json({ error: 'Internal Server Error' }); }
}

async function deleteTask(req, res) {
  const { id } = req.params;
  if (!process.env.DATABASE_URL) { mockTasks = mockTasks.filter((t) => t.id !== id); return res.json({ message: 'Mock task deleted' }); }
  try {
    const ok = await tasksService.deleteTask(pool, req.user.id, id);
    if (!ok) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task deleted successfully' });
  } catch (e) { console.error('Failed to delete task:', e); res.status(500).json({ error: 'Internal Server Error' }); }
}

module.exports = { getTasks, createTask, updateTask, deleteTask };
```

- [ ] **Step 2: Route**

Create `backend/src/routes/tasks.js`:

```javascript
const express = require('express');
const router = express.Router();
const tasksController = require('../controllers/tasksController');

router.get('/', tasksController.getTasks);
router.post('/', tasksController.createTask);
router.patch('/:id', tasksController.updateTask);
router.delete('/:id', tasksController.deleteTask);

module.exports = router;
```

- [ ] **Step 3: Mount in app.js**

Add the require after `transactionsRoutes`:

```javascript
const tasksRoutes = require('./routes/tasks');
```

And the mount after the transactions mount:

```javascript
app.use('/api/tasks', requireAuth, tasksRoutes);
```

- [ ] **Step 4: Verify boot + guard**

Run:

```bash
cd backend && PORT=5099 node src/app.js & SRV=$!; sleep 1; \
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5099/api/tasks; kill $SRV
```

Expected: `401`.

- [ ] **Step 5: Commit**

```bash
cd /Users/nekanyab/murlee/PMS
git add backend/src/controllers/tasksController.js backend/src/routes/tasks.js backend/src/app.js
git commit -m "$(printf 'feat(tasks): add controller, route, and mount\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: Extend dashboard summary with money aggregates

**Files:**
- Modify: `backend/src/services/dashboardService.js` (extend `SUMMARY_QUERY` + `getSummary` return)
- Modify: `backend/src/controllers/dashboardController.js` (extend `MOCK_SUMMARY`)

**Interfaces:**
- Produces: `getSummary()` return additionally includes `netCashflowMTD`, `grossRentMTD`, `operatingExpensesMTD`, `collectedThisMonth`, `pendingThisMonth` (all numbers).

- [ ] **Step 1: Extend the SQL and return in `dashboardService.js`**

Replace `SUMMARY_QUERY` and the `getSummary` return object:

```javascript
const SUMMARY_QUERY = `
  SELECT
    (SELECT COALESCE(SUM(rent_amount), 0) FROM leases WHERE status = 'active') AS gross_monthly_income,
    (SELECT COUNT(*) FROM units) AS total_units,
    (SELECT COUNT(DISTINCT unit_id) FROM leases WHERE status = 'active') AS occupied_units,
    (SELECT COALESCE(SUM(amount_due + late_fee), 0) FROM invoices WHERE status IN ('unpaid', 'overdue')) AS overdue_total,
    (SELECT COUNT(*) FROM maintenance_tickets WHERE status != 'resolved') AS open_maintenance_count,
    (SELECT COUNT(*) FROM invoices WHERE status = 'paid' AND date_trunc('month', due_date) = date_trunc('month', CURRENT_DATE)) AS paid_this_month,
    (SELECT COUNT(*) FROM invoices WHERE date_trunc('month', due_date) = date_trunc('month', CURRENT_DATE)) AS invoiced_this_month,
    (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE account_class = 'real_estate' AND date_trunc('month', transaction_date) = date_trunc('month', CURRENT_DATE)) AS net_cashflow_mtd,
    (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE account_class = 'real_estate' AND amount > 0 AND date_trunc('month', transaction_date) = date_trunc('month', CURRENT_DATE)) AS gross_rent_mtd,
    (SELECT COALESCE(-SUM(amount), 0) FROM transactions WHERE account_class = 'real_estate' AND amount < 0 AND date_trunc('month', transaction_date) = date_trunc('month', CURRENT_DATE)) AS op_expenses_mtd,
    (SELECT COALESCE(SUM(amount_due + late_fee), 0) FROM invoices WHERE status = 'paid' AND date_trunc('month', due_date) = date_trunc('month', CURRENT_DATE)) AS collected_this_month,
    (SELECT COALESCE(SUM(amount_due + late_fee), 0) FROM invoices WHERE status IN ('unpaid', 'overdue') AND date_trunc('month', due_date) = date_trunc('month', CURRENT_DATE)) AS pending_this_month
`;
```

And in `getSummary`, add to the returned object:

```javascript
    netCashflowMTD: parseFloat(row.net_cashflow_mtd),
    grossRentMTD: parseFloat(row.gross_rent_mtd),
    operatingExpensesMTD: parseFloat(row.op_expenses_mtd),
    collectedThisMonth: parseFloat(row.collected_this_month),
    pendingThisMonth: parseFloat(row.pending_this_month),
```

- [ ] **Step 2: Extend `MOCK_SUMMARY` in `dashboardController.js`**

```javascript
const MOCK_SUMMARY = {
  grossMonthlyIncome: 26600,
  totalUnits: 25,
  occupiedUnits: 20,
  overdueTotal: 1596,
  openMaintenanceCount: 2,
  rentCollectionRate: 0.94,
  netCashflowMTD: 9820,
  grossRentMTD: 26600,
  operatingExpensesMTD: 4120,
  collectedThisMonth: 25004,
  pendingThisMonth: 1596,
};
```

- [ ] **Step 3: Verify existing tests unaffected**

Run: `cd backend && npx jest`
Expected: PASS (existing suites green; no dashboard unit test yet — added in Task 4).

- [ ] **Step 4: Commit**

```bash
cd /Users/nekanyab/murlee/PMS
git add backend/src/services/dashboardService.js backend/src/controllers/dashboardController.js
git commit -m "$(printf 'feat(dashboard): add money aggregates to summary (net cashflow, expenses, collected/pending)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: dashboard overview endpoint (cashflow, triage, recent payments, setup)

**Files:**
- Modify: `backend/src/services/dashboardService.js` (add `buildTriage`, `getOverview`)
- Modify: `backend/src/controllers/dashboardController.js` (add `getOverview` + mock)
- Modify: `backend/src/routes/dashboard.js` (add `/overview`)
- Test: `backend/tests/dashboardService.test.js` (create)

**Interfaces:**
- Produces:
  - `buildTriage({ overdue, maintenance, expiring, vacant }) → Array<{ id, sev, kind, who, unit, detail, meta, dollars, dollarLabel, action }>` (pure; sorted by `dollars` desc).
  - `getOverview(pool) → Promise<{ cashflow: Array<{month, net}>, triage: [...], recentPayments: Array<{who, unit, amount, method, when}>, setup: Array<{label}> }>`.

- [ ] **Step 1: Write the failing test for `buildTriage`**

Create `backend/tests/dashboardService.test.js`:

```javascript
const dashboardService = require('../src/services/dashboardService');

describe('dashboardService.buildTriage', () => {
  const sets = {
    overdue: [{ id: 'i1', amount_due: '1800', late_fee: '150', due_date: '2026-06-10', name: 'Jane Doe', unit_number: '101', nickname: 'Oakridge' }],
    maintenance: [{ id: 'm1', issue_description: 'No hot water', priority: 'emergency', status: 'open', reported_at: '2026-07-20', unit_number: '105', nickname: 'Oakridge' }],
    expiring: [{ id: 'l1', end_date: '2026-08-10', name: 'John Smith', unit_number: '4', nickname: 'Pacific', rent_amount: '1350' }],
    vacant: [{ id: 'u1', unit_number: '108', nickname: 'Oakridge', market_rent: '1450' }],
  };

  test('produces one item per row across all sets', () => {
    const out = dashboardService.buildTriage(sets);
    expect(out).toHaveLength(4);
  });

  test('ranks by dollars at risk, highest first', () => {
    const out = dashboardService.buildTriage(sets);
    expect(out[0].dollars).toBeGreaterThanOrEqual(out[1].dollars);
    expect(out[0].kind).toBe('RENT'); // 1950 is the largest
    expect(out[0].dollarLabel).toMatch(/\$1,950/);
  });

  test('marks emergency maintenance as critical severity', () => {
    const out = dashboardService.buildTriage(sets);
    const fix = out.find((x) => x.kind === 'FIX');
    expect(fix.sev).toBe('critical');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest tests/dashboardService.test.js`
Expected: FAIL — `buildTriage is not a function`.

- [ ] **Step 3: Implement `buildTriage`, the fetchers, and `getOverview`**

In `backend/src/services/dashboardService.js`, add before `module.exports`:

```javascript
function daysBetween(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

function buildTriage({ overdue = [], maintenance = [], expiring = [], vacant = [] }) {
  const now = new Date();
  const items = [];

  for (const r of overdue) {
    const dollars = parseFloat(r.amount_due) + parseFloat(r.late_fee || 0);
    const late = daysBetween(now, new Date(r.due_date));
    items.push({
      id: `rent-${r.id}`, sev: late > 15 ? 'critical' : 'serious', kind: 'RENT',
      who: r.name, unit: `${r.nickname} #${r.unit_number}`,
      detail: `${late} days late`, meta: null, dollars,
      dollarLabel: `$${dollars.toLocaleString()}`, action: 'Send late notice',
    });
  }
  for (const r of maintenance) {
    const age = daysBetween(now, new Date(r.reported_at));
    const emergency = r.priority === 'emergency';
    items.push({
      id: `fix-${r.id}`, sev: emergency ? 'critical' : 'warning', kind: 'FIX',
      who: r.issue_description, unit: `${r.nickname || '—'} #${r.unit_number || '—'}`,
      detail: emergency ? 'Emergency' : `Open ${age} days`,
      meta: r.status === 'open' ? 'Unassigned' : r.status.replace('_', ' '),
      dollars: emergency ? 1500 : 100, dollarLabel: emergency ? 'SLA breach risk' : 'Aging WO',
      action: emergency ? 'Assign vendor' : 'Follow up',
    });
  }
  for (const r of expiring) {
    const rent = parseFloat(r.rent_amount || 0);
    const days = daysBetween(new Date(r.end_date), now);
    items.push({
      id: `lease-${r.id}`, sev: 'warning', kind: 'LEASE',
      who: r.name, unit: `${r.nickname} #${r.unit_number}`,
      detail: `Lease ends in ${days} days`, meta: 'Renewal not sent', dollars: rent,
      dollarLabel: `$${rent.toLocaleString()} / mo at stake`, action: 'Send renewal',
    });
  }
  for (const r of vacant) {
    const rent = parseFloat(r.market_rent || 0);
    items.push({
      id: `vac-${r.id}`, sev: 'serious', kind: 'VACANT',
      who: 'Vacant unit', unit: `${r.nickname} #${r.unit_number}`,
      detail: 'No active lease', meta: 'Lost rent accruing', dollars: rent,
      dollarLabel: `–$${rent.toLocaleString()} / mo`, action: 'List unit',
    });
  }

  return items.sort((a, b) => b.dollars - a.dollars);
}

async function getOverview(pool) {
  const [cashRes, overdue, maintenance, expiring, vacant, payments, missingPhone] = await Promise.all([
    pool.query(
      `SELECT to_char(date_trunc('month', transaction_date), 'Mon') AS month,
              date_trunc('month', transaction_date) AS m,
              COALESCE(SUM(amount), 0) AS net
         FROM transactions
        WHERE account_class = 'real_estate'
          AND transaction_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
        GROUP BY m ORDER BY m`
    ),
    pool.query(
      `SELECT i.id, i.amount_due, i.late_fee, i.due_date, t.name, u.unit_number, p.nickname
         FROM invoices i JOIN leases l ON i.lease_id = l.id JOIN tenants t ON l.tenant_id = t.id
         JOIN units u ON l.unit_id = u.id JOIN properties p ON u.property_id = p.id
        WHERE i.status IN ('unpaid', 'overdue') AND i.due_date < CURRENT_DATE`
    ),
    pool.query(
      `SELECT m.id, m.issue_description, m.priority, m.status, m.reported_at, u.unit_number, p.nickname
         FROM maintenance_tickets m LEFT JOIN units u ON m.unit_id = u.id LEFT JOIN properties p ON m.property_id = p.id
        WHERE m.status != 'resolved' AND (m.priority = 'emergency' OR m.reported_at < CURRENT_DATE - INTERVAL '7 days')`
    ),
    pool.query(
      `SELECT l.id, l.end_date, t.name, u.unit_number, p.nickname, l.rent_amount
         FROM leases l JOIN tenants t ON l.tenant_id = t.id JOIN units u ON l.unit_id = u.id
         JOIN properties p ON u.property_id = p.id
        WHERE l.status = 'active' AND l.end_date <= CURRENT_DATE + INTERVAL '60 days'`
    ),
    pool.query(
      `SELECT u.id, u.unit_number, u.market_rent, p.nickname
         FROM units u JOIN properties p ON u.property_id = p.id
        WHERE u.id NOT IN (SELECT unit_id FROM leases WHERE status = 'active')`
    ),
    pool.query(
      `SELECT tx.amount, tx.transaction_date, tx.payment_method, t.name, u.unit_number
         FROM transactions tx JOIN invoices i ON tx.invoice_id = i.id JOIN leases l ON i.lease_id = l.id
         JOIN tenants t ON l.tenant_id = t.id JOIN units u ON l.unit_id = u.id
        WHERE tx.category = 'Rent Received'
        ORDER BY tx.transaction_date DESC, tx.created_at DESC LIMIT 5`
    ),
    pool.query(`SELECT COUNT(*)::int AS n FROM tenants WHERE role = 'tenant' AND (phone IS NULL OR phone = '')`),
  ]);

  const cashflow = cashRes.rows.map((r) => ({ month: r.month, net: parseFloat(r.net) }));
  const triage = buildTriage({
    overdue: overdue.rows, maintenance: maintenance.rows, expiring: expiring.rows, vacant: vacant.rows,
  });
  const recentPayments = payments.rows.map((r) => ({
    who: r.name, unit: r.unit_number ? `#${r.unit_number}` : '', amount: parseFloat(r.amount),
    method: r.payment_method || 'ACH',
    when: r.transaction_date instanceof Date ? r.transaction_date.toISOString().split('T')[0] : r.transaction_date,
  }));
  const setup = [];
  const missing = missingPhone.rows[0].n;
  if (missing > 0) setup.push({ label: `${missing} tenant${missing === 1 ? '' : 's'} missing a phone number` });

  return { cashflow, triage, recentPayments, setup };
}
```

Update the exports to include the new functions:

```javascript
module.exports = { getSummary, getOverview, buildTriage };
```

- [ ] **Step 4: Run the test to verify pass**

Run: `cd backend && npx jest tests/dashboardService.test.js`
Expected: PASS (3 passing).

- [ ] **Step 5: Add controller + route**

In `backend/src/controllers/dashboardController.js`, add a mock overview and handler, and export it:

```javascript
const MOCK_OVERVIEW = {
  cashflow: [
    { month: 'Feb', net: 8200 }, { month: 'Mar', net: 9100 }, { month: 'Apr', net: 7600 },
    { month: 'May', net: 10400 }, { month: 'Jun', net: 9300 }, { month: 'Jul', net: 9820 },
  ],
  triage: [
    { id: 'rent-1', sev: 'critical', kind: 'RENT', who: 'Jane Doe', unit: 'Oakridge #101', detail: '34 days late', meta: null, dollars: 1950, dollarLabel: '$1,950', action: 'Send late notice' },
    { id: 'vac-1', sev: 'serious', kind: 'VACANT', who: 'Vacant unit', unit: 'Oakridge #108', detail: 'No active lease', meta: 'Lost rent accruing', dollars: 1450, dollarLabel: '–$1,450 / mo', action: 'List unit' },
  ],
  recentPayments: [
    { who: 'John Smith', unit: '#4', amount: 1350, method: 'check', when: '2026-07-19' },
    { who: 'Sarah Lee', unit: '#103', amount: 1450, method: 'ACH', when: '2026-07-18' },
  ],
  setup: [{ label: '2 tenants missing a phone number' }],
};

async function getOverview(req, res) {
  if (!process.env.DATABASE_URL) return res.json(MOCK_OVERVIEW);
  try {
    res.json(await dashboardService.getOverview(require('../config/db')));
  } catch (error) {
    console.error('Failed to compute dashboard overview:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { getSummary, getOverview };
```

In `backend/src/routes/dashboard.js`, add:

```javascript
router.get('/overview', dashboardController.getOverview);
```

- [ ] **Step 6: Verify boot + full suite**

Run:

```bash
cd backend && PORT=5099 node src/app.js & SRV=$!; sleep 1; \
curl -s -o /dev/null -w "overview:%{http_code}\n" http://localhost:5099/api/dashboard/overview; kill $SRV
npx jest 2>&1 | tail -4
```

Expected: `overview:401` and all Jest suites pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/nekanyab/murlee/PMS
git add backend/src/services/dashboardService.js backend/src/controllers/dashboardController.js backend/src/routes/dashboard.js backend/tests/dashboardService.test.js
git commit -m "$(printf 'feat(dashboard): add /overview (cashflow, ranked triage, recent payments, setup)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: Frontend hooks

**Files:**
- Modify: `frontend/src/hooks/useDashboardStats.ts` (extend `DashboardSummary`)
- Create: `frontend/src/hooks/useDashboardOverview.ts`
- Create: `frontend/src/hooks/useTasks.ts`

**Interfaces:**
- Produces: extended `DashboardSummary`; `useDashboardOverview()`; `useTasks()`.

- [ ] **Step 1: Extend the summary type**

In `frontend/src/hooks/useDashboardStats.ts`, add to the `DashboardSummary` interface:

```typescript
  netCashflowMTD: number;
  grossRentMTD: number;
  operatingExpensesMTD: number;
  collectedThisMonth: number;
  pendingThisMonth: number;
```

- [ ] **Step 2: Overview hook**

Create `frontend/src/hooks/useDashboardOverview.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export type TriageItem = {
  id: string; sev: 'critical' | 'serious' | 'warning'; kind: string;
  who: string; unit: string; detail: string; meta: string | null;
  dollars: number; dollarLabel: string; action: string;
};
export type RecentPayment = { who: string; unit: string; amount: number; method: string; when: string };
export interface DashboardOverview {
  cashflow: { month: string; net: number }[];
  triage: TriageItem[];
  recentPayments: RecentPayment[];
  setup: { label: string }[];
}

export const useDashboardOverview = () =>
  useQuery<DashboardOverview>({
    queryKey: ['dashboard-overview'],
    queryFn: async () => (await api.get('/dashboard/overview')).data,
    staleTime: 15_000,
  });
```

- [ ] **Step 3: Tasks hook**

Create `frontend/src/hooks/useTasks.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Task {
  id: string; title: string; due_date: string | null; done: boolean; property_id: string | null;
}

export const useTasks = () => {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tasks'] });

  const query = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: async () => (await api.get('/tasks')).data,
    staleTime: 30_000,
  });
  const createMutation = useMutation({
    mutationFn: async (input: { title: string; due_date?: string | null }) => (await api.post('/tasks', input)).data,
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Task> & { id: string }) => (await api.patch(`/tasks/${id}`, patch)).data,
    onSuccess: invalidate,
  });

  return {
    tasks: query.data ?? [],
    createTask: createMutation.mutateAsync,
    updateTask: updateMutation.mutateAsync,
  };
};
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && ./node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/nekanyab/murlee/PMS
git add frontend/src/hooks/useDashboardStats.ts frontend/src/hooks/useDashboardOverview.ts frontend/src/hooks/useTasks.ts
git commit -m "$(printf 'feat(dashboard): add overview + tasks query hooks, extend summary type\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: Wire Dashboard KPIs + charts; remove Plaid Health

**Files:**
- Modify: `frontend/src/components/Dashboard/Dashboard.tsx`

**Interfaces:**
- Consumes: extended `useDashboardStats`, `useDashboardOverview`.

- [ ] **Step 1: Consume overview + real cashflow**

At the top of the `Dashboard` component, add `const { data: overview } = useDashboardOverview();` (import it). Replace the hardcoded `cashflowData`/`months` with values derived from `overview`:

```typescript
  const cashflowSeries = overview?.cashflow ?? [];
  const cashflowData = cashflowSeries.map((c) => c.net);
  const months = cashflowSeries.map((c) => c.month);
```

Change the `points/pathD/areaD` `useMemo` dependency array from `[]` to `[overview]`, and guard against an empty series (if `cashflowData.length < 2`, render an empty chart box). Compute the MoM badge from the series instead of the hardcoded `+12.4%`:

```typescript
  const momPct = cashflowData.length >= 2 && cashflowData[cashflowData.length - 2] !== 0
    ? Math.round(((cashflowData[cashflowData.length - 1] - cashflowData[cashflowData.length - 2]) / Math.abs(cashflowData[cashflowData.length - 2])) * 1000) / 10
    : 0;
```

Replace the hardcoded `+12.4% MoM` text with `{momPct >= 0 ? '+' : ''}{momPct}% MoM`.

- [ ] **Step 2: Remove the Plaid Health KPI card and wire Net Cashflow MTD**

Delete the entire `Plaid Connection Health` KPI card `<div>`. Change the grid from `lg:grid-cols-5` to `lg:grid-cols-4`. Replace the `netCashflowMTD` mock const usage with `stats?.netCashflowMTD`:

```tsx
<p className="text-2xl font-extrabold mt-3 text-white text-outfit tracking-tight">${(stats?.netCashflowMTD ?? 0).toLocaleString()}</p>
```

Remove the now-unused `const netCashflowMTD = 9820;` line.

- [ ] **Step 3: Wire Rent Collection paid/pending + Expenses vs Rent**

In the Rent Collection panel, replace the hardcoded `$25,004` / `$1,596`:

```tsx
<span>Paid: <strong className="text-emerald-400">${(stats?.collectedThisMonth ?? 0).toLocaleString()}</strong></span>
<span>Pending: <strong className="text-amber-400">${(stats?.pendingThisMonth ?? 0).toLocaleString()}</strong></span>
```

In the Expenses vs Rent panel, replace the hardcoded `$26,600` / `$4,120` and the bar widths:

```tsx
// Gross Rent value:
<span className="text-emerald-400">${(stats?.grossRentMTD ?? 0).toLocaleString()}</span>
// Operating Expenses value:
<span className="text-rose-400">${(stats?.operatingExpensesMTD ?? 0).toLocaleString()}</span>
```

For the two bar widths, compute a shared denominator:

```typescript
  const rentVsExpTotal = Math.max((stats?.grossRentMTD ?? 0) + (stats?.operatingExpensesMTD ?? 0), 1);
  const rentPct = Math.round(((stats?.grossRentMTD ?? 0) / rentVsExpTotal) * 100);
  const expPct = 100 - rentPct;
```

and set `style={{ width: `${rentPct}%` }}` / `style={{ width: `${expPct}%` }}` on the two bars.

- [ ] **Step 4: Typecheck + manual verify**

Run: `cd frontend && ./node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: exit 0. Then load the Dashboard (backend running on :5001): KPI row is now 4 cards (no Plaid), cashflow chart + collection + expenses show overview/summary values (mock-mode values in mock mode).

- [ ] **Step 5: Commit**

```bash
cd /Users/nekanyab/murlee/PMS
git add frontend/src/components/Dashboard/Dashboard.tsx
git commit -m "$(printf 'feat(dashboard): wire KPIs + charts to real data, drop Plaid Health card\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 7: Wire triage feed + setup nudge from overview

**Files:**
- Modify: `frontend/src/components/Dashboard/Dashboard.tsx`

- [ ] **Step 1: Replace the hardcoded `TRIAGE` array with overview data**

Delete the module-level `TRIAGE` constant. In the triage section, map `overview?.triage ?? []` through the existing `TriageRow` component. `TriageRow` already accepts `{ id, sev, kind, who, unit, detail, meta, dollarLabel, action }` — the overview `TriageItem` shape matches, so pass items straight through. Update `TriageRow`'s prop type to import/accept `TriageItem` from `useDashboardOverview` (or keep the local `TriageItem` type but ensure fields line up: `meta` is `string | null`).

Add an empty state: if `overview` loaded and `triage.length === 0`, render a "You're all caught up — nothing needs you today." row.

- [ ] **Step 2: Replace the hardcoded `HYGIENE` array with overview setup**

Delete the module-level `HYGIENE` constant. In the setup nudge row, map `overview?.setup ?? []` for the `{label}` items. If `setup.length === 0`, do not render the setup row at all (no fake nudges).

- [ ] **Step 3: Typecheck + manual verify**

Run: `cd frontend && ./node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: exit 0. Dashboard triage list + setup nudge now come from `/dashboard/overview`; the failed-ACH/broken-plan rows and portal/renewal nudges are gone.

- [ ] **Step 4: Commit**

```bash
cd /Users/nekanyab/murlee/PMS
git add frontend/src/components/Dashboard/Dashboard.tsx
git commit -m "$(printf 'feat(dashboard): wire triage + setup nudge to overview, drop no-source items\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 8: Wire Recent payments + Your tasks (real, with add/toggle)

**Files:**
- Modify: `frontend/src/components/Dashboard/Dashboard.tsx`

**Interfaces:**
- Consumes: `useDashboardOverview` (recentPayments), `useTasks`.

- [ ] **Step 1: Wire Recent payments**

Delete the module-level `RECENT_PAYMENTS` const and the `Payment` type. Change `PaymentsWidget` to take payments as a prop: `PaymentsWidget({ payments }: { payments: RecentPayment[] })` (import `RecentPayment`). Compute the "this week" total from the prop. In the render, pass `<PaymentsWidget payments={overview?.recentPayments ?? []} />`. Keep the `initials()` helper. Add an empty state ("No payments recorded yet.") when the list is empty.

- [ ] **Step 2: Wire Your tasks to `useTasks` with toggle + add**

Delete the module-level `TASKS` const and `Task` type. Convert `TasksWidget` to consume the hook directly:

```tsx
const TasksWidget = () => {
  const { tasks, createTask, updateTask } = useTasks();
  const [newTitle, setNewTitle] = useState('');
  const open = tasks.filter((t) => !t.done).length;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await createTask({ title: newTitle.trim() });
    setNewTitle('');
  };

  return (
    <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-bold text-white text-outfit">Your tasks</h3>
        <span className="text-xs text-slate-400">{open} open</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {tasks.map((t) => (
          <label key={t.id} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={t.done}
              onChange={() => updateTask({ id: t.id, done: !t.done })}
              className="w-4 h-4 rounded bg-slate-900 border-white/15 text-indigo-500 focus:ring-indigo-500 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-semibold truncate ${t.done ? 'text-slate-500 line-through' : 'text-white'}`}>{t.title}</div>
              {t.due_date && <div className="text-xs text-slate-500">Due {t.due_date}</div>}
            </div>
          </label>
        ))}
        {tasks.length === 0 && <span className="text-slate-500 text-xs italic">No tasks yet.</span>}
      </div>
      <form onSubmit={add} className="flex gap-2 mt-1">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a task…"
          className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
        />
        <button type="submit" className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold">Add</button>
      </form>
    </div>
  );
};
```

Ensure `useState` is imported in `Dashboard.tsx` (add to the existing `import { useMemo } from 'react'` → `import { useMemo, useState } from 'react'`).

- [ ] **Step 3: Typecheck + manual verify**

Run: `cd frontend && ./node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: exit 0. On the Dashboard: Recent payments come from overview; Your tasks lists real tasks, checkbox toggles persist (PATCH), and the add-task box appends (POST).

- [ ] **Step 4: Commit**

```bash
cd /Users/nekanyab/murlee/PMS
git add frontend/src/components/Dashboard/Dashboard.tsx
git commit -m "$(printf 'feat(dashboard): wire recent payments + real tasks (toggle/add)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-Review

**Spec coverage (dashboard widgets):**
- KPIs (income/occupancy/delinquency) already real; Net Cashflow MTD → Tasks 3, 6. Cashflow trend → Tasks 4, 6. Rent collection paid/pending + Expenses vs Rent → Tasks 3, 6. Triage → Tasks 4, 7. Setup nudge (missing phone only) → Tasks 4, 7. Recent payments → Tasks 4, 8. Your tasks (real table) → Tasks 1, 2, 5, 8. Plaid Health / failed-ACH / portal / renewal → removed (Tasks 6, 7). All mapped.

**Placeholder scan:** No TBD/TODO; backend steps show complete code; frontend steps give exact snippets against the current `Dashboard.tsx`. Manual-verify steps are explicit (no frontend test runner — documented) and gated by `tsc`.

**Type consistency:** `buildTriage` output fields (`id, sev, kind, who, unit, detail, meta, dollars, dollarLabel, action`) match the frontend `TriageItem` type and the existing `TriageRow` props. `useDashboardOverview` `DashboardOverview` shape (`cashflow/triage/recentPayments/setup`) matches `getOverview`'s return and the controller mock. Summary additions (`netCashflowMTD, grossRentMTD, operatingExpensesMTD, collectedThisMonth, pendingThisMonth`) are identical in service return, `MOCK_SUMMARY`, and the `DashboardSummary` type. Tasks fields (`id, title, due_date, done, property_id`) match across service/controller/hook/widget.

**Notes:** Dashboard aggregates are intentionally not owner-scoped (single landlord), matching the existing `SUMMARY_QUERY`; `tasks` are owner-scoped. Triage `dollars` for maintenance uses fixed weights (emergency 1500 / aging 100) since a work order has no intrinsic $ — documented in code.
