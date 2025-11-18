# Orphaned Orders Prevention System

## Problem

Orders can get stuck in Supabase without any workflow processing them:
- **Error orders** without `next_retry_at` set (W1.3 can't find them)
- **Error orders** with `retry_count >= 3` (W1.3 won't pick them up)
- **Processing orders** stuck > 1 hour (W1.2 should catch, but might miss)
- **Ready orders** not being picked up by W1.1 (capacity or router issues)

## Solution: Multi-Layer Monitoring & Recovery

### Layer 1: W1.2 - Stuck Workflow Manager
- **Frequency:** Every 5 minutes
- **Detects:** Orders in `processing` status > 30 minutes
- **Action:** Marks as error and schedules retry

### Layer 2: W1.3 - Retry Recovery Manager
- **Frequency:** Every 2 minutes
- **Detects:** Orders in `error` status with `next_retry_at <= NOW()` and `retry_count < 3`
- **Action:** Resets to `ready_for_processing` for W1.1 to pick up

### Layer 3: W1.4 - Orphaned Orders Monitor (NEW)
- **Frequency:** Every 10 minutes
- **Detects:** Orders that fall through the cracks:
  - Error orders without retry scheduled
  - Error orders that exceeded max retries
  - Processing orders stuck > 1 hour
  - Ready orders not picked up > 30 minutes
- **Action:** Automatically recovers or marks for manual review

### Layer 4: Admin UI - Orphaned Orders Page (NEW)
- **Location:** `/admin/orphaned-orders`
- **Purpose:** Visual monitoring and manual recovery
- **Features:**
  - Lists all orphaned orders
  - Shows reason for being orphaned
  - Bulk recovery actions
  - Real-time updates

## Implementation Steps

### 1. Create Database Objects

Run in Supabase SQL Editor:
```sql
-- Create view for monitoring
\i docs/database/create-orphaned-orders-monitor.sql

-- Create function for n8n to call
\i docs/database/create-get-orphaned-orders-function.sql
```

### 2. Import W1.4 Workflow

- Import `LHB - 1.4- Orphaned Orders Monitor.json` into n8n
- Activate the workflow
- Verify it runs every 10 minutes

### 3. Deploy Admin UI

The admin page is already created at:
- `back-end/src/app/admin/orphaned-orders/page.tsx`
- `back-end/src/app/api/admin/orphaned-orders/route.ts`

Just deploy the backend and access `/admin/orphaned-orders`.

## How It Works

### Detection Logic

```sql
-- Error orders without retry scheduled
execution_status = 'error' 
AND next_retry_at IS NULL 
AND retry_count < 3

-- Error orders that exceeded max retries
execution_status = 'error' 
AND retry_count >= 3

-- Processing orders stuck
execution_status = 'processing' 
AND (started_at IS NULL OR started_at < NOW() - INTERVAL '1 hour')

-- Ready orders not picked up
execution_status = 'ready_for_processing' 
AND queued_at < NOW() - INTERVAL '30 minutes'
```

### Recovery Actions

1. **schedule_retry**: For error orders without retry scheduled
   - Sets `execution_status = 'error'`
   - Increments `retry_count`
   - Sets `next_retry_at` to 5 minutes from now
   - W1.3 will pick it up automatically

2. **manual_review**: For orders that exceeded max retries
   - Sets `execution_status = 'error_requires_manual_review'`
   - Requires admin intervention

3. **reset_processing**: For stuck processing orders
   - Resets to `error` status
   - Schedules retry
   - Clears processing state

## Monitoring

### Check Orphaned Orders

```sql
-- View all orphaned orders
SELECT * FROM orphaned_orders;

-- Count by reason
SELECT orphan_reason, COUNT(*) 
FROM orphaned_orders 
GROUP BY orphan_reason;
```

### Admin UI

Visit `/admin/orphaned-orders` to:
- See all orphaned orders
- Filter by reason
- Bulk recover orders
- Monitor in real-time

## Prevention

This system prevents orders from being forgotten by:
1. **Automatic detection** every 10 minutes
2. **Automatic recovery** when possible
3. **Manual review queue** for complex cases
4. **Visual monitoring** in admin UI
5. **Alerts** (can be extended to Slack/Email)

## Next Steps

1. Deploy database objects
2. Import and activate W1.4
3. Deploy backend with orphaned orders page
4. Monitor for a few days to verify it's working
5. Add Slack/Email alerts if needed

---

**See Also**:
- `docs/database/implementation-summary.md` - Implementation status
- `docs/database/fix-orphaned-orders-summary.md` - Fix summary

