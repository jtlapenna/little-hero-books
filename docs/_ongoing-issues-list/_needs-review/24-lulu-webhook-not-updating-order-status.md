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

## Code audit (done)
- **Handler exists:** `back-end/src/app/api/webhooks/lulu/status/route.ts` — looks up by `lulu_job_id`, updates `lulu_status`, tracking fields, `shipped_at`, `print_fulfillment_finished_at` on SHIPPED; always returns 200; sends D2C/Amazon shipped notifications when SHIPPED.
- **Subscribe:** `POST /api/admin/lulu-webhook-subscribe` — registers `PRINT_JOB_STATUS_CHANGED` with Lulu; webhook URL from `LULU_WEBHOOK_URL` or `BACKEND_URL` + `/api/webhooks/lulu/status`.
- **List:** `GET /api/admin/lulu-webhook-list` — lists Lulu webhook subscriptions (use to verify our URL is registered).
- **Payload:** Handler now unwraps nested payloads (`data`, `body`, `event`, `payload`) and accepts `status` as well as `name` for status.
- **Webhook path fixes (to see if Lulu is calling):** (1) **Defensive payload** — unwrap nested payload so if Lulu sends `{ data: { print_job_id, name, ... } }` we still process it. (2) **Audit log** — every POST to the webhook writes one row to `lulu_webhook_log` (received_at, print_job_id, status_name, order_found, order_id, updated, error_message). Run `database/migration-lulu-webhook-log.sql` once, then query `SELECT * FROM lulu_webhook_log ORDER BY received_at DESC LIMIT 50` to see if requests are reaching the backend without relying on Vercel logs.

## Possible causes
1. Lulu webhook subscription may not be registered (one-time API call required per environment).
2. Webhook handler route may not be deployed or may be returning errors silently.
3. Webhook payload format may have changed or handler may not be parsing it correctly (e.g. nested under `data`/`event`).
4. Lulu cannot reach our URL (firewall, wrong BACKEND_URL in subscribe).

## Investigation steps
- [x] **List webhooks:** `GET https://admin.littleherolabs.com/api/admin/lulu-webhook-list` — confirmed one active subscription to `https://admin.littleherolabs.com/api/webhooks/lulu/status` (no need to re-subscribe).
- [ ] **Check backend logs** for `[LULU WEBHOOK]` — if no requests, Lulu is not calling us (re-register or check URL).
- [ ] **Re-register if needed:** `POST https://admin.littleherolabs.com/api/admin/lulu-webhook-subscribe` (no body). Ensure `BACKEND_URL` or `LULU_WEBHOOK_URL` in that env is the correct public URL.
- [ ] If requests exist but order not found: confirm `lulu_job_id` on the order matches what Lulu sends (handler logs `printJobIdStr`).
- [ ] **Workaround:** Use "Refresh Lulu status" per order; it now sets `shipped_at` and `print_fulfillment_finished_at` when status is SHIPPED.

## Vercel logs (seeing webhook hits)
- Use **Runtime / Function logs**, not build logs: Project → Logs (or Deployments → deployment → Logs), then Runtime view.
- CLI: `vercel logs` or `vercel logs --follow`; logs kept ~3 days.
- If Lulu never POSTs, there will be no `[LULU WEBHOOK]` lines. To confirm logging: run `back-end/scripts/test-lulu-webhook-production.sh` or `curl -X POST https://admin.littleherolabs.com/api/webhooks/lulu/status -H "Content-Type: application/json" -d '{"name":"IN_PRODUCTION","print_job_id":99999}'` and check that a log entry appears.

## References
- Webhook setup docs: `docs/_ongoing-issues-list/_archive/lulu-webhook-and-w4-shipping-concise.md`
- Subscribe: `POST https://admin.littleherolabs.com/api/admin/lulu-webhook-subscribe`
- List: `GET https://admin.littleherolabs.com/api/admin/lulu-webhook-list`
- Webhook handler: `back-end/src/app/api/webhooks/lulu/status/route.ts`
- Migration for timestamps: `database/migration-print-fulfillment-timestamps.sql`
