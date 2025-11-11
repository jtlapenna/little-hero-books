# W0 Testing Guide - Step by Step

## Overview
This guide walks through testing W0 (Order Intake Validation) with a mock order, verifying phone number capture, manifest creation, and Supabase integration.

## Prerequisites

- [ ] W0 workflow imported to n8n
- [ ] Supabase credentials configured in W0 CONFIG node
- [ ] R2 credentials configured (or use Fallback path)
- [ ] `queue_status` view created in Supabase
- [ ] Router workflow ready (but don't activate yet)

## Step 1: Prepare Mock Order Data

### Option A: Use Mock Order Node (Recommended)

Add a Code node before CONFIG in W0 with this code:

```javascript
// Mock Order Generator for Testing
const mockOrder = {
  amazonOrderId: "TEST-ORDER-E2E-001",
  orderId: "TEST-ORDER-E2E-001",
  orderDate: new Date().toISOString(),
  customerEmail: "test@littleherolabs.com",
  status: "queued_for_processing",
  characterSpecs: {
    childName: "Emma",
    age: 5,
    skinTone: "light",
    hairColor: "blonde",
    hairStyle: "long",
    pronouns: "she/her",
    favoriteColor: "purple",
    animalGuide: "dragon",
    clothingStyle: "adventure"
  },
  bookSpecs: {
    title: "Emma and the Adventure Compass",
    totalPages: 16,
    format: "8.5x8.5_softcover",
    bookType: "adventure"
  },
  orderDetails: {
    quantity: 1,
    shippingAddress: {
      name: "Jane Smith",
      address: "123 Main Street",
      city: "Portland",
      state: "OR",
      zip: "97201",
      phone: "+1-555-123-4567"  // CRITICAL: For Lulu API
    }
  },
  dedication: {
    raw: "For our little adventurer on her 5th birthday!",
    text: "For our little adventurer on her 5th birthday!",
    htmlSafe: "For our little adventurer on her 5th birthday!"
  }
};

return [{ json: mockOrder }];
```

### Option B: Use Manual Trigger with JSON

1. In W0, change Manual Trigger to accept JSON input
2. Paste the mock order JSON above

## Step 2: Configure W0

1. **CONFIG Node**: Fill in credentials
   - Supabase service key
   - R2 credentials (or leave for Fallback path)

2. **Choose Upload Path**:
   - **Path A**: Upload to R2 (if credentials configured)
   - **Path B**: Fallback (Skip Upload) - just creates manifest, no R2 upload

## Step 3: Execute W0

1. Click "Execute Workflow" in n8n
2. Watch execution logs for errors
3. Verify each node completes successfully

## Step 4: Verify Results

### 4.1 Check Manifest in R2 (if uploaded)

**If using R2 upload path:**
- Check R2 bucket: `little-hero-orders`
- Path: `book-mvp-simple-adventure/orders/TEST-ORDER-E2E-001/manifests/1-manifest.json`
- Verify phone number is present:
  ```json
  {
    "order": {
      "orderDetails": {
        "shippingAddress": {
          "phone": "+1-555-123-4567"
        }
      }
    }
  }
  ```

### 4.2 Check Supabase Order Record

Run this query in Supabase SQL Editor:

```sql
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  one_manifest_url,
  dedication_text,
  queued_at
FROM orders
WHERE amazon_order_id = 'TEST-ORDER-E2E-001';
```

**Expected Results:**
- `execution_status` = `'ready_for_processing'`
- `next_workflow` = `'2A'`
- `one_manifest_url` = `'book-mvp-simple-adventure/orders/TEST-ORDER-E2E-001/manifests/1-manifest.json'`
- `dedication_text` = `'For our little adventurer on her 5th birthday!'`
- `queued_at` = recent timestamp

### 4.3 Verify Phone Number in Manifest

**If manifest is in R2**, download and check:
```bash
# Or use Supabase to fetch if stored there
```

**If using Fallback path**, check the execution output:
- Look at "Build 1‑manifest.json" node output
- Verify `order.orderDetails.shippingAddress.phone` exists

## Step 5: Test Router Integration

### 5.1 Verify Order in Queue

Check the `queue_status` view:

```sql
SELECT * FROM queue_status;
```

Should show:
- `queued_count` >= 1 (your test order)
- `processing_count` = 0 (if nothing else running)

### 5.2 Activate Router (Optional - for full test)

1. Import updated router workflow
2. Activate W1.1 Router
3. Wait for next cycle (30 seconds)
4. Check router execution logs
5. Verify order is picked up and routed

**Note**: Don't activate router yet if workflows 2A/2B/3 aren't ready - the router will try to trigger them.

## Step 6: Verify Phone Number Flow

The phone number should be:
1. ✅ Captured in W0 "Normalize Payload"
2. ✅ Preserved in "Build 1‑manifest.json"
3. ✅ Stored in 1-manifest.json (R2 or execution output)
4. ✅ Available for W4 when it reads the manifest

## Common Issues & Fixes

### Issue: Phone number missing in manifest

**Check:**
- Mock order includes `shippingAddress.phone`
- "Normalize Payload" node executed successfully
- "Build 1‑manifest.json" preserved the phone field

**Fix:** Verify the phone field path in mock order matches what W0 expects

### Issue: Supabase insert fails

**Check:**
- Supabase service key is correct
- `amazon_order_id` is unique (delete test order if re-running)
- All required columns exist

**Fix:** Run migration if columns missing: `docs/database/migration-w0-w1-support.sql`

### Issue: Manifest not in R2

**Check:**
- R2 credentials configured correctly
- S3 node has proper credentials
- Or use Fallback path (no upload needed for testing)

**Fix:** Use Fallback path for initial testing, or verify R2 credentials

## Next Steps After W0 Test

Once W0 works:
1. ✅ Phone number captured and stored
2. ✅ Manifest created correctly
3. ✅ Supabase order record created
4. ✅ Order in `ready_for_processing` status

Then proceed to:
- Test router picks up the order
- Test router routes to correct workflow
- Test complete end-to-end flow

---

**Test Order ID**: Use unique IDs for each test run:
- `TEST-ORDER-E2E-001`
- `TEST-ORDER-E2E-002`
- etc.

This prevents conflicts if you re-run tests.

