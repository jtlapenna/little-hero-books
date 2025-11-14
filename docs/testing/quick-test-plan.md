# Quick Testing Plan - Remaining Features

## Test 1: Schedule Retry Action (Orphaned Path)

**Step 1: Set up test order**
```sql
-- Run in Supabase SQL Editor
\i docs/database/test-orphaned-schedule-retry.sql
```

**Step 2: Run Health Monitor cron**
- Vercel Dashboard → Cron Jobs → Health Monitor → "Run"

**Step 3: Verify in Supabase**
```sql
SELECT 
  amazon_order_id,
  execution_status,
  retry_count,
  next_retry_at,
  error_message
FROM orders
WHERE amazon_order_id = 'JOHN-TEST4';
```
**Expected:** `retry_count = 2`, `next_retry_at` set to ~5 min from now, `execution_status = 'ready_for_processing'`

---

## Test 2: Manual Review Action (Orphaned Path)

**Step 1: Set up test orders**
```sql
-- Run in Supabase SQL Editor
\i docs/database/test-orphaned-manual-review.sql
```

**Step 2: Run Health Monitor cron**
- Vercel Dashboard → Cron Jobs → Health Monitor → "Run"

**Step 3: Verify in Supabase**
```sql
SELECT 
  amazon_order_id,
  execution_status,
  requires_human_review,
  error_type,
  error_message
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5');
```
**Expected:** All have `execution_status = 'error_requires_manual_review'`, `requires_human_review = true`

---

## Test 3: Create Manifest Button (Backend UI)

**Step 1: Find test order**
- Navigate to `/orders` page
- Find an order with `oneManifestUrl = null` (button will be visible)

**Step 2: Test button**
- Click order → Order detail page
- Scroll to "Recovery Actions" section
- Click "Create Manifest" button
- Confirm dialog

**Step 3: Verify**
- Success alert appears
- Page refreshes
- Check Supabase: `one_manifest_url` is populated, `execution_status = 'ready_for_processing'`

---

## Test 4: Reset Order Button (Backend UI)

**Step 1: Find test order**
- Navigate to `/orders` page
- Find an order with `executionStatus = 'error'` or `'error_requires_manual_review'`

**Step 2: Test button**
- Click order → Order detail page
- Scroll to "Recovery Actions" section
- Click "Reset Order" button
- Confirm dialog

**Step 3: Verify**
- Success alert appears
- Page refreshes
- Check Supabase: `execution_status = 'ready_for_processing'`, error fields cleared

---

## Final Verification

**Run comprehensive check:**
```sql
-- Run in Supabase SQL Editor
\i docs/database/verify-health-monitor-results.sql
```

**Check n8n executions:**
- Go to n8n → Executions
- Review latest Health Monitor runs for any errors

---

## Summary

✅ **Completed:**
- Create Manifest action (orphaned path)

⏳ **Remaining:**
1. Schedule Retry action (orphaned path)
2. Manual Review action (orphaned path)
3. Create Manifest button (backend UI)
4. Reset Order button (backend UI)

