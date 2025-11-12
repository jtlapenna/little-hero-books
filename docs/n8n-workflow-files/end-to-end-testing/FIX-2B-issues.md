# Fix 2B Workflow Issues

## Issue 1: 2B Triggered Twice

**Problem:** The router's "Mark as Processing (2B)" node doesn't verify the PATCH succeeded before triggering. If the order was already claimed by another router cycle, it still triggers 2B.

**Solution:** Add a conditional check after "Mark as Processing (2B)" to verify the PATCH returned data. Only trigger if the order was successfully claimed.

### Fix for Router (W1.1)

**Add a new Code node after "Mark as Processing (2B)":**

**Node Name:** "Verify Order Claimed (2B)"

**Code:**
```javascript
// Verify Order Claimed (2B)
// Check if the PATCH to "Mark as Processing" succeeded
// If it returned 0 rows, the order was already claimed by another router cycle

const markResult = $input.first().json || {};

// Supabase PATCH with Prefer: return=representation returns an array
// If the order was successfully claimed, we get an array with 1 object
// If it was already claimed, we get an empty array []

const isArray = Array.isArray(markResult);
const hasData = isArray ? markResult.length > 0 : (markResult && Object.keys(markResult).length > 0);

if (!hasData) {
  console.log('⚠️ Order already claimed by another router cycle - skipping trigger');
  return []; // Return empty to stop execution
}

// Extract the order data
const orderData = isArray ? markResult[0] : markResult;

console.log('✅ Order successfully claimed - proceeding to trigger');
console.log(`Order ID: ${orderData.amazon_order_id || orderData.orderId}`);
console.log(`Execution Status: ${orderData.execution_status}`);
console.log(`Current Workflow: ${orderData.current_workflow}`);

// Pass through the original routing data with the claimed order info
return [{
  json: {
    ...$('Prep 2B Orders').first().json, // Get original routing data
    orderDbId: orderData.id || $('Prep 2B Orders').first().json.orderDbId,
    claimedAt: orderData.started_at,
    claimed: true
  }
}];
```

**Connection:** 
- "Mark as Processing (2B)" → "Verify Order Claimed (2B)" → "Trigger 2B Workflow"

**Alternative (Simpler):** Add an IF node that checks if the response has data:
- **IF node:** Check `={{ Array.isArray($json) ? $json.length > 0 : Object.keys($json).length > 0 }}`
- **True path:** Continue to "Trigger 2B Workflow"
- **False path:** Stop (empty output)

---

## Issue 2: Supabase Upsert 404 Error

**Problem:** The "Supabase Upsert 2B" node is using the wrong URL:
- **Current (WRONG):** `https://admin.littleherolabs.com/api/rest/v1/orders`
- **Should be:** `https://mdnthwpcnphjnnblbvxk.supabase.co/rest/v1/orders`

**Solution:** Update the URL in the "Supabase Upsert 2B" node.

### Fix for 2B Workflow

**Node:** "Supabase Upsert 2B"

**Current URL:**
```
https://admin.littleherolabs.com/api/rest/v1/orders?on_conflict=amazon_order_id
```

**New URL:**
```
https://mdnthwpcnphjnnblbvxk.supabase.co/rest/v1/orders?on_conflict=amazon_order_id
```

**Also verify headers:**
- `apikey`: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs`
- `Authorization`: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs`
- `Content-type`: `application/json`
- `Prefer`: `resolution=merge-duplicates,return=representation`

---

## Summary

1. **Router (W1.1):** Add verification after "Mark as Processing (2B)" to prevent duplicate triggers
2. **2B Workflow:** Fix Supabase URL from backend API to direct Supabase endpoint

