# Why Stuck Workflow Manager and Retry Recovery Aren't Working

## Root Cause

**Both workflows are marked as `"active": false` in their JSON files:**

1. **W1.2 - Stuck Workflow Manager** (line 322): `"active": false`
2. **W1.3 - Retry Recovery Manager** (line 168): `"active": false`

**This means they are NOT running in n8n**, even though they're configured to run every 5 minutes and 2 minutes respectively.

## How the 3 Orders Got Stuck

Based on the investigation:
- **JESSICA-CUNT**: 373 minutes (6+ hours) in workflow 2B
- **JOHN-TEST4**: 358 minutes (6+ hours) in workflow 2B
- **JOHN-TEST5**: 286 minutes (4+ hours) in workflow 3

**What happened:**
1. W1.1 router marked them as `execution_status='processing'` when routing to workflows
2. Workflows (2B, 3) completed but **didn't reset execution_status** (this was the bug we fixed in webhook handlers)
3. Orders remained stuck in `processing` state
4. W1.2 should have detected them after 30 minutes, but **it's not active**
5. W1.3 should have retried them, but **it's not active**

## The Fix We Already Applied

✅ **Webhook handlers now reset execution_status** when workflows complete:
- `workflow-2a-complete/route.ts` - Sets to 'done' or keeps 'processing' if needsReview
- `workflow-2b-complete/route.ts` - Sets to 'done' or keeps 'processing' if needsReview  
- `workflow-3-complete/route.ts` - Sets to 'done'

This **prevents new orders** from getting stuck, but doesn't fix the existing 3 stuck orders.

## Immediate Actions Required

### 1. Reset the 3 Stuck Orders

Run: `docs/database/reset-3-stuck-orders.sql`

This will:
- Check if workflows completed (have manifests)
- Set to 'done' if completed, or 'ready_for_processing' if truly stuck
- Clear processing state

### 2. Activate W1.2 and W1.3 Workflows

**In n8n:**
1. Open "LHB - 1.2- Stuck Workflow Manager"
2. Click the toggle to **activate** it
3. Open "LHB - 1.3- Retry Recovery Manager"  
4. Click the toggle to **activate** it

**OR** update the JSON files to set `"active": true` and re-import.

### 3. Verify They're Running

Check n8n execution logs:
- W1.2 should run every 5 minutes
- W1.3 should run every 2 minutes

## Why This Matters

- **W1.2** detects stuck orders (>30 min) and marks them for retry or manual review
- **W1.3** automatically retries failed orders when `next_retry_at` arrives
- Without these, stuck orders accumulate and block W1.1 capacity

## Prevention

1. ✅ Webhook handlers now reset execution_status (prevents new stuck orders)
2. ⚠️ Activate W1.2 and W1.3 (detects and recovers stuck orders)
3. ✅ Stuck orders UI page (manual monitoring and fixes)
4. ⏳ Automatic cleanup mechanism (Component 2 from plan - needs SQL implementation)

