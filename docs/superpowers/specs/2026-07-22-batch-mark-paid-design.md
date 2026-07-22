# Batch Mark-Paid — Design

**Date:** 2026-07-22
**Status:** Approved design — ready for implementation planning

## Problem

`InvoiceList.tsx` (the Rent Collection Ledger) only supports marking one invoice
paid at a time, via a per-row "Mark Paid" button that calls
`POST /api/invoices/:id/mark-paid`. A landlord managing many units has to click
through every invoice individually at the start of each collection cycle. This is
Phase 5's "batch operations" item from the roadmap docs — the smallest-scoped,
clearest-spec item in the remaining backlog, picked as the next feature after
Phase 1 (data ownership) and the CSV import expansion (this session).

## Goal

- Multi-select unpaid/overdue invoices in the Rent Collection Ledger and mark
  them all paid in one action, with per-invoice failure isolation (one bad row
  doesn't block the rest).
- Same side effects as today's single mark-paid, applied per invoice: audit log,
  ledger transaction insert, tenant confirmation email.

## Scope decisions (confirmed with the landlord)

- **Batch mark-paid only, not batch delete.** Delete is destructive and lower
  priority; can be added later reusing the same selection UI if wanted.
- **Per-invoice independent processing, not all-or-nothing.** Each invoice is its
  own DB transaction (matching today's single mark-paid). One invoice failing
  (already paid, not found, not owned) is reported as an error for that row; the
  rest of the batch still succeeds. Mirrors the per-row resilience pattern the
  CSV import feature built this session.
- **Confirmation emails unchanged: one per tenant per invoice marked paid**, same
  fire-and-forget `sendNotice` call as today — not suppressed for batch actions.
- **Ownership check added to the batch endpoint**, and — as a deliberate side
  effect of avoiding duplicated transaction logic — **also retrofitted onto the
  existing single mark-paid endpoint**, which currently has none. See
  Architecture below.
- **Selectable rows:** only `status !== 'paid'` invoices, scoped to whatever
  lease tab (active/expired/archived) is currently visible. "Select all" only
  selects within that filtered, eligible set.

## Architecture

Today, all "mark one invoice paid" logic — row lock, status update, audit log,
ledger transaction insert — lives inline inside `invoiceController.js`'s
`markPaid` function; there's no reusable service function for it, and it does
not check invoice ownership (`WHERE id = $1`, no owner scoping).

This introduces `invoiceService.markInvoicePaid(pool, ownerId, invoiceId, context)`:
does the ownership check (`invoices → leases → units → properties.owner_id`),
then the existing transactional logic (`SELECT ... FOR UPDATE`, reject if
already paid, `UPDATE status='paid', paid_at=NOW()`, audit log, ledger
transaction insert via `transactionsService.insertRentReceived`), all in one DB
transaction. Returns a discriminated result, not a thrown error for expected
failure cases:
- `{ ok: true, invoice, emailCtx }` on success (`emailCtx` carries the
  tenant/amount fields the caller needs to send the confirmation email, without
  a second query)
- `{ ok: false, error: 'not_found' | 'not_owned' | 'already_paid' }` on failure

`invoiceController.markPaid` (existing single route) becomes a thin wrapper:
calls the service function, sends the confirmation email on success, maps the
result to the right HTTP status (404 for `not_found`/`not_owned`, 409 for
`already_paid`). This is the one deliberate behavior change to existing code:
the single endpoint gains the ownership check as a side effect of removing
duplication, not as an independent scope item.

`invoiceController.batchMarkPaid` is new: takes `{ ids: string[] }`, loops
calling `markInvoicePaid` per id, collects results, sends one confirmation email
per successful invoice, invalidates the dashboard cache once at the end (not
per-invoice, since that cache invalidation is not per-row expensive to skip
inside the loop).

## API

`POST /api/invoices/batch/mark-paid` (mounted alongside the existing invoice
routes, behind `requireAuth`, following the existing `POST /:id/mark-paid` verb
convention rather than PATCH).

**Route ordering matters:** `routes/invoices.js` already has
`router.post('/:id/mark-paid', ...)`. Express matches routes in registration
order, and `/:id/mark-paid` structurally matches `/batch/mark-paid` too (two
path segments, second one literal `mark-paid`) — with `:id` capturing the
literal string `"batch"`. `router.post('/batch/mark-paid', ...)` must be
registered **before** `router.post('/:id/mark-paid', ...)` in the route file,
or the batch route is unreachable (every request to it would instead hit the
single-invoice handler with `id="batch"`, returning 404).

**Request:** `{ "ids": ["<uuid>", "<uuid>", ...] }`. Empty or missing `ids` → 400.

**Response:** `{ success_count, error_count, results: [{ id, ok, error? }] }` —
mirrors the summary-object shape already established by this session's CSV
import feature (`batch_id`/`success_count`/`error_count`/`errors` convention),
for consistency across the codebase's batch-style endpoints. `error` is one of
`'not_found'`, `'not_owned'`, `'already_paid'`, mapped to a human-readable
message in the response.

## Frontend

`InvoiceList.tsx`:
- New `selectedIds: Set<string>` state.
- A checkbox column, rendered only on rows where `inv.status !== 'paid'`
  (matching the existing single-row "Mark Paid" button's visibility condition).
- A "select all" checkbox in the table header that selects/deselects every
  currently-visible, eligible row (`visibleInvoices` already exists as a memo
  filtered by the active lease tab — the batch selection reuses it, so "select
  all" never reaches into a hidden tab).
- When `selectedIds.size > 0`, a floating action bar appears: "`N` selected" +
  "Mark Paid" button + "Cancel" (clears selection). Clicking "Mark Paid" shows a
  confirmation step (count + total `$` amount of the selected invoices) before
  firing.
- On confirm: calls the new `batchMarkAsPaid(ids)` mutation. On settle,
  invalidate the `['invoices']` query (same as every existing mutation in this
  hook) and clear `selectedIds`. Reuses the existing toast pattern to report
  `"X marked paid"` (all succeeded) or `"X marked paid, Y failed"` (partial
  failure) — the UI does not block on partial failure; whatever succeeded stays
  succeeded.

`useInvoiceActions.ts`: new `batchMarkAsPaidMutation`, `mutationFn` posts
`{ ids }` to `/invoices/batch/mark-paid`, `onSuccess` invalidates
`['invoices']` — same shape as the existing `markAsPaidMutation`/
`deleteInvoiceMutation` in this file.

## Testing

- Backend: fake-pool unit tests (matching this session's `importService.test.js`
  convention) for `invoiceService.markInvoicePaid` — ownership rejection,
  already-paid rejection, not-found, and the success path (verifying the audit
  log entry, the ledger transaction insert, and the transaction commits/rolls
  back correctly) — and for `invoiceController.batchMarkPaid` — aggregates
  correctly across a mixed batch, one bad id doesn't abort the rest, response
  shape matches spec.
- Frontend: no test runner is configured in this repo (per `CLAUDE.md`). Verify
  manually in the dev server: multi-select interaction, "select all" respecting
  the active lease tab, confirmation step, and a real batch mark-paid round trip
  against the dev backend.

## Out of scope

- Batch delete (may follow later, reusing the same selection UI).
- Any other entity type's batch actions (maintenance tickets, leases, etc.) —
  invoices only for this pass.
- Suppressing or batching confirmation emails (kept as one-per-tenant, per the
  scope decision above).
