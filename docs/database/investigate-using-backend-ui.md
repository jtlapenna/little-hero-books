# Investigate Orphaned Orders Using Backend UI

## Issue 1: Error/Orphaned Order Visibility

**Current State:** Only `execution_status = 'error_requires_manual_review'` shows badges.

**Desired State:** ANY error or orphaned order should show badges/flags across the entire UI.

**Changes Made:**
1. ✅ Updated `status-display.ts` to show `ACTION_REQUIRED` badge for `execution_status = 'error'`
2. ✅ Updated `status-service.ts` to return `ACTION_REQUIRED` for `execution_status = 'error'`

**How to Verify:**
1. Go to `/orders` page
2. Look for JESSICA-CUNT order
3. It should now show an "Action Required" badge (red) even though `execution_status = 'error'` (not `error_requires_manual_review`)
4. Go to `/orders/JESSICA-CUNT` detail page
5. It should show the manual review alert banner (if `execution_status = 'error_requires_manual_review'`) OR an error badge (if `execution_status = 'error'`)

**Next Steps:**
- Check if JESSICA-CUNT now shows error badge in orders list
- Check if other error orders show badges
- Consider adding a specific "Error" badge vs "Action Required" if needed

---

## Issue 2: Router Not Picking Up Orders

**Your Point:** Router SHOULD pick up orders on next execution, even if there was a gap. If orders are `ready_for_processing` and router has capacity, they should be picked up.

**You're Right!** The router queries `execution_status = 'ready_for_processing'` and doesn't filter by `next_workflow` in the query. It should pick them up.

**Investigation Steps:**

### Step 1: Check Router Query Results
Run this in Supabase SQL Editor:
```sql
-- See docs/database/investigate-router-not-picking-up-orders.sql
```

This will show:
- If orders match router query conditions
- What router would actually fetch
- If orders appear in router's fetch results
- If there are orders ahead in queue
- If there are data quality issues

### Step 2: Check Router Execution Logs in n8n
1. Go to W1.1 workflow in n8n
2. Click "Executions" tab
3. Look at recent executions:
   - Did router run when orders were queued?
   - Did "Fetch Ready Orders" node return any data?
   - Did "Route Orders by Workflow" node receive the orders?
   - Did workflow 4 routing logic execute?

### Step 3: Check Router Capacity
In Supabase SQL Editor:
```sql
SELECT 
  (SELECT COUNT(*) FROM orders WHERE execution_status = 'processing') as current_processing,
  (SELECT COUNT(*) FROM orders WHERE execution_status = 'ready_for_processing') as ready_count;
```

If `current_processing >= 5`, router won't fetch new orders.

### Step 4: Check Order Priority/Queue Position
```sql
-- See if other orders are ahead in queue
SELECT 
  amazon_order_id,
  priority,
  queued_at,
  next_workflow
FROM orders
WHERE execution_status = 'ready_for_processing'
ORDER BY priority DESC NULLS LAST, queued_at ASC NULLS LAST
LIMIT 10;
```

If JOHN-TEST4 and JOHN-TEST5 aren't in the top 5, they won't be picked up until slots are available.

### Step 5: Check Router Routing Logic
The router routes orders by `next_workflow` value:
- `'2A'` → Workflow 2A
- `'2B'` → Workflow 2B  
- `'3'` → Workflow 3
- `'4'` → Workflow 4

If `next_workflow = '4'` but router doesn't have workflow 4 routing set up correctly, orders might be filtered out.

**Check in n8n:**
1. Look at "Route Orders by Workflow" node output
2. Check if `workflow4` array has orders
3. Check if "Prep Workflow 4 Orders" node receives data
4. Check if "Mark as Processing (4)" node executes
5. Check if "Trigger Workflow 4" node executes

---

## Issue 3: No SQL Changes Yet

**Approach:** Use backend UI and diagnostic queries to investigate first.

**Available Tools:**
1. **Orphaned Orders Page** (`/admin/orphaned-orders`)
   - Shows all orphaned orders
   - Can see error details
   - Can take recovery actions

2. **Stuck Orders Page** (`/admin/stuck-orders`)
   - Shows orders stuck in processing
   - Can manually reset

3. **Order Detail Page** (`/orders/[orderId]`)
   - Shows full order details
   - Shows error messages
   - Shows execution status

4. **Diagnostic SQL Queries:**
   - `docs/database/investigate-router-not-picking-up-orders.sql`
   - `docs/database/check-router-execution-gaps.sql`
   - `docs/database/diagnose-orphaned-orders-full-context.sql`

**Next Steps:**
1. Run diagnostic queries to understand the issue
2. Check n8n execution logs
3. Use backend UI to verify order states
4. Only make SQL changes if needed after investigation

