# Router: order not sent to W1.1 / W3 (or sent to W3 directly)

## Symptom A: Order sent to W3 *without* going through W1.1

Orders appear to run in W3 (book assembly) but never went through the W1.1 router (no “Mark as Processing”, wrong payload, or capacity bypass).

**Cause:** `N8N_ROUTER_WEBHOOK_URL` is set to the **W3 (book-assembly)** webhook URL instead of the **W1.1 router** webhook URL. The cron then POSTs the batch directly to W3, bypassing the router.

**Fix:**

1. In Vercel (or your host), set **N8N_ROUTER_WEBHOOK_URL** to your n8n **W1.1 router** webhook, e.g.  
   `https://thepeakbeyond.app.n8n.cloud/webhook/w1-1-router`  
   It must **not** be: `.../webhook/book-assembly`, `.../webhook/bg-removal`, `.../webhook/2a-start`, `.../webhook/order-intake`, or `.../webhook/w4-pdf-print`.
2. Redeploy or restart so the cron uses the new value.
3. The router cron now **validates** the URL at runtime: if it looks like a workflow URL (e.g. contains `book-assembly`), it returns 500 and does not call n8n. Check cron logs for `Router webhook misconfiguration` if this happens.

## Symptom B: Order not sent to W3 at all

An order has `execution_status: 'ready_for_processing'`, `next_workflow: '3'`, but it never gets sent through the W1.1 router to W3.

## How the flow works

1. **Cron** (`GET /api/cron/router`) runs (e.g. every 60s).
2. **Capacity:** Reads `queue_status` view → `processing_count`, `queued_count`. `availableSlots = max(0, 5 - processing_count)`.
3. If **availableSlots === 0** → returns immediately, **no n8n call**. So if 5 orders are stuck in `execution_status = 'processing'`, no new orders are ever sent.
4. Fetches orders: `execution_status = 'ready_for_processing'`, `next_workflow` not null, ordered by priority desc, then `updated_at` asc, `queued_at` asc, limit `availableSlots * 3` (then takes first `availableSlots` after eligibility).
5. Updates those orders: `queued_at`, `status = 'queued_for_processing'`.
6. **POST** to n8n W1.1 webhook with body `{ "orders": [ ... ] }`.
7. n8n **Extract Orders from Webhook** uses `webhookData.body?.orders || webhookData.orders`.
8. **Route Orders by Workflow** splits by `next_workflow` ('2A','2B','3','4').
9. For W3: **Prep Workflow 3 Orders** (requires `one_manifest_url`), then **Mark as Processing (3)** (PATCH Supabase: `execution_status = 'processing'`), then **Trigger Workflow 3**.

## Most likely causes

### 1. At capacity (processing_count = 5)

If five orders are stuck with `execution_status = 'processing'`, the router will **never** call n8n.

**Check:** In Supabase SQL Editor run:

```sql
SELECT * FROM queue_status;
```

If `processing_count` is 5 (or always high), find stuck orders:

```sql
SELECT id, amazon_order_id, execution_status, current_workflow, started_at, updated_at
FROM orders
WHERE execution_status = 'processing'
ORDER BY started_at ASC;
```

**Fix:** Reset stuck orders so capacity frees up (only if they are truly stuck, e.g. workflow failed and never updated status):

```sql
-- Example: reset one stuck order (replace id with real id)
UPDATE orders
SET execution_status = 'ready_for_processing',
    current_workflow = NULL,
    started_at = NULL,
    updated_at = now()
WHERE id = 123 AND execution_status = 'processing';
```

Or run the existing script/docs: `docs/database/fix-all-stuck-processing-orders-now.sql` (adjust to your policy).

### 2. queue_status view missing or wrong

If the view doesn’t exist or errors, the cron fails at the capacity check and returns 500.

**Check:** In Supabase, run:

```sql
SELECT * FROM queue_status;
```

If it errors, create the view (see `docs/database/fix-queue-status-view.sql`).

### 3. Cron not running or failing

If the cron never runs or fails before the n8n call, no orders are sent.

**Check:** Vercel (or your host) cron logs for `[Cron Router]` and look for:

- `At capacity - skipped n8n call` → see (1).
- `No eligible ready orders found` → no orders matched the query.
- `Successfully triggered n8n` with `orderIds: [...]` → confirm this order’s `amazon_order_id` is in the list. If it isn’t, it’s either beyond the first `availableSlots` (sort order) or filtered by eligibility.

### 4. Order state contradiction (e.g. 113-2460013-2374603)

Your order had `execution_status: 'ready_for_processing'` but also `started_at` and `current_workflow: '3'`. That usually means:

- It was previously claimed by W1.1 (“Mark as Processing (3)” ran and set those fields), then something set `execution_status` back to `ready_for_processing` (e.g. admin reset or error handler) without clearing `started_at` / `current_workflow`.

The router only filters on `execution_status` and `next_workflow`, so it can still pick this order. The blocker is then usually **(1) at capacity** or **(2)** the order is not in the first `availableSlots` because others are ahead in the sort.

## Quick checklist for “order not sent to W3”

1. Run `SELECT * FROM queue_status;` → if `processing_count >= 5`, fix stuck “processing” orders.
2. Confirm cron is running and logs show “Successfully triggered n8n” with this order’s id when it should be sent.
3. In n8n, open the W1.1 execution for that run and check “Extract Orders from Webhook”: “Received N orders” should be &gt; 0 and the payload should contain this order; then “Route Orders by Workflow” should show it in `workflow3`.
4. Ensure `queue_status` view exists and matches the definition in `docs/database/fix-queue-status-view.sql`.
5. In n8n, if “Extract Orders from Webhook” logs **“Received 0 orders”**, the webhook payload may be wrapped differently (e.g. body as string). The node uses `webhookData.body?.orders || webhookData.orders`; if your n8n version puts the raw JSON string in `body`, the workflow may need to parse it first.
