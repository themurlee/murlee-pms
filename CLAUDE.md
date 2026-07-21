# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Murlee PMS is a property management system: a rent-collection, bookkeeping, and maintenance-tracking app for landlords/tenants with Plaid-based ACH payments. It is a two-package monorepo (no root `package.json`) — `backend/` (Express + PostgreSQL) and `frontend/` (Vite + React + TypeScript). There is no root-level install/build/test command; run npm scripts from within each package directory.

## Commands

### Backend (`backend/`)
```
npm install
npm run dev          # nodemon src/app.js (auto-reload)
npm start             # node --env-file=../.env src/app.js (reads env from repo-root .env, not backend/.env)
npm test              # jest, all tests in backend/tests/
npx jest tests/getInvoiceState.test.js   # run a single test file
```

### Frontend (`frontend/`)
```
npm install
npm run dev            # vite dev server on :5173, proxies /api -> http://localhost:5001
npm run build           # tsc (typecheck) && vite build
npm run preview
```
There is no frontend test runner configured yet.

### Env
A single `.env` file lives at the repo root (`PMS/.env`, not inside `backend/`) and is loaded via `--env-file=../.env`. Keys: `DATABASE_URL`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `PORT` (backend default port is 5001 in this env, matching the frontend dev-server proxy target — do not assume Express's own default of 5000).

## Architecture

### Backend is a partial scaffold — most services aren't wired to routes yet
`backend/src/app.js` only mounts two route groups: `/api/webhooks` (Plaid webhooks) and `/api/invoices`. Only the invoice flow (`routes/invoices.js` → `controllers/invoiceController.js` → `services/invoiceService.js`) is fully connected end-to-end. `services/bookkeepingService.js` (Schedule E auto-categorization), `services/maintenanceService.js` (inbound email/SMS → maintenance tickets), and `services/plaidService.js` (Plaid Link token refresh) exist but have no corresponding routes or callers yet — when wiring up new backend features for these domains, you'll likely need to add the route file, controller, and mount it in `app.js` following the invoices pattern. `middleware/rbac.js` (`authorizeRoles`) is also defined but not yet applied to any route — routes currently have no auth/role enforcement.

### Dual mock-data pattern (backend)
`config/db.js` exports a mock `pool` (logs queries, returns canned rows) whenever `DATABASE_URL` is unset, so the app boots without Postgres. On top of that, `invoiceController.js` has its *own* separate hardcoded mock-response branches (`if (!process.env.DATABASE_URL) return mockInvoices`) rather than relying on the mock pool. When modifying invoice endpoints, keep both mock paths and the real DB path in sync, or you'll get behavior that works in one mode and not the other.

### Invoice state derivation
Invoice status/actions are computed, not stored as-is: `getInvoiceState()` (duplicated in `controllers/invoiceController.js` and re-implemented for tests in `backend/tests/getInvoiceState.test.js`) derives an effective `overdue` status from `due_date` vs. now, and derives `actions.{can_mark_as_paid,can_edit,can_delete}` from whether the invoice is paid. The DB `invoices.status` column itself only ever holds `paid | unpaid | processing` from writes — `overdue` is a view-layer/response-layer concept layered on top at read time. Keep the two implementations in sync if you change the logic (there's no shared module between them currently).

### Plaid webhook → invoice status flow
`routes/webhooks.js` receives Plaid `TRANSFER` webhooks and maps `payload.status` (`posted`/`failed`/`pending`) to invoice status (`paid`/`overdue`/`processing`) via `handleTransferWebhook`, then calls `invoiceService.updateInvoiceStatus(transfer_id, newStatus)`, which looks up the invoice by its unique `transfer_id` (not by invoice id) and updates it inside a `SELECT ... FOR UPDATE` transaction.

### Schema (`schema.sql`, applied manually — no migration tool)
`properties → units → leases → invoices → transactions`, plus `tenants` and `maintenance_tickets`. Notable constraints: `tenants.role` is `landlord|tenant`; `leases.status` is `active|expired|eviction` and carries `delinquency_notes`/`eviction_notes`/`housing_authority`/`payment_plan` (JSONB); `invoices.transfer_id` is unique and is the join key used by the webhook flow above; `transactions.category` maps to IRS Schedule E via `bookkeepingService.autoCategorizeTransaction`. There's no ORM — all queries are hand-written SQL via `pg`.

### Frontend is currently mock-data-first, real API wiring is partial
`App.tsx` holds all cross-tab state (active tab, `userRole`, and the invoices array) in local `useState` with hardcoded seed data — it does not fetch from the backend. Meanwhile `hooks/useInvoiceActions.ts` already implements the "real" data path (TanStack Query + axios calling `/api/invoices/:id/mark-paid` and `DELETE /api/invoices/:id`), but nothing currently uses this hook — `InvoiceList`/`App.tsx` call the local `handleMarkAsPaid`/`handleDeleteInvoice` state mutators instead. When connecting a feature to the real backend, prefer switching the component over to the existing `useInvoiceActions`-style hook rather than adding more local mock state. Other tabs (Dashboard, Properties, Tenants, Bookkeeping, Maintenance, Reports, Ledger) are entirely self-contained mock data with no backend calls at all.

### Role-gated tabs are UI-only
`userRole` (`landlord`/`tenant`) in `App.tsx` only toggles which sidebar tabs are rendered (Bookkeeping/Reports/Transactions are landlord-only). It is client-side state with no auth behind it — it does not correspond to any backend session/JWT, and the backend `rbac.js` middleware described above is unrelated/unused. Don't assume this toggle implies real access control.

### Frontend styling
Tailwind with a dark, glassmorphism aesthetic (`bg-slate-950`, `backdrop-blur`, `.glass-card` utility, `text-outfit` font class). Charts (e.g. Dashboard cashflow) are hand-rolled inline SVG, not a charting library.

### Deployment
`.github/workflows/deploy.yml` builds `frontend/` and deploys `frontend/dist` to GitHub Pages on every push to `main`. `vite.config.ts` sets `base: '/murlee-pms/'` to match the Pages subpath — keep that in sync if the repo/Pages path changes. The backend is not deployed by this workflow; there's no backend hosting/CI configured yet.
