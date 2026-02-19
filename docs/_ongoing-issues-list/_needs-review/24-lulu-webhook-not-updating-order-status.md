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
- **Lulu IS calling us:** `lulu_webhook_log` confirms real SHIPPED/DELIVERED events for multiple print jobs.
- **Updates were failing silently** due to the root cause below.

## Root cause (definitive — confirmed via audit log + Lulu OpenAPI spec)

### Bug 1 (CRITICAL): Status field parsed as object instead of string
Lulu's webhook sends the **full print job detail** (same as `GET /print-jobs/{id}`), where `status` is an **object**:
```json
{ "name": "SHIPPED", "changed": "2026-02-12T...", "message": "All line-items were shipped" }
```
Our handler did `statusName = payload.name ?? payload.status`, but the print job has no top-level `name` — so it fell through to `payload.status`, assigning the **entire object** as `statusName`. This caused three cascading failures:
1. `lulu_status = statusName` tried to store a ~90-char JSON string into varchar(50) → DB error "value too long"
2. `statusName === 'SHIPPED'` always returned `false` (object !== string) → `shipped_at` never set, notifications never fired
3. The audit log stored the raw object as `status_name`, masking the issue with misleading log entries

**Evidence:** `lulu_webhook_log` row for print_job_id 2738265 shows `status_name: {"name":"SHIPPED","changed":"...","message":"..."}`, `order_found: true`, `updated: false`, `error_message: "value too long for type character varying(50)"`.

**Fix:** Extract the string from the object: `statusRaw.name` when `statusRaw` is an object, else use it directly as a string.

### Bug 2: Tracking info extracted from wrong location
Lulu's webhook sends `line_items` (not `line_item_statuses`), with tracking data nested under `item.status.messages` (not directly on the item). Our handler looked for `firstItem.tracking_id` instead of `firstItem.status.messages.tracking_id`.

**Fix:** Check `messages` and `status.messages` for tracking fields; also fall back to `line_items` for the array.

### Bug 3 (previously fixed): `shipped_at` gated on `lineItemStatuses`
The webhook handler only set `shipped_at` when `lineItemStatuses.length > 0`. Already fixed — `shipped_at` now set unconditionally for SHIPPED/DELIVERED.

## Code audit (done)
- **Handler:** `back-end/src/app/api/webhooks/lulu/status/route.ts` — unwraps nested payloads, writes to `lulu_webhook_log`, updates order, sends notifications on SHIPPED.
- **Subscribe:** `POST /api/admin/lulu-webhook-subscribe` — registers `PRINT_JOB_STATUS_CHANGED`.
- **List:** `GET /api/admin/lulu-webhook-list` — verified subscription active.
- **Diagnostics:** `GET /api/admin/webhook-diagnostics` — returns recent `lulu_webhook_log` rows, `notification_logs`, and stuck orders (shipped_at=null).
- **Backfill:** `POST /api/admin/backfill-shipped-at` — one-time fix for existing orders with `shipped_at=null`.

## Action items (after deploy)

### Immediate
- [x] **Migration:** `lulu_webhook_log` table created.
- [x] **Backfill stuck orders:** `POST /api/admin/backfill-shipped-at` — fixed 2 orders with null `shipped_at`.
- [x] **Diagnostics confirmed:** Lulu IS calling us; the updates were failing due to Bug 1.
- [ ] **Deploy fix** — commit and push the status extraction + tracking extraction fixes.

### Verify after deploy
- [ ] **Send test with real Lulu format:** `curl -X POST .../api/webhooks/lulu/status -H "Content-Type: application/json" -d '{"topic":"PRINT_JOB_STATUS_CHANGED","data":{"id":99998,"status":{"name":"TEST_PING","changed":"2026-01-01T00:00:00Z","message":"test"}}}'`
- [ ] **Check audit log:** `status_name` should be `TEST_PING` (string), not a JSON object.
- [ ] **Wait for a real Lulu SHIPPED event** and verify `lulu_status`, `shipped_at`, `tracking_number` all update correctly.
- [ ] **Check notification_logs** for successful Amazon shipped message after the next SHIPPED event.

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
