# Stuck Workflow Management System

Complete system for detecting, handling, and recovering from stuck/failed workflows.

## Components

### 1. **LHB - 1.2- Stuck Workflow Manager**
**Purpose:** Detects orders stuck in "processing" status and handles them

**Schedule:** Runs every 5 minutes

**What it does:**
- Fetches all orders with `execution_status = 'processing'`
- Detects orders running > 30 minutes (configurable)
- Marks stuck orders as `error` status
- Logs to `failed_orders` table
- Decides: retry or manual review
  - If `retry_count < 3`: Schedules retry with exponential backoff
  - If `retry_count >= 3`: Marks as `error_requires_manual_review` (stops auto-retries)

**Exponential Backoff:**
- Attempt 1: 5 minutes delay
- Attempt 2: 10 minutes delay  
- Attempt 3: 20 minutes delay
- After 3: Manual review required

### 2. **LHB - 1.3- Retry Recovery Manager**
**Purpose:** Automatically retries failed orders when ready

**Schedule:** Runs every 2 minutes

**What it does:**
- Fetches orders with:
  - `execution_status = 'error'`
  - `next_retry_at <= now()`
  - `retry_count < 3`
- Resets status to `ready_for_processing`
- Routes back to appropriate workflow via router
- Logs retry attempt

### 3. **Error Handling Node Template**
**Purpose:** Reusable error handler for workflows 2A, 2B, 3, 4

**What it does:**
- Catches errors from any workflow node
- Updates order status to `error`
- Logs to `failed_orders` table
- Prevents infinite loops (doesn't set back to `ready_for_processing`)

## Database Schema

### Required Migration
Run `migration-add-error-tracking.sql` to add:
- `error_message` TEXT
- `error_type` VARCHAR(100)
- `retry_count` INTEGER DEFAULT 0
- `max_retries` INTEGER DEFAULT 3
- `last_error_at` TIMESTAMP
- `next_retry_at` TIMESTAMP

### Status Flow

```
ready_for_processing 
  → processing (router marks when starting)
  → ✅ completed (workflow succeeds)
  → ❌ error (workflow fails or times out)
    → ready_for_processing (retry scheduled)
    → error_requires_manual_review (max retries reached)
```

## Integration Steps

### 1. Run Database Migration
```sql
-- Run in Supabase SQL editor
\i docs/database/migration-add-error-tracking.sql
```

### 2. Import Workflows
- Import `LHB - 1.2- Stuck Workflow Manager.json`
- Import `LHB - 1.3- Retry Recovery Manager.json`
- Activate both workflows

### 3. Add Error Handlers to Workflows
For each workflow (2A, 2B, 3, 4):
1. Add "Handle Error" node (see `ERROR_HANDLING_NODE_TEMPLATE.md`)
2. Connect "On Error" paths from critical nodes to error handler
3. Adjust `orderId` extraction to match your workflow

### 4. Configure Alerts (Optional)
Update "Alert: Manual Review" node in 1.2 to send to:
- Slack webhook
- Email
- PagerDuty
- etc.

## How It Prevents Infinite Loops

1. **Error Status:** Failed orders go to `error` (not `ready_for_processing`)
2. **Retry Limits:** Max 3 retries per order
3. **Manual Review:** After max retries, status becomes `error_requires_manual_review` (stops auto-retries)
4. **Exponential Backoff:** Delays between retries prevent immediate re-processing

## Monitoring

### Check Stuck Orders
```sql
SELECT amazon_order_id, current_workflow, started_at, 
       EXTRACT(EPOCH FROM (NOW() - started_at))/60 as running_minutes
FROM orders 
WHERE execution_status = 'processing' 
  AND started_at < NOW() - INTERVAL '30 minutes';
```

### Check Failed Orders
```sql
SELECT o.amazon_order_id, fo.error_type, fo.error_message, 
       fo.retry_count, fo.next_retry_at, o.execution_status
FROM failed_orders fo
JOIN orders o ON fo.order_id = o.id
WHERE fo.resolved = false
ORDER BY fo.failed_at DESC;
```

### Check Orders Requiring Manual Review
```sql
SELECT amazon_order_id, error_message, retry_count, last_error_at
FROM orders
WHERE execution_status = 'error_requires_manual_review'
ORDER BY last_error_at DESC;
```

## Configuration

### Stuck Detection Threshold
Edit `LHB - 1.2- Stuck Workflow Manager.json` → "Config" node:
```javascript
stuckThresholdMinutes: 30  // Change to desired threshold
```

### Retry Settings
Edit "Config" node:
```javascript
maxRetries: 3,
retryBackoffMultiplier: 2,
baseRetryDelayMinutes: 5
```

## Troubleshooting

**Orders stuck in processing:**
- Check if 1.2 workflow is running
- Verify `started_at` timestamp is being set
- Check for errors in 1.2 workflow execution

**Orders not retrying:**
- Check if 1.3 workflow is running
- Verify `next_retry_at` is being set correctly
- Check `retry_count < 3` condition

**Infinite retries:**
- Verify `max_retries` check in 1.2
- Check that `error_requires_manual_review` status is being set
- Ensure error handlers don't set status back to `ready_for_processing`

