# Backlog

Deferred, known issues and follow-up work — not blockers for anything currently in progress, tracked here so they don't get lost. Add new items at the top of their section with the date found and enough context to act on later without re-deriving it.

---

## Audit / data-integrity

- **[2026-07-22] `addInvoiceItem`/`deleteInvoiceItem` audit logging isn't atomic with the write.** In `backend/src/services/invoiceService.js`, the `invoice_items` INSERT/DELETE and the corresponding `auditService.log(pool, ...)` call are two separate `pool.query` calls, not wrapped in a `client`-based transaction (unlike `updateInvoiceStatus`, `deleteInvoice`, and `markInvoicePaid` in the same file, which all correctly wrap the write + audit insert together). If the audit insert throws right after the item write succeeds (DB blip, dropped connection), the fee add/remove persists with no audit trail for it. Low practical risk (needs a failure exactly between the two calls), but violates the project's stated "every write is audited, no exceptions" principle. Fix: wrap both calls in a `pool.connect()`/`BEGIN`/`COMMIT`/`ROLLBACK` transaction, matching the pattern already used elsewhere in this file.

## Security / access control

- **[2026-07-22] `deleteInvoice` has no ownership check.** In `backend/src/controllers/invoiceController.js`, `DELETE FROM invoices WHERE id = $1` has no join back to `owner_id`, unlike `markPaid`, which gained an ownership check via `invoiceService.invoiceOwnedBy` this session. **Currently inert**: this app has no multi-landlord account model yet (`users.role` only allows `'landlord'`, single-landlord scale per project scope), so there's no other account to exploit this against. Becomes a real cross-account data-deletion vulnerability if the product ever moves to multiple landlords sharing one deployment. Fix: add the same `invoiceOwnedBy` check `markPaid` uses, before the delete.

## Test coverage gaps

- **[2026-07-22] `invoiceController.getInvoicesByProperty`'s real-DB-mode path is untested.** `backend/tests/invoiceController.test.js` only exercises the mock-mode branch (`!process.env.DATABASE_URL`); the real path (delegating to `invoiceService.getInvoicesForProperty`, mapping `null` → 404) has no test.
- **[2026-07-22] `deleteInvoice`'s ROLLBACK-on-mid-transaction-exception path is untested.** Only the success and not-found cases are covered; `markInvoicePaid` has the equivalent rollback test, `deleteInvoice` doesn't.

## Repo hygiene

- **[2026-07-22] (Resolved 2026-07-22, commit `21eb66e`)** ~~`backend/src/services/auditService.js`, `backend/src/utils/csv.js`, `backend/src/utils/dateBuckets.js`, and `backend/src/utils/invoiceState.js` were never committed to git despite already-merged code (`importService.js`) requiring them — a fresh clone of `main` would have crashed at `require()` time.~~ Fixed by committing all four files + their tests directly to `main`.
