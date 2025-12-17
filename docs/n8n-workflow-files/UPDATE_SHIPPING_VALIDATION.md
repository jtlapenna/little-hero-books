# Update Shipping Validation in w1.1 Workflow

## Problem
The current validation only checks for new field names (`address_line_1`, `postal_code`, `state_code`) but orders may have old field names (`address`, `zip`, `state`). This causes valid orders to be incorrectly flagged as missing shipping.

## Solution
Replace the "Validate Shipping for w4" IF node with a Code node that checks for BOTH old and new field name formats.

## Steps to Update n8n Workflow

### Option 1: Replace IF Node with Code Node (Recommended)

1. **Delete the existing "Validate Shipping for w4" IF node**
   - This is the node with 5 conditions checking for `address_line_1`, `postal_code`, `state_code`, `city`, and `name`

2. **Add a new Code node** named "Validate Shipping for w4"
   - Place it in the same position (between "Prep Workflow 4 Orders" and the routing branches)
   - Set it to have 2 outputs: "Has Shipping" and "Missing Shipping"

3. **Copy the code from `validate-shipping-code-node.js`** into the Code node

4. **Connect the outputs:**
   - "Has Shipping" output → Connect to the existing "True Branch" path (continues to w4)
   - "Missing Shipping" output → Connect to the existing "False Branch" path (flags missing shipping)

### Option 2: Update IF Node Conditions (Alternative)

If you prefer to keep the IF node, update each condition to check for both field name formats:

**Current condition for address:**
```
{{ $json.shipping_address.address_line_1 }} is not empty
```

**Updated condition for address:**
```
{{ $json.shipping_address.address_line_1 || $json.shipping_address.address }} is not empty
```

**Current condition for postal code:**
```
{{ $json.shipping_address.postal_code }} is not empty
```

**Updated condition for postal code:**
```
{{ $json.shipping_address.postal_code || $json.shipping_address.zip }} is not empty
```

**Current condition for state:**
```
{{ $json.shipping_address.state_code }} is not empty
```

**Updated condition for state:**
```
{{ $json.shipping_address.state_code || $json.shipping_address.state }} is not empty
```

## Testing

After updating:
1. Test with an order that has old field names (`address`, `zip`, `state`) - should pass validation
2. Test with an order that has new field names (`address_line_1`, `postal_code`, `state_code`) - should pass validation
3. Test with an order that has no shipping_address - should fail validation and be flagged
4. Verify that flagged orders appear in both Supabase (error_type = 'missing_shipping') and backend logs

## Backend Endpoint

The backend endpoint `/api/internal/orders/[orderId]/flags/missing-shipping` has been created and requires:
- `BACKEND_INTERNAL_TOKEN` environment variable set
- Authorization header: `Bearer <BACKEND_INTERNAL_TOKEN>`

Make sure to update the n8n workflow to use the actual token instead of `<BACKEND_INTERNAL_TOKEN>` placeholder.

