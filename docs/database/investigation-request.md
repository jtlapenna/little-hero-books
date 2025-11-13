# Investigation Request: Stuck Processing Orders

## Problem Summary

W1.1 router shows `currentProcessing: 5` (at max capacity), blocking new orders from being picked up. However, there likely aren't actually 5 orders processing - they're stuck in `execution_status='processing'` state.

## What I Need from You

Please run these SQL queries in Supabase SQL Editor and share the results:

### Query 1: Check queue_status
```sql
SELECT * FROM queue_status;
```
**Or if view doesn't exist:**
```sql
SELECT get_queue_status();
```

### Query 2: Find all stuck orders
```sql
SELECT 
  amazon_order_id,
  execution_status,
  current_workflow,
  started_at,
  EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as minutes_processing,
  manifest_2a_url IS NOT NULL as has_2a_manifest,
  manifest_2b_url IS NOT NULL as has_2b_manifest,
  manifest_3_url IS NOT NULL as has_3_manifest
FROM orders
WHERE execution_status = 'processing'
ORDER BY started_at ASC NULLS LAST;
```

### Query 3: Quick summary
```sql
SELECT 
  execution_status,
  COUNT(*) as count,
  MIN(started_at) as oldest,
  MAX(started_at) as newest
FROM orders
WHERE execution_status IN ('processing', 'ready_for_processing')
GROUP BY execution_status;
```

## What This Will Tell Us

1. **How many orders are actually stuck** in `processing` state
2. **How long they've been stuck** (minutes_processing)
3. **Which orders are blocking** new orders from being picked up
4. **Whether workflows completed** but status wasn't updated (has manifests)

## Expected Fix

Once we identify the stuck orders, we'll reset them:
- Set `execution_status = 'ready_for_processing'`
- Clear `started_at` and `current_workflow`
- This will free up capacity for W1.1 to pick up new orders

## Files Created

- `docs/database/diagnose-stuck-processing-orders-complete.sql` - Full diagnostic queries
- `docs/database/fix-stuck-processing-orders-safe.sql` - Safe fix script (review first, then uncomment)

