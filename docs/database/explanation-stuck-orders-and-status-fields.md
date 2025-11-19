# Explanation: Stuck Orders and Status Fields

## Why Orders Can Have Both `execution_status: 'processing'` and `status: 'queued_for_processing'`

These are **two different fields** that serve different purposes:

### `execution_status` (Database Field)
- **Purpose**: Tracks the actual execution state of the order in the system
- **Values**: `'new'`, `'ready_for_processing'`, `'processing'`, `'done'`, `'error'`, `'error_requires_manual_review'`
- **Set by**: Workflows, webhooks, cron jobs
- **Example**: When W1.1 router picks up an order, it sets `execution_status = 'processing'`

### `status` (Calculated Field)
- **Purpose**: Represents the overall order lifecycle status for display
- **Values**: `'queued_for_processing'`, `'pending_base_review'`, `'pending_bg_removal'`, `'pending_assembly'`, etc.
- **Calculated by**: `calculateOrderStatus()` function based on:
  - `workflow_step` (e.g., `'2A-complete'`, `'bria_processing_complete'`)
  - `review_stages` (preBria, postBria, postPdf)
  - `customer_approval_status`
  - `lulu_status`
  - `flags`
- **Example**: An order with `workflow_step = '2A-complete'` but `review_stages.preBria.status = 'pending'` will have `status = 'queued_for_processing'` (waiting for review)

### Why They Can Be Different

An order can have:
- `execution_status: 'processing'` (system thinks it's actively processing)
- `status: 'queued_for_processing'` (calculated status shows it's waiting for review)

**This happens when:**
1. A workflow completes and sets `workflow_step = '2A-complete'`
2. But the webhook handler doesn't reset `execution_status` from `'processing'` to `'done'`
3. The order remains stuck in `'processing'` state
4. But `calculateOrderStatus()` correctly calculates `status = 'queued_for_processing'` based on `workflow_step`

## Why W1.2 Isn't Detecting Stuck Orders

The health-monitor cron (`/api/cron/health-monitor`) **does** detect stuck orders (>30 minutes processing), but:

1. **It queries Supabase** for stuck orders ✅
2. **It calls an n8n webhook** to handle them ⚠️
3. **If the n8n workflow isn't active or working**, the orders never get reset ❌

### The Flow Should Be:
```
Health Monitor Cron (every 10 min)
  ↓
Detects stuck orders (>30 min processing)
  ↓
Calls n8n webhook (W1.2 equivalent)
  ↓
n8n workflow resets orders
  ↓
Orders become available for W1.1 router
```

### The Problem:
- The n8n workflow might not be active
- The n8n workflow might be failing
- The webhook might not be configured correctly

## Immediate Fix

Run the SQL script: `docs/database/fix-all-stuck-processing-orders-now.sql`

This will:
1. Reset all orders stuck in `'processing'` state
2. Set to `'done'` if workflow completed (has manifest)
3. Set to `'ready_for_processing'` if truly stuck (no manifest)
4. Clear `started_at` and `current_workflow`
5. Free up W1.1 capacity immediately

## Long-Term Solution

1. **Verify health-monitor cron is running** (check Vercel cron logs)
2. **Verify n8n webhook is configured** (`N8N_HEALTH_MONITOR_WEBHOOK_URL`)
3. **Activate/verify n8n workflow** that handles stuck orders
4. **Ensure webhook handlers reset `execution_status`** when workflows complete (already fixed)

## Prevention

The webhook handlers now reset `execution_status` when workflows complete:
- `workflow-2a-complete/route.ts` - Sets to `'done'` or keeps `'processing'` if needsReview
- `workflow-2b-complete/route.ts` - Sets to `'done'` or keeps `'processing'` if needsReview  
- `workflow-3-complete/route.ts` - Sets to `'done'`

This prevents **new orders** from getting stuck, but doesn't fix existing stuck orders.

