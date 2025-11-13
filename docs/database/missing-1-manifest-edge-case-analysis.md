# Missing 1-manifest.json Edge Case Analysis

## Current Situation

**JOHN-TEST4** has:
- `execution_status = 'ready_for_processing'`
- `next_workflow = '4'`
- `one_manifest_url = NULL` ⚠️
- Router constructs manifest key but manifest doesn't exist in R2

## How 1-manifest.json is Created

**Normal Flow:**
1. **W0 (Order Intake)** receives order from Amazon
2. **W0** builds `1-manifest.json` with order data
3. **W0** uploads manifest to R2: `book-mvp-simple-adventure/orders/{orderId}/manifests/1-manifest.json`
4. **W0** stores R2 key in Supabase `one_manifest_url` field
5. **W0** sets `execution_status = 'ready_for_processing'` and `next_workflow = '2A'`

**Router Behavior:**
- Router's "Prep Workflow 4 Orders" constructs `oneManifestKey` from hardcoded prefix
- Router's "Get Signed URL (1-manifest)-W4" requires `oneManifestKey` and will fail if manifest doesn't exist
- Workflow 4 will fail when trying to access non-existent manifest

## Could This Happen in Production?

### Scenario 1: W0 Partial Failure ✅ **YES - LIKELY**
- W0 creates order in Supabase
- W0 fails during R2 upload (network error, timeout, etc.)
- Order exists in Supabase with `one_manifest_url = NULL`
- Order is queued but can't be processed

### Scenario 2: Manual Order Creation ✅ **YES - POSSIBLE**
- Admin creates order directly in Supabase (for testing, manual entry, etc.)
- No W0 execution = no manifest created
- Order stuck in queue

### Scenario 3: R2 Upload Failure ✅ **YES - POSSIBLE**
- W0 uploads manifest but R2 returns error
- W0 doesn't detect error and continues
- Order created but manifest missing

### Scenario 4: Data Corruption ✅ **YES - RARE**
- Manifest deleted from R2 accidentally
- Database record still exists
- Order stuck

### Scenario 5: Test Orders ✅ **YES - CURRENT CASE**
- Test orders created directly in Supabase
- No W0 execution
- Missing manifest

## Impact Analysis

**Current Impact:**
- Order stuck in `ready_for_processing` status
- Router picks it up but workflow fails
- Order becomes orphaned
- No automatic recovery

**Production Impact:**
- Customer order stuck
- No error notification
- Manual intervention required
- Potential customer service issue

## Options

### Option 1: Ignore & Delete Test Order ❌ **NOT RECOMMENDED**
**Pros:**
- Quick fix for current test order
- No code changes needed

**Cons:**
- Doesn't solve production edge case
- Will happen again in production
- No prevention or recovery mechanism
- Customer orders could get stuck

**Verdict:** Not recommended - this WILL happen in production

---

### Option 2: Router Validation - Skip Orders Without Manifest ✅ **RECOMMENDED**
**Approach:**
- Add validation in router's "Prep Workflow 4 Orders" node
- Check if manifest exists in R2 before routing
- If missing, mark order as `error` with descriptive error message
- Skip routing to workflow 4

