# Amazon shipping notifications not sent automatically

## Problem
When an order ships (Lulu status changes to `SHIPPED`), we are not automatically sending shipping confirmation / tracking information back to Amazon. Customers on Amazon do not receive a "your order has shipped" notification with tracking details. **The feature worked for a day or two, then stopped.**

## Expected behavior
- When Lulu marks a print job as `SHIPPED` and provides tracking info:
  1. Our system updates the order with tracking number, carrier, and tracking URL.
  2. For Amazon orders (`platform = 'amazon'`), we automatically send a "your book has shipped" message via Amazon Messaging API (`confirmOrderDetails`).
  3. Amazon delivers that message to the customer (Message Center / email).

## Implementation (already exists)
- **Trigger:** Lulu webhook handler `POST /api/webhooks/lulu/status` when status is `SHIPPED` and `platform !== 'd2c'`.
- **Enable flag:** `AMAZON_SHIPPED_NOTIFICATIONS_ENABLED=true` or running in production (`VERCEL_ENV=production` or `NODE_ENV=production`).
- **Code:** `sendAmazonShippedMessage()` in `amazon-message-center.ts` → `confirmOrderDetails` with tracking text. Failures were only logged with `console.warn`, so no persistent record.

## Why it might have "worked then stopped"
1. **Lulu webhook not firing** (issue #24) — no SHIPPED events reach us, so we never call the API. Check `lulu_webhook_log` for recent SHIPPED rows.
2. **LWA access token** — We cache the token until 1 min before expiry. If Amazon invalidated the token (e.g. refresh token rotated, app revoked), we kept using the cached token and got 401. **Fix applied:** On 401 we now clear the token cache so the next request fetches a new token.
3. **Config cache** — `getAmazonMessagingConfig()` caches env-based config. If credentials were updated in Vercel without a redeploy, we might still use old values until the next cold start.
4. **Rate limiting / API errors** — 4xx/5xx from Amazon; errors were only in logs. **Fix applied:** Every shipped-message attempt (success or failure) is now written to `notification_logs` so you can see `status` and `error_message` per order.

## Fixes applied
- **401 recovery:** In `amazon-message-center.ts`, when the SP-API returns 401 we clear the LWA access token cache so the next call gets a fresh token.
- **Persistent logging:** Lulu webhook handler now inserts into `notification_logs` for each Amazon shipped message attempt (`notification_type = 'amazon_message'`, `status` = sent/failed, `error_message` on failure). Query: `SELECT * FROM notification_logs WHERE notification_type = 'amazon_message' ORDER BY created_at DESC LIMIT 50` (and correlate with order_id to see which are shipped messages).

## Action items
- [ ] Confirm Lulu webhook is delivering SHIPPED (see #24; check `lulu_webhook_log`).
- [ ] Check `notification_logs` for recent `amazon_message` rows: if `status = 'failed'`, use `error_message` to fix (e.g. refresh token, permissions).
- [ ] Ensure `AMAZON_SHIPPED_NOTIFICATIONS_ENABLED=true` (or production env) and Amazon Messaging env vars are set (`AMZ_APP_CLIENT_ID`, `AMZ_APP_CLIENT_SECRET`, `AMZ_REFRESH_TOKEN`, `AMZ_SELLER_ID`, `AMZ_MARKETPLACE_ID`, `AMZ_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`).
- [ ] After deploy, trigger a SHIPPED webhook (or use manual refresh + a separate test) and confirm a new `notification_logs` row with `status = 'sent'`.

## References
- Amazon messaging docs: `docs/amazon/AMAZON_MESSAGING_API_SETUP.md`
- Amazon message center: `back-end/src/lib/notifications/amazon-message-center.ts`
- Lulu webhook: `docs/_ongoing-issues-list/24-lulu-webhook-not-updating-order-status.md`
- Archived: `docs/_ongoing-issues-list/_completed/07-audit-fix-amazon-messaging.md`
