# W1.3 Troubleshooting

## Issue: "Fetch Orders Ready for Retry" Receives Config Data

**Problem:** W1.3's "Fetch Orders Ready for Retry" node is receiving Config data instead of making the HTTP request.

**Root Cause:** Schedule triggers in n8n don't pass data through. The HTTP Request node should work without input data - it just makes a GET request.

## Why It Might Be Getting Config Data

1. **Wrong workflow execution** - You might be looking at W1.2 logs instead of W1.3
2. **Node configuration issue** - The HTTP Request node might be configured incorrectly
3. **n8n UI display issue** - The input shown might be from a previous execution

## How to Verify

### 1. Check Which Workflow Ran
- Look at the workflow name in n8n execution logs
- Should be "LHB - 1.3- Retry Recovery Manager"
- NOT "LHB - 1.2- Stuck Workflow Manager"

### 2. Check if Orders Are Ready
Run this query in Supabase:
```sql
SELECT 
  amazon_order_id,
  execution_status,
  retry_count,
  next_retry_at,
  CASE 
    WHEN execution_status = 'error' 
         AND next_retry_at IS NOT NULL 
         AND next_retry_at <= NOW() 
         AND retry_count < 3
    THEN '✅ READY'
    ELSE '❌ NOT READY'
  END as status
FROM orders
WHERE execution_status = 'error'
ORDER BY next_retry_at ASC;
```

### 3. Check HTTP Request Node Output
The "Fetch Orders Ready for Retry" node should:
- Make a GET request to Supabase
- Return an array of orders (or empty array if none found)
- If it returns empty array `[]`, that's normal - it means no orders are ready yet

## Expected Behavior

1. **Trigger fires** (every 2 minutes)
2. **"Fetch Orders Ready for Retry"** makes GET request
3. **If orders found:** Returns array of orders → continues to next node
4. **If no orders:** Returns empty array `[]` → workflow completes (no error)

## Common Issues

### Issue 1: No Orders Ready
- **Symptom:** Node completes but returns empty array
- **Cause:** No orders match the criteria (execution_status='error' AND next_retry_at <= NOW() AND retry_count < 3)
- **Solution:** Check if Schedule Retry node in W1.2 actually set `next_retry_at`

### Issue 2: Orders Not in 'error' Status
- **Symptom:** Orders exist but W1.3 doesn't find them
- **Cause:** Schedule Retry node set wrong status
- **Solution:** Verify Schedule Retry sets `execution_status = 'error'` (we just fixed this)

### Issue 3: next_retry_at Not Set
- **Symptom:** Orders have `execution_status = 'error'` but no `next_retry_at`
- **Cause:** Schedule Retry node didn't run or failed
- **Solution:** Check W1.2 execution logs for Schedule Retry node

## Debug Steps

1. **Verify orders in Supabase:**
   ```sql
   SELECT amazon_order_id, execution_status, retry_count, next_retry_at 
   FROM orders 
   WHERE execution_status = 'error';
   ```

2. **Check W1.3 execution logs:**
   - Look at "Fetch Orders Ready for Retry" node output
   - Should show array of orders or empty array `[]`

3. **Check W1.2 execution logs:**
   - Verify "Schedule Retry" node ran successfully
   - Check if it updated orders in Supabase

4. **Test the Supabase query manually:**
   ```sql
   SELECT * FROM orders
   WHERE execution_status = 'error'
     AND next_retry_at <= NOW()
     AND retry_count < 3
   LIMIT 10;
   ```

