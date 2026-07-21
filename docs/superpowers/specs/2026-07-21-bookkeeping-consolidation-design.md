# Bookkeeping / Transactions / Reports Consolidation — Design

**Date:** 2026-07-21
**Project:** #7 of the Murlee PMS redesign roadmap
**Status:** Approved design — ready for implementation planning

## Problem

Three frontend tabs currently do overlapping bookkeeping work, all on hardcoded
mock data with no backend:

- **Bookkeeping** (`Bookkeeping.tsx`) — mock "real estate vs personal" categorized list.
- **Transactions / Ledger** (`Ledger.tsx`) — mock Baselane-style review flow.
- **Reports** (`Reports.tsx`) — mock Cash Flow/NOI, Schedule E, Rent Roll, Delinquency.

The `transactions` table exists and is well-shaped, but nothing writes to it and no
route/controller/service reads it. `bookkeepingService.js` only holds a Schedule E
auto-categorize helper with no caller. The result is three tabs telling three
fabricated, inconsistent money stories.

## Goal

Collapse the three tabs into **one real bookkeeping pipeline**:

- A single **Transactions** ledger backed by the real `transactions` table.
- **Reports** computed live from real transactions + leases + invoices.
- The **Bookkeeping** tab removed (its only real distinction — real-estate vs
  personal — becomes a filter on Transactions).

## Scope decisions (confirmed with the landlord)

- **Rent income** is recorded via the existing "mark invoice paid" action, which
  will *also* post a `Rent Received` transaction. Rent is **not** received via Plaid;
  payment method (check / Zelle / cash) is captured on the mark-paid action.
- **Expenses** enter via three sources: manual entry, CSV/statement upload, and
  (later) a Plaid bank/card feed. The landlord pays from **multiple cards**, so the
  Plaid feed must support multiple connected accounts.
- **Tax reports are in scope** — Schedule E and the full report set are kept.
- **Personal vs real-estate:** keep a per-transaction `account_class`
  (`real_estate | personal`). Personal charges are excluded from Schedule E. This
  replaces the standalone Bookkeeping tab.
- **Plaid cost:** sandbox is free for building; production is a paid per-connected-
  account feed. The pipeline is built source-agnostic so Plaid is an optional final
  phase, not a blocker.

### Non-goals

- Live Plaid rent collection (rent is manual).
- Double-entry / full general-ledger accounting. This is a categorized cash ledger
  sufficient for Schedule E and cashflow, scaled to <25 units, single landlord.
- Drag-drop customizable report builder.

## Architecture — one source-agnostic pipeline

Every money event lands in **one `transactions` table**, tagged with a `source`
(`manual | csv | plaid`). The ledger and reports are agnostic to origin, so manual +
CSV deliver value immediately and Plaid becomes a third feed into the same pipe.

```
mark invoice paid ─┐
add expense ───────┤
CSV / statement ───┼──▶ transactions (source, account_class, category,
Plaid sync (later)─┘        property_id, entity_id, reviewed, memo)
                                │
                                ├──▶ Transactions ledger (review, assign, memo, delete)
                                └──▶ Reports (NOI · Schedule E · Rent Roll · Delinquency) + Export
```

The backend follows the existing repo pattern already used by properties, tenants,
leases, etc.: `routes/*.js → controllers/*.js → services/*.js`, mounted in `app.js`
behind `requireAuth`, with the `config/db.js` mock-pool fallback honored so the app
still boots without Postgres.

## Data model changes

Add to `transactions` (via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, matching the
existing incremental-migration convention in `schema.sql`):

| Column | Type | Purpose |
|---|---|---|
| `property_id` | `UUID REFERENCES properties(id) ON DELETE SET NULL` | Per-property expense tagging (ledger already shows a property column). |
| `account_class` | `VARCHAR(20) DEFAULT 'real_estate' CHECK (account_class IN ('real_estate','personal'))` | Excludes personal from Schedule E. |
| `source` | `VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual','csv','plaid'))` | Origin of the row; keeps the pipeline agnostic. |
| `payment_method` | `VARCHAR(30)` | For income: check/Zelle/cash. For expense: card label/last4. |
| `memo` | `TEXT` | Landlord review note (ledger already has a memo field in the UI). |

New index: `idx_transactions_property_id`, `idx_transactions_account_class`.

**Plaid phase only** — new table:

