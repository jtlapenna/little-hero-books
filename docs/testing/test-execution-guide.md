# Health Monitor Testing - Execution Guide

## Overview
This guide walks through testing all orphaned recovery actions and backend UI buttons.

---

## Phase 1: Test Orphaned Recovery Actions via Health Monitor

### Test 1: Create Manifest Action

**Step 1: Set up test order**
```sql
-- Run in Supabase SQL Editor
\i docs/database/test-orphaned-create-manifest.sql
```

**Step 2: Verify setup**
- Check that JESSICA-CUNT has:
  - `execution_status = 'error'`
  - `next_workflow = '4'`
  - `one_manifest_url = NULL`

**Step 3: Run Health Monitor cron**
- Go to Vercel Dashboard → Cron Jobs
- Click "Run" on the Health Monitor cron job
- OR manually trigger: `POST https://admin.littleherolabs.com/api/cron/health-monitor` with header `x-cron-secret: <your-secret>`

**Step 4: Check n8n execution**
- Go to n8n → Executions
- Find the latest Health Monitor execution
- Verify:
  - "Orphaned: Classify Orphans" outputs action = `create_manifest`
  - "IF: Create Manifest Only" routes the order
  - "Orphaned: Recover: Create Manifest" succeeds
  - "Merge: All Paths Results" includes the order

**Step 5: Verify results in Supabase**
```sql
-- Run in Supabase SQL Editor
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  one_manifest_url,
  error_message,
  error_type,
  updated_at
FROM orders
WHERE amazon_order_id = 'JESSICA-CUNT';
```

**Expected Results:**
- ✅ `execution_status = 'ready_for_processing'`
- ✅ `next_workflow = '2A'`
- ✅ `one_manifest_url` is NOT NULL (should be `book-mvp-simple-adventure/orders/JESSICA-CUNT/manifests/1-manifest.json`)
- ✅ `error_message` and `error_type` are NULL

**Step 6: Verify manifest in R2**
- Check Cloudflare R2 bucket
- Verify file exists: `book-mvp-simple-adventure/orders/JESSICA-CUNT/manifests/1-manifest.json`
- Verify manifest structure is correct

---

### Test 2: Schedule Retry Action (via Orphaned Path)

**Step 1: Set up test order**
```sql
-- Run in Supabase SQL Editor
\i docs/database/test-orphaned-schedule-retry.sql
```

**Step 2: Verify setup**
- Check that JOHN-TEST4 has:
  - `execution_status = 'error'`
  - `retry_count = 1` (less than 3)
  - `next_retry_at = NULL`

**Step 3: Run Health Monitor cron**
- Same as Test 1, Step 3

**Step 4: Check n8n execution**
- Verify:
  - "Orphaned: Classify Orphans" outputs action = `schedule_retry`
  - "IF: Schedule Retry Only" routes the order
  - "Orphaned: Recover: Schedule Retry" succeeds
  - "Merge: All Paths Results" includes the order

**Step 5: Verify results in Supabase**
```sql
SELECT 
  amazon_order_id,
  execution_status,
  retry_count,
  next_retry_at,
  error_message,
  error_type,
  current_workflow,
  started_at,
  updated_at
FROM orders
WHERE amazon_order_id = 'JOHN-TEST4';
```

**Expected Results:**
- ✅ `execution_status = 'ready_for_processing'`
- ✅ `retry_count = 2` (incremented from 1)
- ✅ `next_retry_at` is set to ~5 minutes from execution time
- ✅ `error_message` and `error_type` are NULL
- ✅ `current_workflow` and `started_at` are NULL

---

### Test 3: Manual Review Action

**Step 1: Set up test orders**
```sql
-- Run in Supabase SQL Editor
\i docs/database/test-orphaned-manual-review.sql
```

**Step 2: Verify setup**
- Check that all three orders are set up correctly:
  - JESSICA-CUNT: `retry_count = 3` (max retries)
  - JOHN-TEST4: `execution_status = 'error_requires_manual_review'`, `updated_at` > 24 hours ago
  - JOHN-TEST5: `next_workflow = '4'`, `one_manifest_url = NULL`, `queued_at` > 1 hour ago

**Step 3: Run Health Monitor cron**
- Same as Test 1, Step 3

**Step 4: Check n8n execution**
- Verify:
  - "Orphaned: Classify Orphans" outputs action = `require_manual_review` for all three
  - "IF: Manual Review Only" routes all three orders
  - "Orphaned: Recover: Mark for Manual Review" succeeds for all
  - "Merge: All Paths Results" includes all three orders

**Step 5: Verify results in Supabase**
```sql
SELECT 
  amazon_order_id,
  execution_status,
  requires_human_review,
  error_message,
  error_type,
  retry_count,
  updated_at
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
ORDER BY amazon_order_id;
```

