# W1.1 Execution Gaps Analysis

## Problem
W1.1 router is scheduled to run every 30 seconds, but execution logs show large gaps where it doesn't run at all.

## Common Causes of n8n Schedule Trigger Gaps

### 1. **Execution Takes Longer Than Interval**
If a workflow execution takes > 30 seconds, n8n will **skip the next scheduled run** until the current execution finishes.

**Example:**
- 00:00:00 - Execution starts
- 00:00:35 - Execution finishes (took 35 seconds)
- 00:00:30 - **Skipped** (still running)
- 00:01:00 - Next execution starts

**Check:** Look at W1.1 execution durations in n8n logs. If any take > 30 seconds, that's the cause.

### 2. **Workflow Errors Without Retry**
If W1.1 errors and doesn't have error handling, n8n might pause the schedule trigger.

**Check:** Look for error executions in W1.1 logs. Are there failed executions that might have paused the trigger?

### 3. **Long-Running Operations**
Operations that can block:
- HTTP requests with long timeouts
- Fetching large manifests
- Multiple Supabase queries
- External API calls

**Check W1.1 for:**
- HTTP requests without timeouts
- Fetching manifests (could be slow)
- Multiple sequential Supabase queries

### 4. **n8n Instance Issues**
- n8n Cloud instance paused/stopped
- Rate limiting
- Resource constraints

**Check:** Is the n8n instance active? Any rate limit errors?

## Solutions

### Immediate Fix: Check Execution Duration
1. Look at W1.1 execution logs
2. Find the longest execution duration
3. If > 30 seconds, that's causing gaps

### Long-term Fix: Optimize W1.1
1. **Add timeouts** to all HTTP requests
2. **Parallelize** operations where possible
3. **Add error handling** to prevent workflow crashes
4. **Consider increasing interval** to 60 seconds if executions consistently take > 30s

### Alternative: Use Cron Instead of Interval
Cron triggers are more reliable for consistent scheduling:
- `*/30 * * * * *` (every 30 seconds)
- Less likely to skip runs

## Diagnostic Queries

```sql
-- Check if there are orders stuck in 'processing' that might be blocking
SELECT 
  COUNT(*) as stuck_count,
  MAX(EXTRACT(EPOCH FROM (NOW() - started_at))) as max_stuck_seconds
FROM orders
WHERE execution_status = 'processing'
  AND started_at < NOW() - INTERVAL '1 minute';
```