```sql
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    plaid_item_id VARCHAR(255) UNIQUE,
    plaid_access_token TEXT,        -- stored server-side only
    plaid_cursor TEXT,              -- for /transactions/sync incremental pulls
    institution_name VARCHAR(255),
    account_name VARCHAR(255),
    mask VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Backend

### `transactionsService` + controller + `/api/transactions`

- `GET /api/transactions` — list with filters: `account_class`, `property_id`,
  `entity_id`, `category`, `reviewed`, date range, text search.
- `POST /api/transactions` — manual add (amount, date, description, category,
  property, entity, class, method).
- `PATCH /api/transactions/:id` — update category / property / entity / class /
  reviewed / memo.
- `DELETE /api/transactions/:id`.
- `POST /api/transactions/import` — accepts parsed CSV rows; runs each through
  `bookkeepingService.autoCategorizeTransaction`; inserts with `source='csv'`,
  `reviewed=false` for landlord review.

### `reportsService` + controller + `/api/reports/*`

Computed from real transactions + leases + invoices (no stored aggregates):

- `GET /api/reports/cashflow?from&to&property_id&entity_id` — revenue, operating
  expenses, NOI, net cash flow, per month + totals.
- `GET /api/reports/schedule-e?year&entity_id` — sums by Schedule E category,
  **real-estate class only**.
- `GET /api/reports/rent-roll` — one row per unit from leases (tenant, lease rent,
  status, ledger balance from invoices).
- `GET /api/reports/delinquency` — arrears + aging from unpaid/overdue invoices,
  joined to lease `payment_plan` / `housing_authority`.
- `GET /api/reports/:report/export?format=csv` — server-rendered CSV download.

### `invoiceService` change

`markPaid` (existing) additionally inserts a `Rent Received` transaction:
`account_class='real_estate'`, `category='Rent Received'`, `source='manual'`,
`property_id` derived from lease → unit → property, `payment_method` from the
mark-paid action, `invoice_id` linked. Idempotent: one Rent Received row per invoice
payment (guard on `invoice_id`).

### Plaid phase (`plaidService` extensions)

- Link-token create for onboarding (multiple accounts).
- `exchangePublicToken` → store `bank_accounts` row.
- `syncTransactions` (cursor-based `/transactions/sync`) → upsert into `transactions`
  with `source='plaid'`, auto-categorized, `reviewed=false`.
- Manual "Sync now" endpoint; webhook wiring optional/later.

## Frontend

### Transactions tab (rework `Ledger.tsx`)

- Real data via a new `useTransactions` hook (TanStack Query + axios, matching
  `useInvoiceActions`/`useTenants` patterns).
- Keep the existing review UX (row → detail modal, category select, memo, approve).
- Add toolbar actions: **Add expense**, **Upload CSV / statement**, **Connect bank**
  (Plaid — phase 3, hidden until then).
- **Class filter** (Real estate / Personal / All) — this is the folded-in Bookkeeping
  distinction.
- Persist property / entity / category / class / reviewed / memo edits to the API.
- Wire the currently-dead filters (review status, date range, property).

### Remove Bookkeeping tab

Delete `Bookkeeping.tsx`; remove `bookkeeping` from `App.tsx` `TabType`, `NAV_ITEMS`,
lazy import, render switch, and the tenant-role redirect list.

### Reports tab (wire `Reports.tsx`)

- Real data via a new `useReports` hook per report sub-tab.
- Wire the property and year/FY filters (currently dead buttons).
- Wire **Export Document** to `/api/reports/:report/export`.

### Dashboard (bonus, optional)

Once reports are live, the Dashboard's Net Cashflow MTD and Expenses-vs-Rent widgets
can read real figures instead of mock. Not required for this project's completion.

## Phasing

| Phase | Delivers | Depends on |
|---|---|---|
| **1 — Consolidation** | transactions schema cols + `transactionsService`/controller/route + invoice→txn on paid + Ledger wired real + manual add + Bookkeeping tab removed | — |
| **2 — Reports live** | `reportsService`/controller/routes + Reports tab real + CSV/statement import + Export | Phase 1 |
| **3 — Plaid feed** | `bank_accounts` table + Plaid onboarding + `syncTransactions` into the same pipeline (sandbox-free) | Phase 1 |

Phases 1–2 deliver the full consolidation with real data and zero Plaid dependency.
Phase 3 is additive and can ship whenever the landlord is ready to connect a bank.

## Risks / open points

- **CSV format variance:** every bank exports different columns. Import UI maps
  columns (date / description / amount) on upload; store the mapping is out of scope —
  map per-upload.
- **Auto-categorization accuracy:** `autoCategorizeTransaction` is keyword-based and
  coarse; all imported/synced rows land `reviewed=false` so the landlord confirms.
  Acceptable for <25 units.
- **Rent Received idempotency:** guard against duplicate income rows if an invoice is
  toggled paid→unpaid→paid.
- **Plaid access-token storage:** tokens are server-side only, never returned to the
  client. Encryption-at-rest is a production hardening item flagged for phase 3.

## Testing

- Backend: Jest service tests (repo already uses Jest) for
  `transactionsService` filters/CRUD, CSV import categorization, `reportsService`
  aggregations (NOI, Schedule E real-estate-only exclusion, rent-roll balance,
  delinquency aging), and invoice→transaction posting idempotency.
- Reuse the `config/db.js` mock-pool path so tests and the no-Postgres boot mode both
  stay green.
