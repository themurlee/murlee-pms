# Murlee PMS

A property-management system for independent landlords: rent collection, bookkeeping,
tenant CRM, and maintenance tracking in one place. Built for a small portfolio
(< 25 units), web-first and mobile-responsive.

**Live demo (frontend):** https://themurlee.github.io/murlee-pms/

> The hosted site is the React frontend. It talks to the Express API described below,
> which you run locally (or point at your own deployment).

## Features

- **Dashboard cockpit** — a "needs you today" action queue (overdue rent, emergencies,
  expiring leases, vacancies) ranked by money at risk, plus KPIs, cashflow trend,
  rent-collection and expenses widgets, recent payments, and a personal task list.
- **Properties & Units** — structured addresses, property types, per-unit rent roll,
  grouped under ownership **entities** (LLCs) for per-entity bookkeeping.
- **Tenants CRM** — contact info, documents, delinquency / eviction / payment-plan notes,
  housing-authority vouchers, and an event-note timeline.
- **Rent collection (invoices)** — invoice status is derived (overdue computed from due
  date), mark-as-paid posts a Rent Received transaction, late-fee automation.
- **Transactions ledger** — one source-agnostic ledger (manual entry + CSV, Plaid feed
  planned), real-estate vs personal class filter, IRS Schedule E categorization.
- **Maintenance** — work orders by property/unit/priority/category; inbound email
  auto-converts to tickets.
- **Communications** — every reminder, late notice, and message sent to tenants.
- **Reports** — Cash Flow / NOI, Schedule E, Rent Roll, Delinquency (in progress).

## Architecture

Two-package monorepo, no root `package.json`. Run npm scripts inside each package.

```
PMS/
├── backend/    Express + PostgreSQL (pg, no ORM; hand-written SQL)
├── frontend/   Vite + React + TypeScript, Tailwind (dark glassmorphism)
├── schema.sql  Postgres schema (applied manually; idempotent)
└── docs/       Design specs and implementation plans
```

- **Backend** — `routes/ → controllers/ → services/`. Controllers fall back to mock
  responses when `DATABASE_URL` is unset, so the API boots without Postgres. A daily
  scheduler drives invoice generation, late fees, and rent reminders.
- **Frontend** — TanStack Query + axios hooks against `/api`; the dev server proxies
  `/api → http://localhost:5001`.

## Getting started

### Prerequisites
- Node.js 18+
- PostgreSQL (optional — the API runs in mock mode without it)

### Environment
Create a single `.env` at the repo root (`PMS/.env`, **not** in `backend/`):

```
DATABASE_URL=postgres://user:pass@host:5432/murlee   # omit to run in mock mode
JWT_SECRET=change-me
PORT=5001
PLAID_CLIENT_ID=...        # optional (Plaid features)
PLAID_SECRET=...
PLAID_ENV=sandbox
```

### Backend
```bash
cd backend
npm install
npm run dev      # nodemon, http://localhost:5001
npm start        # node --env-file=../.env src/app.js
npm test         # jest
```

If using Postgres, apply the schema once: `psql "$DATABASE_URL" -f schema.sql`
(or `node backend/scripts/init-db.js`), and optionally `node backend/scripts/seed.js`.

### Frontend
```bash
cd frontend
npm install
npm run dev      # http://localhost:5173/murlee-pms/
npm run build    # tsc + vite build → frontend/dist
```

The app is served under the `/murlee-pms/` base path (matches the GitHub Pages subpath).

## Deployment

`.github/workflows/deploy.yml` builds `frontend/` and deploys `frontend/dist` to
GitHub Pages on every push to `main`. `vite.config.ts` sets `base: '/murlee-pms/'`
to match the Pages subpath — keep them in sync if the repo path changes. The backend
is not deployed by this workflow.

## Tech stack

Express · PostgreSQL (`pg`) · JWT auth · Plaid (planned) · Jest · React · TypeScript ·
Vite · TanStack Query · Tailwind CSS.
