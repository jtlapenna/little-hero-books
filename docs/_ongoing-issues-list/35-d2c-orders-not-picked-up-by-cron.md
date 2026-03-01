# 35 - D2C orders not picked up by cron

## Status
🟡 In Progress

## Problem

D2C orders appear in the backend after checkout, but the cron job does nothing.

## Root cause: D2C flow vs. router cron

The **router cron** (`GET /api/cron/router`) only fetches orders where:

- `execution_status = 'ready_for_processing'`
- `next_workflow IS NOT NULL`
- `started_at IS NULL`
- `current_workflow IS NULL`

D2C orders start as `pending_payment` and must go through **W0 (order intake)** before they become `ready_for_processing`. The flow is:

1. **Checkout** → creates orders with `execution_status: pending_payment`
2. **User pays on Stripe** → Stripe sends `checkout.session.completed` to our webhook
3. **Stripe webhook** → updates orders to `pending_w0`, triggers W0 for each book
4. **W0 (n8n)** → runs order intake; builds manifest, uploads to R2, **Supabase PATCH** sets `ready_for_processing`, `next_workflow: '2A'`, `one_manifest_url`
5. **Router cron** → picks up `ready_for_processing` orders and calls W1.1

**Common stuck state:** `pending_w0` with `next_workflow: NULL` — Stripe webhook ran and triggered W0, but the W0 n8n workflow never successfully updated Supabase (e.g. PATCH filter didn't match, W0 failed before Supabase step). The router cron now **re-triggers W0** for such orders on each run (see step 3a in the router).

## Diagnostic steps

### 1. Check order status in Supabase

```sql
-- Find recent D2C orders
SELECT 
  "orderId",
  root_order_id,
  platform,
  execution_status,
  status,
  next_workflow,
  one_manifest_url,
  created_at
FROM orders
WHERE platform = 'd2c'
ORDER BY created_at DESC
LIMIT 20;
```

For multi-book orders, `root_order_id` is the UUID shared by all books (e.g. `a1b2c3d4-e5f6-7890-abcd-ef1234567890`). Each book has `orderId` like `{root}-item-1`, `{root}-item-2`, etc.

Interpretation:

| execution_status    | Meaning                                                      |
|---------------------|--------------------------------------------------------------|
| `pending_payment`   | Stripe webhook never ran. Need to manually update + trigger W0. |
| `pending_w0`        | Stripe webhook ran, but W0 hasn't completed. Trigger W0 if stuck. |
| `ready_for_processing` | W0 completed. Router should pick up on next cron run.      |

### 2. Verify Stripe webhook

- Stripe Dashboard → Developers → Webhooks → your endpoint
- Check that `checkout.session.completed` is enabled
- Verify endpoint URL (e.g. `https://admin.littleherolabs.com/api/webhooks/stripe`)
- Check recent events for errors

### 3. Manually trigger W0 for stuck orders

For **multi-book** D2C orders, each book has its own row with `orderId` like `{uuid}-item-1`, `{uuid}-item-2`, `{uuid}-item-3`.

**Option A: Admin API (one order at a time)**

```bash
# Get orderIds from the SQL above, then:
curl -X POST "https://admin.littleherolabs.com/api/admin/orders/{orderId}/trigger-w0" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Run for each of the 3 orderIds.

**Option B: Batch script** (from project root)

```bash
# Trigger W0 for all orders in a D2C group by root_order_id
node scripts/trigger-w0-for-d2c-group.js <root_order_id>
```

The script updates `pending_payment` orders to `pending_w0` and calls the W0 webhook for each book.

### 4. If orders are pending_payment: update first

Before triggering W0, orders must be `pending_w0`. If they're still `pending_payment` (Stripe webhook missed), run:

```sql
UPDATE orders
SET execution_status = 'pending_w0',
    status = 'pending_w0',
    purchase_date = COALESCE(purchase_date, NOW()),
    updated_at = NOW()
WHERE root_order_id = 'YOUR-ROOT-UUID-HERE'
  AND execution_status = 'pending_payment';
```

Then trigger W0 for each orderId in that group.

## Environment variables

- `N8N_W0_WEBHOOK_URL` — must be set for Stripe webhook and trigger-w0 to call W0
- `STRIPE_WEBHOOK_SECRET` / `STRIPE_SANDBOX_WEBHOOK_SECRET` — for Stripe signature verification
