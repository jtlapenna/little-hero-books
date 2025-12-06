# w4 Audit - Print Fulfillment (CRITICAL)

**Date:** 2024-12-06  
**Status:** ✅ Complete  
**Effort:** 2-3 hours

---

## Summary

w4 sends orders to Lulu for printing. **CRITICAL:** Currently THROWS ERROR if shipping_address is NULL. Must be modified to gracefully skip orders without customer data.

**Changes:** 1 node (critical)  
**Customer Data:** shipping_address (REQUIRED for Lulu API)

---

## Findings

### Build Lulu Print Job Payload (P0-CRITICAL, 1-2h)

**Customer Data:** shipping_address.phone_number (REQUIRED)  
**Current Behavior:** 
```javascript
if(!shipping_address?.phone_number){
  throw new Error('Build Lulu Print Job Payload: shipping_address.phone_number is required');
}
```

**Issue:** Throws error and crashes workflow if shipping_address is null

**Fix:** Add pre-flight check BEFORE this node to skip orders without shipping data

**Change Needed:**
Add new node BEFORE "Build Lulu Print Job Payload":

```javascript
// Pre-flight Check for Customer Data
const shipping = $json.shippingAddress || $json.shipping_address;

if (!shipping || !shipping.phone_number) {
  // Log and skip order - needs CSV upload
  console.log('⚠️ Order ' + $json.orderId + ' missing shipping data - skipping print fulfillment');
  
  // Update Supabase: set status to pending_customer_data
  // (Supabase node would go here)
  
  // Exit workflow gracefully (use IF node to route to "skip" path)
  return [null]; // or route to logging/notification node
}

// If we have shipping data, continue to Lulu
return [$json];
```

**Alternative:** Use IF node before "Build Lulu Print Job Payload":
- Condition: `{{ $json.shippingAddress.phone_number }}` exists
- TRUE path → Continue to Lulu
- FALSE path → Log and skip (update status in Supabase)

---

### Other Nodes (No Changes)

**Validate & Normalize W4 Input:**
- Reads shipping_address but doesn't require it
- Can handle null gracefully

**Hydrate Order Details:**
- Fetches shipping_address from Supabase/manifest
- Returns empty object if missing
- No changes needed

---

## Implementation Options

**Option 1 (Recommended): Add IF Node**
1. Before "Build Lulu Print Job Payload", add IF node
2. Condition: `$json.shippingAddress && $json.shippingAddress.phone_number`
3. TRUE → Continue to Lulu
4. FALSE → Route to "Skip Order" node that:
   - Logs: "Order X awaiting customer data"
   - Updates Supabase status
   - Exits gracefully

**Option 2: Modify Build Payload Node**
Change the error throw to a graceful exit:
```javascript
if(!shipping_address?.phone_number){
  console.log('⚠️ Missing shipping - order ' + (j.orderId || 'unknown') + ' needs CSV upload');
  return [null]; // Skip this order
}
```

---

## Testing

- [ ] Order with NULL shipping_address → skips gracefully, logs warning
- [ ] Order with shipping_address BUT missing phone → skips gracefully
- [ ] Order with complete shipping_address → submits to Lulu successfully
- [ ] Verify Supabase status updated for skipped orders
- [ ] After CSV upload populates shipping → order processes on next run

---

## Critical Notes

- Lulu API **REQUIRES** phone_number in shipping_address
- Cannot submit to print without this field
- Orders will queue until CSV upload populates customer data
- w1.1 router will retry w4 for orders in appropriate status
