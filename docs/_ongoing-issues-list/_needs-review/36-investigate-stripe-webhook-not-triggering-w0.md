# 36 - Investigate: Stripe webhook sets pending_w0 but W0 never triggered

## Status
🟡 Mitigated (throw on failure + resync endpoint added)

## Changes made

1. **Stripe webhook now throws** when W0 trigger fails (or N8N_W0_WEBHOOK_URL not set) → returns 500, visible in Stripe webhook log.
2. **Retry support**: when `pending_w0` with `next_workflow` null, webhook still triggers W0 on Stripe retry.
3. **Admin resync endpoint**: `POST /api/admin/resync-d2c-payment` with `{ root_order_id }` simulates the Stripe webhook (update + trigger W0).

## Problem

D2C orders (e.g. 3-book order placed March 1st) are in `pending_w0` with `next_workflow` NULL. The Stripe webhook clearly ran (orders were updated to pending_w0), but W0 was never triggered—no executions in n8n W0 for these orders.

## Flow to trace

1. **Checkout** creates orders, redirects to Stripe with `metadata: { root_order_id, book_count }`
2. **User pays** → Stripe sends `checkout.session.completed` to our webhook
3. **Stripe webhook** (`POST /api/webhooks/stripe`):
   - Gets `root_order_id` from `session.metadata`
   - Queries Supabase: `orders` where `orderId` like `{root_order_id}-item-%`
   - For each order: updates to `pending_w0`, then calls `triggerW0(payload)`
4. **triggerW0** POSTs to `N8N_W0_WEBHOOK_URL`

## Failure points (why W0 might not run)

| # | Failure point | Symptom | How to verify |
|---|---------------|---------|---------------|
| 1 | **Siblings query returns 0** | Webhook returns early, orders stay `pending_payment` | Not our case—orders ARE pending_w0 |
| 2 | **N8N_W0_WEBHOOK_URL not set** | `triggerW0` returns `{ ok: false }`, logs "N8N_W0_WEBHOOK_URL not configured" | Check Vercel env vars for webhook host |
| 3 | **triggerW0 fetch fails** | Network error, timeout, wrong URL | Backend logs: `[Webhook Stripe] W0 trigger failed for X: <error>` |
| 4 | **n8n returns non-2xx** | `triggerW0` gets res.ok=false | Same log; check n8n workflow status (paused? error in first node?) |
| 5 | **Stripe webhook never received** | Orders stay `pending_payment` | Not our case—orders are pending_w0 |
| 6 | **Idempotency cached a partial run** | First run failed after DB update but before triggerW0; retries return cached 200 | Unlikely—handler is atomic; if we updated, we would have called triggerW0 |
| 7 | **Wrong Stripe webhook / mode** | Live vs test mode mismatch; webhook receives different events | Stripe Dashboard: which endpoint, which events, test vs live |

## Diagnostic steps

### 1. Check backend logs (Vercel / host)

Search for:
```
[Webhook Stripe] W0 trigger failed for
[Webhook Stripe] Multi-book: found N orders
[Webhook Stripe] W0 triggered for
```

- If "W0 trigger failed" appears → capture the error message (URL not configured, HTTP status, etc.)
- If "W0 triggered" appears but n8n shows nothing → n8n received but didn't execute (workflow disabled, first node error, etc.)
- If neither appears → webhook may not have run for this payment, or logging is missing

### 2. Verify N8N_W0_WEBHOOK_URL

- Vercel → Project → Settings → Environment Variables
- Ensure `N8N_W0_WEBHOOK_URL` is set for Production (and Preview if testing)
- Value should be the n8n webhook URL (e.g. `https://xxx.app.n8n.cloud/webhook/order-intake`)

### 3. Check Stripe webhook configuration

- Stripe Dashboard → Developers → Webhooks
- Find the endpoint for your backend (e.g. `https://admin.littleherolabs.com/api/webhooks/stripe`)
- Verify `checkout.session.completed` is enabled
- Check "Recent events" for the payment time—did the event succeed (200) or fail?
- Verify test vs live mode matches where the payment occurred

### 4. Supabase siblings query

The webhook uses:
```js
.from('orders')
.select('orderId')
.like('orderId', `${rootOrderId}-item-%`)
```

If the DB column is `order_id` (snake_case) not `orderId`, the query might return 0 rows. Check:

```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'orders' AND column_name IN ('orderId', 'order_id');
```

If only `order_id` exists, the webhook needs to use `order_id` in the filter.

### 5. Manual trigger to unblock

To process the stuck orders now:

```bash
node scripts/trigger-w0-for-d2c-group.js <root_order_id>
```

## Simulate Stripe webhook (test after fixing URL)

After updating `N8N_W0_WEBHOOK_URL` in Vercel, simulate the Stripe webhook process:

```bash
curl -X POST "https://admin.littleherolabs.com/api/admin/resync-d2c-payment" \
  -H "Authorization: Bearer YOUR_BACKEND_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"root_order_id": "YOUR-ROOT-UUID"}'
```

Or use the script:
```bash
node scripts/trigger-w0-for-d2c-group.js <root_order_id>
```

## Code locations

- Stripe webhook: `back-end/src/app/api/webhooks/stripe/route.ts`
- Admin resync: `back-end/src/app/api/admin/resync-d2c-payment/route.ts`
- triggerW0: `back-end/src/lib/sibling-order-helpers.ts`
