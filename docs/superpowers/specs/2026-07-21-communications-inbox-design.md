# Communications — Two-way Inbox Design

**Date:** 2026-07-21
**Status:** Approved design — ready for implementation planning

## Problem

The current `communications` tab (`frontend/src/components/Communications/Communications.tsx`
+ backend `notices` table/route) is a one-way outbound log: the landlord sends an
adhoc email or the system logs an automated notice (rent reminder, late notice,
maintenance update, payment confirmation), and it shows up as a flat table row.
There is no concept of a tenant reply, no threading, and no inbox-style UI.

This reverses an earlier locked-in decision (see project memory
`project_scale_scope.md`) that comms would be "automated outbound notices only, no
two-way in-app chat." The landlord now wants real two-way email: tenants can reply,
replies land in the app as threaded conversations, and the UI should look like a
modern inbox (thread list + conversation view) with a collapsible left rail, similar
to the reference screenshot provided.

## Goal

- Tenants can reply to landlord emails; replies appear in the app, threaded under
  the right conversation.
- The landlord can reply from within the app; replies send as real email.
- A new inbox UI: collapsible left rail (My Inbox / All Messages / Communications
  Log) + thread list + conversation view, replacing the flat table as the primary
  surface. The existing flat notices table is kept, relabeled "Communications Log."

## Scope decisions (confirmed with the landlord)

- **Inbound transport: Gmail IMAP polling.** Reuses the Gmail account already
  planned for the queued outbound SMTP work (`GMAIL_USER` + `GMAIL_APP_PASSWORD`).
  No new provider account, no domain verification — but this means inbound delivery
  is **blocked until that queued setup (Google 2-Step Verification + App Password)
  is complete**, and it means the landlord's personal Gmail inbox is the channel
  (mixed with personal mail, polling latency instead of instant webhook delivery).
- **Left rail scope: inbox-focused only.** My Inbox, All Messages, Communications
  Log. Explicitly **not** building: an Unassigned queue (implies a multi-agent
  support desk), Announcements (broadcast messaging), or Signature
  Requests/Templates (e-signature workflow) — all present in the reference
  screenshot but out of scope for a single-landlord tool.
- **No AI compose assist** ("Help me write" in the reference screenshot) — not
  requested, treated as out of scope.
- **`notices` table is untouched.** It keeps serving automated one-way system
  notices (rent reminders, late notices, maintenance updates, payment
  confirmations) and backs the "Communications Log" view under its current name/
  shape. Two-way conversation gets its own new tables so we don't bend a
  write-once log with a fixed `type` CHECK constraint into a thread model.
- **Unmatched senders still get a thread.** If an inbound email's sender doesn't
  match any `tenants.email`, the thread is created anyway with `tenant_id = NULL`
  and the raw sender address shown as the display name — no separate queue for
  this case, per the trimmed sidebar scope above.

## Data model

Two new tables, additive to `schema.sql`, `notices` unchanged:

```sql
CREATE TABLE IF NOT EXISTS message_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
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
```

`gmail_message_id` stores the outbound `Message-ID` header when the landlord (or
system) sends a message, so the inbound poller can match a reply's
`In-Reply-To`/`References` header back to the right thread.

## Inbound pipeline

- A node-cron job (matching the existing in-process scheduler pattern used for
  invoice/late-fee automation) polls the Gmail inbox via IMAP every ~60s using
  `GMAIL_USER`/`GMAIL_APP_PASSWORD`.
- For each new message since the last poll:
  1. Try to match `In-Reply-To`/`References` against a stored `gmail_message_id` →
     append to that thread.
  2. Else match sender address → `tenants.email` → most recent open thread for
     that tenant, or start a new thread if none exists.
  3. Else create a new thread with `tenant_id = NULL`, sender's raw address as the
     display name.
- Inserts a `messages` row with `direction = 'inbound'`, updates
  `message_threads.last_message_preview`, `last_message_at`, sets `unread = true`.
- IMAP connection/auth failures are logged and retried on the next poll interval —
  never crash the app (consistent with the mock-pool fallback pattern already used
  elsewhere in the backend).
- **This pipeline cannot be exercised end-to-end until the queued Gmail App
  Password setup is complete.** Until then, development/testing uses a manual
  "simulate inbound reply" action (same pattern as the existing maintenance
  inbound-email simulator).

## Outbound

`POST /api/threads/:id/messages` sends via the existing `emailService.deliver()`
(once its Gmail transport branch lands per the queued task; falls back to
Resend/log-only per that service's existing transport selection), stores the
`Message-ID` it sent with, and logs a `messages` row with `direction = 'outbound'`.

## REST surface

- `GET /api/threads` — list threads for the landlord, newest first, with unread
  flag and last-message preview (backs both "My Inbox" filtered to `unread=true`
  and "All Messages" unfiltered).
- `GET /api/threads/:id/messages` — full message history for a thread.
- `POST /api/threads` — landlord starts a new thread (`tenant_id` + first message
  body + subject).
- `POST /api/threads/:id/messages` — reply within an existing thread.
- `PATCH /api/threads/:id` — mark a thread read (`unread = false`).

Follows the existing route → controller → service layering used by
`invoices`/`notices`, including the dual mock-data pattern (mock in-memory arrays
when `DATABASE_URL` is unset, real queries otherwise).

## Frontend

- New `CommunicationsSidebar` component: a nested left rail rendered *inside* the
  Communications tab's content area (distinct from the app's persistent main
  sidebar in `App.tsx`, which is unaffected). Collapsible — expanded shows labeled
  nav items, collapsed shows icon-only. Three items: **My Inbox** (unread
  threads), **All Messages** (all threads), **Communications Log** (today's
  existing flat notices table, relabeled, otherwise untouched).
- `ThreadList`: search box, newest-first list of threads, unread indicator,
  tenant name + last-message preview + relative timestamp.
- `ThreadView`: message history rendered as chat bubbles (outbound right-aligned/
  indigo, inbound left-aligned/neutral), a compose box + Send button at the
  bottom for replying within the open thread.
- New thread creation (landlord messaging a tenant who has no existing thread)
  reuses the current "+ Send Email" modal pattern from `Communications.tsx`,
  adapted to call `POST /api/threads` instead of `POST /api/notices`.

## Testing

- Backend unit tests for the tenant-matching and reply-threading logic (mirrors
  `backend/tests/getInvoiceState.test.js` — plain unit tests against exported pure
  functions, no DB needed), covering: match by `In-Reply-To`, match by sender
  email with existing thread, match by sender email with no existing thread
  (creates new), no match at all (creates thread with `tenant_id = NULL`).
- No frontend test runner exists yet (per `CLAUDE.md`) — frontend changes are
  verified manually in the dev server.

## Out of scope (explicitly deferred, not forgotten)

- Unassigned queue, Announcements, Signature Requests/Templates.
- AI-assisted compose ("Help me write").
- Real-time delivery (relies on ~60s poll interval, not push).
- Attachments.
