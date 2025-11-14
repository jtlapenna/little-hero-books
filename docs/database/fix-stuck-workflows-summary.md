# Fix for Stuck Workflows Not Working

## Issues Found

1. **W1.2 - Stuck Workflow Manager**: `"active": false` + invalid trigger format
2. **W1.3 - Retry Recovery Manager**: `"active": false` + invalid trigger format
3. **3 orders stuck** for hundreds of minutes (JESSICA-CUNT, JOHN-TEST4, JOHN-TEST5)

## Fixes Applied

### 1. Fixed Trigger Configuration

**Changed from interval format to cron format:**

**W1.2 (Every 5 Minutes):**
- OLD: `"interval": [{"field": "minutes", "minutesInterval": 5}]`
- NEW: `"cronExpression": "*/5 * * * *"`

**W1.3 (Every 2 Minutes):**
- OLD: `"interval": [{"field": "minutes", "minutesInterval": 2}]`
- NEW: `"cronExpression": "*/2 * * * *"`

**Why:** n8n schedule triggers with `minutesInterval` may not work correctly. Cron expressions are more reliable.

### 2. Activated Workflows

- Set `"active": true` in both workflow JSON files
- Updated connection reference in W1.3 to match new trigger name

## Next Steps

1. **Re-import workflows in n8n:**
   - Import updated `LHB - 1.2- Stuck Workflow Manager.json`
   - Import updated `LHB - 1.3- Retry Recovery Manager.json`
   - Verify they show as "Active" in n8n

2. **Reset the 3 stuck orders:**
   ```sql
   -- Run: docs/database/reset-3-stuck-orders.sql
   ```

3. **Verify workflows are running:**
   - Check n8n execution logs
   - W1.2 should run every 5 minutes
   - W1.3 should run every 2 minutes

## How This Prevents Future Issues

- **W1.2** will detect orders stuck > 30 minutes and mark them for retry/review
- **W1.3** will automatically retry failed orders when `next_retry_at` arrives
- **Webhook handlers** (already fixed) prevent new orders from getting stuck

## Files Modified

- `docs/n8n-workflow-files/finals/LHB - 1.2- Stuck Workflow Manager.json`
- `docs/n8n-workflow-files/finals/LHB - 1.3- Retry Recovery Manager.json`