**Implementation:**
```javascript
// In "Prep Workflow 4 Orders" node
// Before routing, check if manifest exists
const manifestKey = `${prefix}/${order.amazon_order_id}/manifests/1-manifest.json`;
try {
  // Quick check: try to get signed URL (will fail if manifest doesn't exist)
  const checkUrl = await fetch(`https://admin.littleherolabs.com/api/r2/signed-url?key=${manifestKey}`);
  if (!checkUrl.ok) {
    // Manifest doesn't exist - mark as error
    console.warn(`⚠️ Manifest missing for ${order.amazon_order_id} - skipping workflow 4`);
    // Update order to error status
    // Skip routing
    return [];
  }
} catch (error) {
  // Manifest check failed - mark as error
  // Skip routing
  return [];
}
```

**Pros:**
- Prevents workflow failures
- Catches issue early
- Marks order for manual review
- Prevents infinite retry loops

**Cons:**
- Adds latency (R2 check)
- Requires error handling in router

**Verdict:** Recommended - prevents failures downstream

---

### Option 3: Workflow 4 Error Handling ✅ **RECOMMENDED**
**Approach:**
- Add error handling in Workflow 4's "Get Signed URL" node
- If manifest doesn't exist, mark order as `error_requires_manual_review`
- Add descriptive error message
- Don't retry (manifest won't appear magically)

**Implementation:**
```javascript
// In "Get Signed URL (1-manifest)-W4" node
try {
  // ... existing signed URL logic ...
} catch (error) {
  if (error.message.includes('404') || error.message.includes('Not Found')) {
    // Manifest doesn't exist - mark order for manual review
    // Update Supabase: execution_status = 'error_requires_manual_review'
    // error_message = '1-manifest.json not found in R2. Order may have been created without running W0.'
    // Skip workflow 4 execution
    return [];
  }
  throw error; // Re-throw other errors
}
```

**Pros:**
- Catches issue at workflow level
- Marks order for manual review
- Prevents infinite retries
- Clear error message for admin

**Cons:**
- Order still gets routed (wasted router cycle)
- Error happens later in process

**Verdict:** Recommended as backup - catches what router validation misses

---

### Option 4: W1.4 Orphaned Orders Monitor Enhancement ✅ **RECOMMENDED**
**Approach:**
- Enhance W1.4 to detect orders with `next_workflow = '3' or '4'` but missing `one_manifest_url`
- Mark as orphaned with specific reason: `missing_1_manifest`
- Add to orphaned orders page with clear message
- Admin can manually create manifest or reset order

**Implementation:**
- Add to `get_orphaned_orders()` function:
```sql
-- Orders ready for workflow 3 or 4 but missing manifest
WHEN execution_status = 'ready_for_processing' 
     AND next_workflow IN ('3', '4')
     AND one_manifest_url IS NULL
THEN 'missing_1_manifest'::TEXT
```

**Pros:**
- Catches issue automatically
- Shows in admin UI
- Clear action for admin
- Works for both test and production orders

**Cons:**
- Detection happens after order is stuck
- Doesn't prevent the issue

**Verdict:** Recommended - good monitoring/alerting

---

### Option 5: W0 Validation - Require Manifest Before Queuing ✅ **RECOMMENDED**
**Approach:**
- In W0, verify manifest upload succeeded before setting `execution_status = 'ready_for_processing'`
- If upload fails, mark order as `error` with descriptive message
- Don't queue order until manifest exists

**Implementation:**
```javascript
// In W0 "Upload 1-manifest.json to R2" node
// After upload, verify it exists
const verifyUrl = await fetch(`https://admin.littleherolabs.com/api/r2/signed-url?key=${r2Key}`);
if (!verifyUrl.ok) {
  // Upload failed - mark order as error
  // Don't set execution_status = 'ready_for_processing'
  throw new Error('Manifest upload verification failed');
}
```

**Pros:**
- Prevents issue at source
- No orphaned orders
- Clear error if W0 fails
- Best prevention

**Cons:**
- Adds latency to W0
- Requires error handling

**Verdict:** Highly recommended - prevents issue at source

---

## Recommended Solution: Multi-Layer Defense

**Layer 1: Prevention (W0)**
- ✅ Validate manifest upload before queuing order
- ✅ Don't set `ready_for_processing` if manifest missing

**Layer 2: Router Validation**
- ✅ Check manifest exists before routing to workflow 3/4
- ✅ Skip routing if missing, mark as error

**Layer 3: Workflow Error Handling**
- ✅ Catch missing manifest errors in workflow 3/4
- ✅ Mark order for manual review with clear message

**Layer 4: Monitoring (W1.4)**
- ✅ Detect orders with missing manifests
- ✅ Show in orphaned orders page
- ✅ Clear action for admin

**Layer 5: Admin UI**
- ✅ Show warning badge for orders with missing manifests
- ✅ Provide "Create Manifest" or "Reset Order" actions

## For Current Test Order

**Immediate Action:**
1. Delete JOHN-TEST4 (test order, not production)
2. Keep JOHN-TEST5 for testing (has manifest)

**Long-term:**
- Implement multi-layer defense above
- This WILL happen in production - need proper handling

## Questions to Consider

1. **Should we allow manual order creation without W0?**
   - If yes, need manifest creation workflow
   - If no, add validation to prevent it

2. **What's the recovery path for missing manifests?**
   - Can admin manually create manifest?
   - Or should order be reset to re-run W0?

3. **Should we auto-retry W0 if manifest is missing?**
   - Could be transient R2 issue
   - Or permanent data issue

4. **How do we notify admin of missing manifests?**
   - Orphaned orders page?
   - Email/Slack alert?
   - Dashboard badge?

