# W1.1 Execution Gaps - Root Cause & Solution

## Problem
W1.1 router scheduled for every 30 seconds has large gaps where it doesn't run. Order `JOHN-TEST3` was submitted during one of these gaps.

## Root Cause: n8n Schedule Trigger Behavior

**n8n schedule triggers skip the next run if the current execution is still running.**

**Example:**
- 00:00:00 - Execution starts
- 00:00:35 - Execution finishes (took 35 seconds)
- 00:00:30 - **Skipped** (previous execution still running)
- 00:01:00 - Next execution starts

**Gap created:** 30 seconds (from 00:00:30 to 00:01:00)

## Why W1.1 Takes > 30 Seconds

Potential slow operations in W1.1:

1. **HTTP Requests Without Timeouts**
   - "Get Signed URL (1-manifest)-W4" - fetches signed URL from backend
   - "Trigger 2A/2B/3 Workflow" - HTTP POST to webhooks
   - No explicit timeouts set

2. **Supabase Queries**
   - "Fetch Ready Orders" - queries Supabase
   - "Mark as Processing" - PATCH to Supabase
   - Could be slow if database is under load

3. **Sequential Operations**
   - Operations happen one after another
   - If any single operation takes > 10 seconds, total time > 30 seconds

## Solutions

### Immediate Fix: Add Timeouts

Add timeouts to all HTTP requests in W1.1:

1. **"Get Signed URL" node:**
   ```javascript
   const res = await this.helpers.request({
     method: 'GET',
     uri: endpoint,
     qs: { key: item.oneManifestKey, bucket: 'little-hero-orders', expiresIn: ttl },
     headers: token ? { Authorization: `Bearer ${token}` } : {},
     json: true,
     timeout: 5000  // 5 second timeout
   });
   ```

2. **"Trigger Workflow" HTTP Request nodes:**
   - Add timeout: 10 seconds
   - Add retry logic with exponential backoff

### Long-term Fix: Optimize W1.1

1. **Parallelize Operations**
   - Fetch signed URLs in parallel for multiple orders
   - Don't wait for one order to complete before starting the next

2. **Increase Interval**
   - Change from 30 seconds to 60 seconds
   - Gives more buffer for slow operations

3. **Use Cron Instead of Interval**
   - Cron triggers are more reliable: `*/30 * * * * *` (every 30 seconds)
   - Less likely to skip runs

4. **Add Error Handling**
   - Catch errors quickly to prevent long-running failed executions
   - Set timeouts on all operations

## Diagnostic: Check Execution Duration

In n8n execution logs, check:
1. What's the longest W1.1 execution duration?
2. Are there any executions that took > 30 seconds?
3. Which node is taking the longest?

If executions consistently take > 30 seconds, that's the cause of the gaps.

