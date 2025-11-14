# How to Check n8n Router Execution Gaps

## Problem
Orders with `ready_for_processing` status aren't being picked up, but:
- Router is not at capacity (0 processing)
- Router is running
- `next_workflow` is set correctly
- Not blocked by priority
- Need to check for execution gaps

## How to Check Execution Gaps

### Method 1: n8n UI - Execution History

1. **Navigate to W1.1 workflow in n8n**
2. **Click "Executions" tab**
3. **Look for time gaps:**
   - Router should run every 30 seconds
   - If you see gaps > 1 minute, that's the problem
   - Check execution timestamps: `10:00:00`, `10:00:30`, `10:01:00`, etc.

4. **Check execution duration:**
   - If an execution takes > 30 seconds, the next scheduled run will be skipped
   - n8n schedule triggers skip runs if previous execution is still running

5. **Filter by time range:**
   - Filter to the time when orders were queued
   - Check if router ran during that time window

### Method 2: SQL Query - Check Router Query Conditions

Run this query to see if orders match router's query conditions:

```sql
-- Check if orders match router query
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  queued_at,
  EXTRACT(EPOCH FROM (NOW() - queued_at)) / 60 as minutes_queued,
  CASE 
    WHEN execution_status = 'ready_for_processing' AND next_workflow IS NOT NULL 
    THEN '✅ Matches router query'
    ELSE '❌ Does NOT match'
  END as matches_router_query
FROM orders
WHERE amazon_order_id IN ('JOHN-TEST4', 'JOHN-TEST5');
```

### Method 3: Check Router Query Logic

W1.1 router queries for:
```sql
execution_status = 'ready_for_processing' 
AND next_workflow IS NOT NULL
```

Then checks capacity:
```sql
SELECT COUNT(*) FROM orders WHERE execution_status = 'processing'
-- If count >= 5, router stops picking up new orders
```

**Run this to verify:**
```sql
-- Check router eligibility
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  (SELECT COUNT(*) FROM orders WHERE execution_status = 'processing') as current_processing,
  CASE 
    WHEN execution_status = 'ready_for_processing' 
         AND next_workflow IS NOT NULL
         AND (SELECT COUNT(*) FROM orders WHERE execution_status = 'processing') < 5
    THEN '✅ Should be picked up'
    ELSE '❌ Will NOT be picked up'
  END as router_will_pickup
FROM orders
WHERE amazon_order_id IN ('JOHN-TEST4', 'JOHN-TEST5');
```

### Method 4: Check for Execution Gaps in n8n Logs

**In n8n UI:**
1. Go to W1.1 workflow
2. Click "Executions"
3. Sort by "Started At" (newest first)
4. Look for gaps in timestamps
5. If router runs every 30 seconds, you should see:
   - `10:00:00`
   - `10:00:30`
   - `10:01:00`
   - `10:01:30`
   - etc.

**If you see gaps like:**
- `10:00:00`
- `10:02:00` ← 2 minute gap!
- `10:02:30`

**That means router skipped runs, and orders queued during the gap weren't picked up.**

### Method 5: Check Execution Duration

**In n8n UI:**
1. Go to W1.1 workflow executions
2. Check "Duration" column
3. If any execution takes > 30 seconds, the next scheduled run will be skipped
4. This causes execution gaps

**Solution:** Optimize slow nodes in W1.1 or increase trigger interval

## Common Causes of Execution Gaps

1. **Previous execution still running** (most common)
   - Router execution takes > 30 seconds
   - Next scheduled run is skipped
   - Orders queued during skip aren't picked up

2. **n8n server overloaded**
   - Too many workflows running
   - n8n skips scheduled triggers

3. **Network timeouts**
   - HTTP requests in router timing out
   - Execution hangs, next run skipped

4. **Database connection issues**
   - Supabase queries timing out
   - Execution hangs

## How to Fix Execution Gaps

1. **Add timeouts to HTTP requests in W1.1**
2. **Optimize slow nodes** (identify which nodes take longest)
3. **Increase trigger interval** (e.g., every 1 minute instead of 30 seconds)
4. **Check n8n server resources** (CPU, memory)
5. **Check Supabase connection pool** (too many connections?)

## Quick Diagnostic Query

Run this to see router eligibility in real-time:

```sql
-- See docs/database/check-router-execution-gaps.sql
```

