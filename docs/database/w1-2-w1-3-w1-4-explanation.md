# W1.2, W1.3, W1.4 - Simple Explanation

## Overview
These three workflows work together to prevent orders from getting stuck or forgotten in the system.

## W1.2 - Stuck Workflow Manager
**Runs:** Every 5 minutes  
**What it does:**
- Finds orders that are `processing` for more than 30 minutes
- Marks them as `error` and logs to `failed_orders` table
- Decides: retry (if < 3 attempts) or manual review (if ≥ 3 attempts)
- If retry: schedules `next_retry_at` (exponential backoff: 5min, 10min, 20min)
- If manual review: marks for human intervention

**Key fields it sets:**
- `execution_status: 'error'`
- `error_type: 'workflow_timeout'`
- `next_retry_at: <future timestamp>` (if retrying)
- `retry_count: <incremented>`

## W1.3 - Retry Recovery Manager
**Runs:** Every 2 minutes  
**What it does:**
- Finds orders in `error` status with `next_retry_at` in the past
- Resets them to `ready_for_processing` (clears error fields, resets timestamps)
- W1.1 router then picks them up and routes to correct workflow

**Key fields it sets:**
- `execution_status: 'ready_for_processing'`
- `error_message: null`
- `error_type: null`
- `next_retry_at: null`
- `current_workflow: null`
- `started_at: null` ⚠️ **This resets the timestamp!**

## W1.4 - Orphaned Orders Monitor
**Runs:** Every 10 minutes  
**What it does:**
- Catches orders that fall through the cracks:
  - Error orders without retry scheduled
  - Error orders that exceeded max retries
  - Processing orders stuck > 1 hour
  - Ready orders not picked up > 30 minutes
- Attempts recovery: schedules retry, marks for manual review, or resets processing state

**Key difference:** W1.4 is a safety net - it catches orders that W1.2/W1.3 might have missed.

## How They Work Together

```
Order gets stuck in processing (e.g., workflow crashes)
    ↓
W1.2 detects it (> 30 min) 
    → Marks as error 
    → Schedules retry (next_retry_at = now + 5 min)
    ↓
W1.3 picks it up (when retry time arrives)
    → Resets to ready_for_processing
    → Clears error fields
    → Resets started_at to null
    ↓
W1.1 router picks it up
    → Sets new started_at timestamp
    → Routes to correct workflow
    ↓
If it gets stuck again
    → W1.2 catches it again (after 30 min)
    → Increments retry_count
    ↓
If retry_count >= 3
    → W1.2 marks for manual review
    → W1.4 can also catch it as "error_max_retries_exceeded"
    ↓
If W1.2/W1.3 miss it somehow
    → W1.4 catches it as orphaned
    → Attempts recovery
```

## Important Notes

1. **Timestamp Reset:** When W1.3 resets an order, it clears `started_at`. When W1.1 picks it up again, it sets a NEW `started_at`. This means orders that were stuck overnight will appear to have just started after retry.

2. **Retry Count:** The `retry_count` is preserved across retries, so the system knows how many times an order has been retried.

3. **Exponential Backoff:** W1.2 uses exponential backoff for retries:
   - 1st retry: 5 minutes
   - 2nd retry: 10 minutes
   - 3rd retry: 20 minutes
   - After 3 retries: manual review

4. **W1.4 Safety Net:** W1.4 runs less frequently (10 min) but catches more edge cases, including orders that W1.2 might miss (e.g., orders stuck without a `started_at` timestamp).

