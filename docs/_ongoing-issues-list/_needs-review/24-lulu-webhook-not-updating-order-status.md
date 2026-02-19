# Lulu webhook not updating order status

## Problem
The Lulu webhook is not automatically updating print status or shipping status in the back-end. When Lulu changes a print job status (e.g. `IN_PRODUCTION`, `SHIPPED`), those updates are not being reflected on the `orders` table in Supabase.

## Expected behavior
- Lulu sends a POST to our webhook URL when print job status changes.
- Our webhook handler updates the `orders` row with:
  - `lulu_status` (e.g. `SHIPPED`)
  - `shipped_at` / `tracking_number` / `tracking_url` / `carrier` when shipped
  - `print_fulfillment_finished_at` when shipped
- The admin dashboard reflects the current Lulu status without manual intervention.

## Current state (Feb 19 2026)
- **Webhook subscription:** Active, correct URL, correct topic (`PRINT_JOB_STATUS_CHANGED`). Verified via `GET /api/admin/lulu-webhook-list`.
- **Endpoint reachable:** Test POST returns 200.
- **`lulu_status` IS updated** on all 10 orders with Lulu jobs — but via **manual refresh**, not the webhook. Clue: all 10 have `shipped_at=null`.
- **The webhook itself may not be firing** — we need to check `lulu_webhook_log` after deploy (table may not exist yet; run migration first).

## Root cause (two bugs found)

### Bug 1: `shipped_at` gated on `lineItemStatuses`
The webhook handler only set `shipped_at` when `lineItemStatuses.length > 0`. If Lulu sends a SHIPPED event without line item tracking details, `shipped_at` stays null. This meant the lifecycle cron couldn't pick these orders up.

**Fix:** `shipped_at` and `print_fulfillment_finished_at` are now set unconditionally when status is `SHIPPED` or `DELIVERED`. Tracking fields still conditional on `lineItemStatuses`.

### Bug 2: Unknown whether Lulu is actually calling us
The `lulu_webhook_log` audit table may not have been created (migration not run). Without it, we have no persistent evidence of webhook delivery.

## Code audit (done)
- **Handler:** `back-end/src/app/api/webhooks/lulu/status/route.ts` — unwraps nested payloads, writes to `lulu_webhook_log`, updates order, sends notifications on SHIPPED.
- **Subscribe:** `POST /api/admin/lulu-webhook-subscribe` — registers `PRINT_JOB_STATUS_CHANGED`.
- **List:** `GET /api/admin/lulu-webhook-list` — verified subscription active.
- **Diagnostics:** `GET /api/admin/webhook-diagnostics` — returns recent `lulu_webhook_log` rows, `notification_logs`, and stuck orders (shipped_at=null).
- **Backfill:** `POST /api/admin/backfill-shipped-at` — one-time fix for existing orders with `shipped_at=null`.

## Action items (after deploy)

### Immediate
- [ ] **Run migration:** Execute `database/migration-lulu-webhook-log.sql` in Supabase SQL editor to create the audit table.
- [ ] **Backfill stuck orders:** `POST https://admin.littleherolabs.com/api/admin/backfill-shipped-at` — sets `shipped_at` for 5 SHIPPED orders with null values.
- [ ] **Check diagnostics:** `GET https://admin.littleherolabs.com/api/admin/webhook-diagnostics` — verify the audit table exists and check for any webhook log rows.

### Verify webhook delivery
- [ ] **Send test:** `curl -X POST https://admin.littleherolabs.com/api/webhooks/lulu/status -H "Content-Type: application/json" -d '{"name":"TEST_PING","print_job_id":"test-99999"}'`
- [ ] **Check audit log:** Should see a row in `lulu_webhook_log` with `order_found=false, error_message='Order not found'`.
- [ ] **Wait for a real Lulu event:** Submit a new print job and monitor `lulu_webhook_log` for incoming SHIPPED/status events.
- [ ] If no events after 24h, consider: re-subscribing (`POST /api/admin/lulu-webhook-subscribe`), checking Lulu support for delivery logs, or testing with a different webhook URL (e.g. webhook.site) to isolate the issue.

## Related issues
- **#25** — Amazon shipping notifications depend on this webhook firing.
- **#26** — Delivered orders stuck in active list — caused by missing `shipped_at`.

## References
- Webhook handler: `back-end/src/app/api/webhooks/lulu/status/route.ts`
- Subscribe: `POST https://admin.littleherolabs.com/api/admin/lulu-webhook-subscribe`
- List: `GET https://admin.littleherolabs.com/api/admin/lulu-webhook-list`
- Diagnostics: `GET https://admin.littleherolabs.com/api/admin/webhook-diagnostics`
- Migration: `database/migration-lulu-webhook-log.sql`
- Backfill: `POST https://admin.littleherolabs.com/api/admin/backfill-shipped-at`
