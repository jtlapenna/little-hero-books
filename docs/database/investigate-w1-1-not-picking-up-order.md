# Investigation: W1.1 Not Picking Up Order

## Confirmed Facts

✅ **W0's upsert succeeded:**
- `execution_status: "ready_for_processing"` ✅
- `next_workflow: "2A"` ✅
- `one_manifest_url` set ✅
- `queued_at` set ✅

❌ **W1.1 router didn't pick it up**

## Possible Causes

### 1. W1.1 Router Not Running
- Check if W1.1 workflow is active in n8n
- Check execution logs to see if it's running every 30 seconds
- Check for errors in W1.1 execution

### 2. At Capacity
W1.1 has a capacity check:
- `maxConcurrent = 5` (default)
- Only fetches orders if `availableSlots > 0`
- If all 5 slots are processing, it won't fetch new orders

**Check:**
```sql
-- Check how many orders are currently processing
SELECT 
  COUNT(*) as processing_count,
  COUNT(*) FILTER (WHERE execution_status = 'ready_for_processing') as queued_count
FROM orders
WHERE execution_status = 'processing';
```

### 3. Other Orders Ahead in Queue
W1.1 orders by: `priority DESC, queued_at ASC`

**Check:**
```sql
-- See all orders that would be picked up before JOHN-TEST3
SELECT 
  amazon_order_id,
  priority,
  queued_at,
  next_workflow,
  execution_status
FROM orders
WHERE execution_status = 'ready_for_processing'
  AND next_workflow = '2A'
ORDER BY 
  priority DESC NULLS LAST,
  queued_at ASC NULLS LAST
LIMIT 10;
```

### 4. Query Issue
W1.1 queries:
- `execution_status = 'ready_for_processing'`
- Orders by `priority DESC, queued_at ASC`
- Limits by `availableSlots`

**Check if JOHN-TEST3 appears in the query:**
```sql
-- Simulate W1.1's exact query
SELECT 
  id,
  amazon_order_id,
  execution_status,
  next_workflow,
  priority,
  queued_at
FROM orders
WHERE execution_status = 'ready_for_processing'
ORDER BY 
  priority DESC NULLS LAST,
  queued_at ASC NULLS LAST
LIMIT 5;
```

## Next Steps

1. **Check W1.1 execution logs** - Is it running? Any errors?
2. **Check capacity** - How many orders are currently processing?
3. **Check queue position** - Are there other orders ahead of JOHN-TEST3?
4. **Check W1.1 workflow status** - Is it active? Is the schedule trigger enabled?