**Expected Results:**
- ✅ All three orders have `execution_status = 'error_requires_manual_review'`
- ✅ All three orders have `requires_human_review = true`
- ✅ All three orders have `error_message = 'Orphaned order: Max retries exceeded or stuck. Requires manual intervention.'`
- ✅ All three orders have `error_type = 'orphaned_order'`

---

### Test 4: Reset Processing Action (Already Tested, Re-verify)

**Step 1: Set up test order**
```sql
-- Use JOHN-TEST5
UPDATE orders
SET 
  execution_status = 'ready_for_processing',
  error_type = NULL,
  error_message = NULL,
  next_workflow = '2A',
  one_manifest_url = 'book-mvp-simple-adventure/orders/JOHN-TEST5/manifests/1-manifest.json',
  retry_count = 0,
  next_retry_at = NULL,
  current_workflow = NULL,
  started_at = NULL,
  queued_at = NOW() - INTERVAL '2 hours',
  updated_at = NOW()
WHERE amazon_order_id = 'JOHN-TEST5';
```

**Step 2: Run Health Monitor cron and verify**
- Same process as above
- Verify order is reset correctly

---

## Phase 2: Test Backend UI Buttons

### Test 1: Create Manifest Button

**Step 1: Find or create test order**
- Navigate to `/orders` page
- Find an order that:
  - Does NOT have `oneManifestUrl` (button will be visible)
  - Has `character_specs` and `product_info` in Supabase (required for manifest creation)

**Step 2: Navigate to order detail page**
- Click on the order to open detail page
- Scroll to "Recovery Actions" section (yellow banner)

**Step 3: Click "Create Manifest" button**
- Click the button
- Confirm the dialog
- Wait for the request to complete

**Step 4: Verify results**
- Check that:
  - Success alert appears: "Manifest created successfully! Order has been reset to ready_for_processing."
  - Page refreshes automatically
  - Order status shows `execution_status = 'ready_for_processing'`
  - `oneManifestUrl` is now populated
  - `next_workflow = '2A'`

**Step 5: Verify in Supabase**
```sql
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  one_manifest_url,
  updated_at
FROM orders
WHERE amazon_order_id = '<your-test-order-id>';
```

**Step 6: Verify manifest in R2**
- Check Cloudflare R2 bucket
- Verify file exists at the path specified in `one_manifest_url`

---

### Test 2: Reset Order Button

**Step 1: Find or create test order**
- Navigate to `/orders` page
- Find an order that:
  - Has `execution_status = 'error'` OR `'error_requires_manual_review'`
  - Button will be visible in "Recovery Actions" section

**Step 2: Navigate to order detail page**
- Click on the order to open detail page
- Scroll to "Recovery Actions" section

**Step 3: Click "Reset Order" button**
- Click the button
- Confirm the dialog
- Wait for the request to complete

**Step 4: Verify results**
- Check that:
  - Success alert appears: "Order reset successfully!"
  - Page refreshes automatically
  - Order status shows `execution_status = 'ready_for_processing'`
  - Error fields are cleared
  - `next_workflow` is set appropriately (if `one_manifest_url` exists, should be '2A')

**Step 5: Verify in Supabase**
```sql
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  error_message,
  error_type,
  retry_count,
  next_retry_at,
  current_workflow,
  started_at,
  updated_at
FROM orders
WHERE amazon_order_id = '<your-test-order-id>';
```

**Expected Results:**
- ✅ `execution_status = 'ready_for_processing'`
- ✅ `error_message` and `error_type` are NULL
- ✅ `retry_count = 0`
- ✅ `next_retry_at` is NULL
- ✅ `current_workflow` and `started_at` are NULL
- ✅ `next_workflow` is set correctly (based on `one_manifest_url`)

---

## Verification Script

After all tests, run the comprehensive verification:

```sql
-- Run in Supabase SQL Editor
\i docs/database/verify-health-monitor-results.sql
```

This will show:
- All processed orders
- Orders that may have been missed
- Orders with potential issues

---

## Troubleshooting

### Health Monitor cron not running
- Check Vercel cron job is enabled
- Verify `CRON_SECRET` environment variable is set
- Check Vercel function logs for errors

### n8n workflow not receiving data
- Check webhook URL is correct in Vercel cron route
- Verify `N8N_HEALTH_MONITOR_WEBHOOK_URL` environment variable
- Check n8n webhook is active and listening for POST requests

### Orders not being classified correctly
- Check `get_orphaned_orders()` RPC function output
- Verify order data matches expected conditions
- Check n8n "Orphaned: Classify Orphans" node output

### Backend buttons not working
- Check browser console for errors
- Verify API routes are accessible
- Check Supabase credentials are configured
- Verify order has required data (e.g., `character_specs` for Create Manifest)

