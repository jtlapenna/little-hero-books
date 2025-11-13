# How W1.3 (Retry Recovery Manager) Works

## Overview

W1.3 automatically retries failed orders that have been scheduled for retry by W1.2.

## Trigger

- **Schedule**: Every 2 minutes (via scheduleTrigger)
- **Runs automatically** when active

## Workflow Steps

### 1. Fetch Orders Ready for Retry
Queries Supabase for orders matching:
- `execution_status = 'error'`
- `next_retry_at <= NOW()` (retry time has arrived)
- `retry_count < 3` (hasn't exceeded max retries)
- Orders up to 10 at a time, sorted by `next_retry_at` (oldest first)

### 2. Route Retries by Workflow
Groups orders by their `next_workflow` field (2A, 2B, 3, or 4).

**Note:** Currently this node groups but doesn't actually route - it just passes through to the next node.

### 3. Reset Status for Retry
Updates each order in Supabase:
- Sets `execution_status = 'ready_for_processing'` (ready for W1.1 router)
- Clears `error_message`, `error_type`, `next_retry_at`
- Clears `current_workflow` and `started_at`

### 4. Prep for Router
Formats the order data to match what W1.1 router expects:
- `orderId`, `characterHash`, `characterSpecs`, `bookSpecs`
- `workflow` (from `next_workflow`)
- `isRetry: true`, `retryCount`

### 5. Log Retry
Logs the retry attempt to console.

## How Orders Get to W1.3

Orders reach W1.3 through this flow:

1. **W1.2 detects stuck order** (>30 minutes processing)
2. **W1.2 marks as error** (`execution_status = 'error'`)
3. **W1.2 decides retry** (if `retry_count < 3`)
4. **W1.2 schedules retry** (sets `next_retry_at` and increments `retry_count`)
   - **CRITICAL**: Must set `execution_status = 'error'` (not `ready_for_processing`)
5. **W1.3 picks up** when `next_retry_at <= NOW()`
6. **W1.3 resets** to `ready_for_processing` and clears retry fields
7. **W1.1 router** picks it up and routes to appropriate workflow

## Current Issue

The "Schedule Retry" node in W1.2 is setting `execution_status = 'ready_for_processing'`, but W1.3 queries for `execution_status = 'error'`. This means W1.3 will never find these orders!

**Fix:** Schedule Retry should set `execution_status = 'error'` so W1.3 can find it.

## Verification Queries

See `docs/database/check-schedule-retry-results.sql` for queries to verify:
- Orders scheduled for retry
- Orders ready for W1.3
- Orders that were successfully retried

