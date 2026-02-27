# Amazon shipping notifications not sent automatically

## Problem
When an order ships (Lulu status changes to `SHIPPED`), we are not automatically sending shipping confirmation / tracking information back to Amazon. Customers on Amazon do not receive a "your order has shipped" notification with tracking details. **The feature worked for a day or two, then stopped.**

## Expected behavior
- When Lulu marks a print job as `SHIPPED` and provides tracking info:
  1. Our system updates the order with tracking number, carrier, and tracking URL.
  2. For Amazon orders (`platform = 'amazon'`), we call Orders API `confirmShipment` with carrier + tracking.
  3. Amazon marks the order shipped and sends its standard shipment notification to the buyer (Amazon email/message center flow).

## Root cause
The Amazon shipped notification code lives **inside the Lulu webhook handler** (`POST /api/webhooks/lulu/status`). It only runs when the webhook fires with `statusName === 'SHIPPED'`.

**The Lulu webhook is not reliably firing** (see issue #24). All recent status updates came through **manual refresh** (`/api/admin/orders/[orderId]/refresh-lulu-status`), which does NOT trigger Amazon notifications.

This explains "worked then stopped": the webhook briefly worked, sending notifications, then stopped delivering events. Manual refreshes kept `lulu_status` current but never triggered notifications.

## Implementation (already exists)
- **Trigger:** Lulu webhook handler when status is `SHIPPED` or `DELIVERED` and `platform !== 'd2c'`.
- **Code path:** `confirmAmazonShipment()` in `amazon-shipment.ts` (Orders API `shipmentConfirmation`).
- **Logging:** Attempts are written to `notification_logs` as `notification_type = 'amazon_confirm_shipment'`.

## Fixes applied
- **401 recovery:** On 401 from SP-API, the LWA access token cache is cleared so the next call gets a fresh token.
- **Persistent logging:** `notification_logs` records every Amazon message attempt with `status` and `error_message`.
- **Webhook shipped_at fix:** Webhook handler now sets `shipped_at` unconditionally on SHIPPED/DELIVERED (was gated on `lineItemStatuses`).

## Action items

### Depends on #24
This issue is **blocked by #24** — until the Lulu webhook reliably delivers SHIPPED events, notifications won't fire. See #24 action items.

### After #24 is resolved
- [ ] Check `notification_logs` for `amazon_confirm_shipment` rows: `GET /api/admin/webhook-diagnostics` returns these.
- [ ] If `status = 'failed'`, check `error_message` (token issue, rate limit, permissions, etc.).
- [ ] Ensure Amazon SP-API env vars are set: `AMZ_APP_CLIENT_ID`, `AMZ_APP_CLIENT_SECRET`, `AMZ_REFRESH_TOKEN`, `AMZ_SELLER_ID`, `AMZ_MARKETPLACE_ID`, `AMZ_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`.
- [ ] After webhook delivers a SHIPPED event, confirm a `notification_logs` row with `notification_type='amazon_confirm_shipment'` and `status='sent'`.

### Potential improvement
Consider adding notification capability to the manual refresh endpoint as a fallback, so even when the webhook fails, manual refresh can optionally send the Amazon shipped message.

## References
- Amazon messaging: `back-end/src/lib/notifications/amazon-message-center.ts`
- Lulu webhook handler: `back-end/src/app/api/webhooks/lulu/status/route.ts`
- Issue #24: `docs/_ongoing-issues-list/_needs-review/24-lulu-webhook-not-updating-order-status.md`
- Diagnostics: `GET https://admin.littleherolabs.com/api/admin/webhook-diagnostics`
